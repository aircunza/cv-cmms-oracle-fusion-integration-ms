import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface WorkOrderEvent {
  enableOracleWorkOrder?: string;
  workOrderCode?: number;
  payload?: Record<string, unknown>;
  operationCodes?: number[];
}

interface OracleResource {
  WoOperationResourceId?: number;
  ResourceSequenceNumber?: number;
  ResourceCode?: string;
  ResourceId?: number;
}

interface OracleMaterial {
  WoOperationMaterialId?: number;
  MaterialSequenceNumber?: number;
  InventoryItemNumber?: string;
}

interface OracleOperation {
  WoOperationId?: number;
  OperationName?: string;
  OperationDescription?: string;
  OperationSequenceNumber?: number;
  WorkOrderOperationMaterial?: OracleMaterial[];
  WorkOrderOperationResource?: OracleResource[];
}

interface OracleWorkOrderResponse {
  WorkOrderId?: number;
  WorkOrderNumber?: string;
  WorkOrderStatusCode?: string;
  WorkOrderOperation?: OracleOperation[];
}

@Injectable()
export class WorkOrderCreatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: string | WorkOrderEvent) {
    const raw: WorkOrderEvent =
      typeof event === 'string' ? (JSON.parse(event) as WorkOrderEvent) : event;

    if (raw.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!raw.workOrderCode) {
      console.warn(
        `Cannot create Work Order in Oracle: no workOrderCode found`,
      );
      return;
    }

    const workOrderCode = raw.workOrderCode;
    const workOrderCodeBigInt = BigInt(workOrderCode);
    const operationCodes = raw.operationCodes ?? [];

    try {
      await this.prisma.oracleWorkOrders.upsert({
        where: { workOrderCode: workOrderCodeBigInt },
        create: {
          workOrderCode: workOrderCodeBigInt,
          syncStatus: 'pending',
          retryCount: 0,
        },
        update: {
          syncStatus: 'pending',
          retryCount: 0,
          syncError: null,
        },
      });

      const oracleResponse = (await this.oracleApiClient.createWorkOrder(
        raw.payload,
      )) as OracleWorkOrderResponse;

      if (!oracleResponse?.WorkOrderId) {
        throw new Error(
          'Oracle API did not return WorkOrderId for created Work Order',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.oracleWorkOrders.updateMany({
          where: { workOrderCode: workOrderCodeBigInt },
          data: {
            oclWoId: oracleResponse.WorkOrderId,
            oclWoNumber: oracleResponse.WorkOrderNumber,
            oclWoStatusCode: oracleResponse.WorkOrderStatusCode,
            syncStatus: 'synced',
            lastSyncAttempt: new Date(),
          },
        });

        const oracleOperations = oracleResponse.WorkOrderOperation ?? [];

        for (let i = 0; i < oracleOperations.length; i++) {
          const oracleOp = oracleOperations[i];
          const woOperationCode = operationCodes[i]
            ? BigInt(operationCodes[i])
            : null;

          if (!woOperationCode || !oracleOp.WoOperationId) {
            continue;
          }

          await tx.oracleWoOperations.upsert({
            where: { woOperationCode },
            create: {
              oclWoId: oracleResponse.WorkOrderId!,
              oclWoNumber: oracleResponse.WorkOrderNumber,
              oclWoOperationId: oracleOp.WoOperationId,
              oclOperationName: oracleOp.OperationName,
              oclOperationDescription: oracleOp.OperationDescription,
              workOrderCode: workOrderCodeBigInt,
              woOperationCode,
              syncStatus: 'synced',
              retryCount: 0,
              lastSyncAttempt: new Date(),
            },
            update: {
              oclWoOperationId: oracleOp.WoOperationId,
              oclOperationName: oracleOp.OperationName,
              oclOperationDescription: oracleOp.OperationDescription,
              syncStatus: 'synced',
              retryCount: 0,
              syncError: null,
              lastSyncAttempt: new Date(),
            },
          });

          const materials = oracleOp.WorkOrderOperationMaterial ?? [];
          for (const oracleMat of materials) {
            if (
              !oracleMat.WoOperationMaterialId ||
              !oracleMat.MaterialSequenceNumber
            ) {
              continue;
            }

            await tx.oracleWoOperationMaterials.upsert({
              where: {
                woOperationCode_materialSequenceNumber: {
                  woOperationCode,
                  materialSequenceNumber: oracleMat.MaterialSequenceNumber,
                },
              },
              create: {
                oclWoId: oracleResponse.WorkOrderId!,
                oclWoOperationId: oracleOp.WoOperationId,
                oclWoOperationMaterialId: oracleMat.WoOperationMaterialId,
                woOperationCode,
                materialSequenceNumber: oracleMat.MaterialSequenceNumber,
                syncStatus: 'synced',
                retryCount: 0,
                lastSyncAttempt: new Date(),
              },
              update: {
                oclWoOperationMaterialId: oracleMat.WoOperationMaterialId,
                syncStatus: 'synced',
                retryCount: 0,
                syncError: null,
                lastSyncAttempt: new Date(),
              },
            });
          }

          const resources = oracleOp.WorkOrderOperationResource ?? [];
          for (const oracleRes of resources) {
            if (!oracleRes.WoOperationResourceId) {
              continue;
            }

            const resourceCode =
              oracleRes.ResourceCode ?? `RES-${oracleRes.ResourceId}`;
            const resourceSequenceNumber =
              oracleRes.ResourceSequenceNumber ?? 0;

            await tx.oracleWoOperationHumanResources.upsert({
              where: {
                woOperationCode_resourceCode: {
                  woOperationCode,
                  resourceCode,
                },
              },
              create: {
                oclWoId: oracleResponse.WorkOrderId!,
                oclWoOperationId: oracleOp.WoOperationId,
                oclWoOperationResourceId: oracleRes.WoOperationResourceId,
                woOperationCode,
                resourceSequenceNumber,
                resourceCode,
                syncStatus: 'synced',
                retryCount: 0,
                lastSyncAttempt: new Date(),
              },
              update: {
                oclWoOperationResourceId: oracleRes.WoOperationResourceId,
                resourceSequenceNumber,
                syncStatus: 'synced',
                retryCount: 0,
                syncError: null,
                lastSyncAttempt: new Date(),
              },
            });
          }
        }
      });
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(
        `Failed to create Work Order ${workOrderCode} in Oracle:`,
        err?.message || error,
      );

      await this.prisma.oracleWorkOrders.updateMany({
        where: { workOrderCode: workOrderCodeBigInt, syncStatus: 'pending' },
        data: {
          syncStatus: 'failed',
          syncError: err?.message || 'Unknown error',
          retryCount: { increment: 1 },
          lastSyncAttempt: new Date(),
        },
      });

      throw new RpcException({
        status: 500,
        message: `Failed to sync Work Order ${workOrderCode} to Oracle: ${err?.message}`,
      });
    }
  }
}
