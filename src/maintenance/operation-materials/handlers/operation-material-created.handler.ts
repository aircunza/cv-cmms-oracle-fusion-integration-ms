import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface MaterialCreatedEvent {
  payload?: string | MaterialCreatedPayload;
}

interface MaterialCreatedPayload {
  enableOracleWorkOrder?: string;
  workOrderCode: number;
  operationCode: number;
  requiredDate?: string;
  material: {
    materialSequenceNumber: number;
    materialCode: string;
    quantity?: number;
    supplyType?: string;
  };
}

interface OracleMaterialResponse {
  WoOperationMaterialId?: number;
}

@Injectable()
export class OperationMaterialCreatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: MaterialCreatedEvent) {
    const payload: MaterialCreatedPayload =
      typeof event.payload === 'string'
        ? (JSON.parse(event.payload) as MaterialCreatedPayload)
        : (event.payload as MaterialCreatedPayload);

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    // Los IDs de Oracle no viajan en el evento: se resuelven desde las tablas
    // de integración (la WO y la operación ya deben estar sincronizadas).
    const parentWo = await this.prisma.oracleWorkOrders.findUnique({
      where: { workOrderCode: BigInt(payload.workOrderCode) },
    });
    const parentOp = await this.prisma.oracleWoOperations.findUnique({
      where: { woOperationCode: BigInt(payload.operationCode) },
    });

    if (!parentWo?.oclWoId || !parentOp?.oclWoOperationId) {
      throw new RpcException({
        status: 409,
        message: `Operation ${payload.operationCode} is not synced to Oracle yet; material ${payload.material.materialSequenceNumber} not created`,
      });
    }

    const oclWoId = Number(parentWo.oclWoId);
    const oclWoOperationId = Number(parentOp.oclWoOperationId);
    const woOperationCodeBigInt = BigInt(payload.operationCode);
    const materialSequenceNumber = payload.material.materialSequenceNumber;

    try {
      // Fusion no acepta ItemNumber en el hijo WorkOrderOperationMaterial;
      // el campo válido es InventoryItemNumber (mismo que usa WO create).
      const oraclePayload = {
        InventoryItemNumber: payload.material.materialCode,
        MaterialSequenceNumber: materialSequenceNumber,
        Quantity: payload.material.quantity,
        SupplyType: payload.material.supplyType ?? '1',
        // Fusion exige RequiredDate: se usa la fecha inicial de la operación.
        RequiredDate: this.formatDate(payload.requiredDate),
      };

      const oracleMaterial =
        (await this.oracleApiClient.createOperationMaterial(
          oclWoId,
          oclWoOperationId,
          oraclePayload,
        )) as OracleMaterialResponse;

      if (!oracleMaterial?.WoOperationMaterialId) {
        throw new Error('Oracle API did not return WoOperationMaterialId');
      }

      await this.prisma.oracleWoOperationMaterials.upsert({
        where: {
          woOperationCode_materialSequenceNumber: {
            woOperationCode: woOperationCodeBigInt,
            materialSequenceNumber,
          },
        },
        create: {
          oclWoId: BigInt(oclWoId),
          oclWoOperationId: BigInt(oclWoOperationId),
          oclWoOperationMaterialId: BigInt(
            oracleMaterial.WoOperationMaterialId,
          ),
          woOperationCode: woOperationCodeBigInt,
          materialSequenceNumber,
          syncStatus: 'synced',
          retryCount: 0,
          lastSyncAttempt: new Date(),
        },
        update: {
          oclWoOperationMaterialId: BigInt(
            oracleMaterial.WoOperationMaterialId,
          ),
          syncStatus: 'synced',
          retryCount: 0,
          syncError: null,
          lastSyncAttempt: new Date(),
        },
      });
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        response?: { status?: number; data?: unknown };
      };
      console.error(
        `[operation.material.created] material ${payload.material.materialCode} failed for operation ${payload.operationCode}:`,
        {
          status: err?.response?.status,
          oracleResponse: JSON.stringify(err?.response?.data),
          message: err?.message || error,
        },
      );
      await this.prisma.oracleWoOperationMaterials.upsert({
        where: {
          woOperationCode_materialSequenceNumber: {
            woOperationCode: woOperationCodeBigInt,
            materialSequenceNumber,
          },
        },
        create: {
          oclWoId: BigInt(oclWoId),
          oclWoOperationId: BigInt(oclWoOperationId),
          woOperationCode: woOperationCodeBigInt,
          materialSequenceNumber,
          syncStatus: 'failed',
          syncError: err?.message ?? String(error),
          retryCount: 1,
          lastSyncAttempt: new Date(),
        },
        update: {
          syncStatus: 'failed',
          syncError: err?.message ?? String(error),
          retryCount: { increment: 1 },
          lastSyncAttempt: new Date(),
        },
      });
      throw new RpcException({
        status: 500,
        message: `Failed to sync material to Oracle: ${err?.message}`,
      });
    }
  }

  private formatDate(date: string | undefined): string | undefined {
    if (!date) return undefined;
    return new Date(date).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  }
}
