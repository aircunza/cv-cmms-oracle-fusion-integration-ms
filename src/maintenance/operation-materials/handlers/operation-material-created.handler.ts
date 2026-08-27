import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface MaterialCreatedEvent {
  payload?: string | MaterialCreatedPayload;
}

interface MaterialCreatedPayload {
  enableOracleWorkOrder?: string;
  oclWoId: number;
  oclWoOperationId: number;
  operationCode: number;
  material: {
    materialSequenceNumber: number;
    materialCode?: string;
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

    if (!payload.oclWoId || !payload.oclWoOperationId) {
      console.warn(
        `Cannot create material for operation ${payload.operationCode}: missing oclWoId or oclWoOperationId`,
      );
      return;
    }

    const oclWoId = payload.oclWoId;
    const oclWoOperationId = payload.oclWoOperationId;
    const woOperationCodeBigInt = BigInt(payload.operationCode);
    const materialSequenceNumber = payload.material.materialSequenceNumber;

    try {
      const oraclePayload = {
        ItemNumber: payload.material.materialCode,
        MaterialSequenceNumber: payload.material.materialSequenceNumber,
        Quantity: payload.material.quantity,
        SupplyType: payload.material.supplyType,
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
          oclWoId,
          oclWoOperationId,
          oclWoOperationMaterialId: oracleMaterial.WoOperationMaterialId,
          woOperationCode: woOperationCodeBigInt,
          materialSequenceNumber,
          syncStatus: 'synced',
          retryCount: 0,
          lastSyncAttempt: new Date(),
        },
        update: {
          oclWoOperationMaterialId: oracleMaterial.WoOperationMaterialId,
          syncStatus: 'synced',
          retryCount: 0,
          syncError: null,
          lastSyncAttempt: new Date(),
        },
      });

      console.log(
        `Material ${payload.material.materialSequenceNumber} synced to Oracle`,
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(
        `Failed to create material for operation ${payload.operationCode}:`,
        err?.message || error,
      );
      throw new RpcException({
        status: 500,
        message: `Failed to sync material to Oracle: ${err?.message}`,
      });
    }
  }
}
