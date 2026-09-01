import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from 'src/prisma.service';
import { OracleFusionWorkOrderApiClient } from '../common/oracle-fusion-work-order-api-client';

function stripLinks(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripLinks);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key !== 'links') {
        result[key] = stripLinks(value);
      }
    }
    return result;
  }
  return obj;
}

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async getSyncStatus(workOrderCode: number) {
    const record = await this.prisma.oracleWorkOrders.findFirst({
      where: { workOrderCode: BigInt(workOrderCode) },
    });

    if (!record) {
      return {
        syncStatus: {
          workOrderCode,
          oracleWorkOrderId: null,
          oracleWorkOrderNumber: null,
          syncStatus: 'not_enabled',
          lastSyncAttempt: null,
          syncError: null,
          retryCount: 0,
        },
      };
    }

    return {
      syncStatus: {
        workOrderCode: record.workOrderCode,
        oracleWorkOrderId: record.oclWoId,
        oracleWorkOrderNumber: record.oclWoNumber,
        syncStatus: record.syncStatus,
        lastSyncAttempt: record.lastSyncAttempt,
        syncError: record.syncError,
        retryCount: record.retryCount,
      },
    };
  }

  async getOracleWorkOrder(workOrderCode: number) {
    const record = await this.prisma.oracleWorkOrders.findFirst({
      where: { workOrderCode: BigInt(workOrderCode) },
    });

    if (!record) {
      throw new RpcException({
        status: 404,
        message: 'Work order not found in Oracle sync table',
      });
    }

    if (!record.oclWoId) {
      throw new RpcException({
        status: 409,
        message: 'Work order has not been synced to Oracle',
      });
    }

    try {
      const oclWoId = Number(record.oclWoId);
      const workOrder = (await this.oracleApiClient.getWorkOrderById(
        String(oclWoId),
      )) as Record<string, unknown>;

      const operationsResponse =
        (await this.oracleApiClient.getWorkOrderOperations(oclWoId)) as {
          items: Record<string, unknown>[];
        };

      const operations = operationsResponse.items ?? [];

      const operationsWithDetails = await Promise.all(
        operations.map(async (op) => {
          const opId = op.WoOperationId as number;
          const [materialsResponse, resourcesResponse] = await Promise.all([
            this.oracleApiClient
              .getOperationMaterials(oclWoId, opId)
              .catch(() => ({ items: [] })),
            this.oracleApiClient
              .getOperationResources(oclWoId, opId)
              .catch(() => ({ items: [] })),
          ]);

          const materials =
            (materialsResponse as { items: unknown[] }).items ?? [];
          const resources =
            (resourcesResponse as { items: unknown[] }).items ?? [];

          return {
            ...op,
            WorkOrderOperationMaterial: materials,
            WorkOrderOperationResource: resources,
          };
        }),
      );

      return stripLinks({
        ...workOrder,
        WorkOrderOperation: operationsWithDetails,
      });
    } catch (error) {
      console.error('Error fetching work order from Oracle:', error);
      throw new RpcException({
        status: 502,
        message: 'Failed to fetch work order from Oracle Fusion',
      });
    }
  }

  async getOracleWorkOrderOperations(workOrderCode: number) {
    const record = await this.prisma.oracleWorkOrders.findFirst({
      where: { workOrderCode: BigInt(workOrderCode) },
    });

    if (!record) {
      throw new RpcException({
        status: 404,
        message: 'Work order not found in Oracle sync table',
      });
    }

    if (!record.oclWoId) {
      throw new RpcException({
        status: 409,
        message: 'Work order has not been synced to Oracle',
      });
    }

    try {
      const oclWoId = Number(record.oclWoId);
      const operationsResponse =
        (await this.oracleApiClient.getWorkOrderOperations(oclWoId)) as {
          items: Record<string, unknown>[];
        };

      const operations = operationsResponse.items ?? [];

      const operationsWithDetails = await Promise.all(
        operations.map(async (op) => {
          const opId = op.WoOperationId as number;
          const [materialsResponse, resourcesResponse] = await Promise.all([
            this.oracleApiClient
              .getOperationMaterials(oclWoId, opId)
              .catch(() => ({ items: [] })),
            this.oracleApiClient
              .getOperationResources(oclWoId, opId)
              .catch(() => ({ items: [] })),
          ]);

          const materials =
            (materialsResponse as { items: unknown[] }).items ?? [];
          const resources =
            (resourcesResponse as { items: unknown[] }).items ?? [];

          return {
            ...op,
            WorkOrderOperationMaterial: materials,
            WorkOrderOperationResource: resources,
          };
        }),
      );

      return stripLinks(operationsWithDetails);
    } catch (error) {
      console.error('Error fetching work order operations from Oracle:', error);
      throw new RpcException({
        status: 502,
        message: 'Failed to fetch work order operations from Oracle Fusion',
      });
    }
  }

  async getOracleOperationMaterials(
    workOrderCode: number,
    operationCode: number,
  ) {
    const woRecord = await this.prisma.oracleWorkOrders.findFirst({
      where: { workOrderCode: BigInt(workOrderCode) },
    });

    if (!woRecord) {
      throw new RpcException({
        status: 404,
        message: 'Work order not found in Oracle sync table',
      });
    }

    if (!woRecord.oclWoId) {
      throw new RpcException({
        status: 409,
        message: 'Work order has not been synced to Oracle',
      });
    }

    const opRecord = await this.prisma.oracleWoOperations.findFirst({
      where: {
        workOrderCode: BigInt(workOrderCode),
        woOperationCode: BigInt(operationCode),
      },
    });

    if (!opRecord) {
      throw new RpcException({
        status: 404,
        message: 'Operation not found in Oracle sync table',
      });
    }

    if (!opRecord.oclWoOperationId) {
      throw new RpcException({
        status: 409,
        message: 'Operation has not been synced to Oracle',
      });
    }

    try {
      const materialsResponse =
        (await this.oracleApiClient.getOperationMaterials(
          Number(woRecord.oclWoId),
          Number(opRecord.oclWoOperationId),
        )) as { items: unknown[] };
      return stripLinks(materialsResponse.items ?? []);
    } catch (error) {
      console.error('Error fetching operation materials from Oracle:', error);
      throw new RpcException({
        status: 502,
        message: 'Failed to fetch operation materials from Oracle Fusion',
      });
    }
  }

  async getOracleOperationResources(
    workOrderCode: number,
    operationCode: number,
  ) {
    const woRecord = await this.prisma.oracleWorkOrders.findFirst({
      where: { workOrderCode: BigInt(workOrderCode) },
    });

    if (!woRecord) {
      throw new RpcException({
        status: 404,
        message: 'Work order not found in Oracle sync table',
      });
    }

    if (!woRecord.oclWoId) {
      throw new RpcException({
        status: 409,
        message: 'Work order has not been synced to Oracle',
      });
    }

    const opRecord = await this.prisma.oracleWoOperations.findFirst({
      where: {
        workOrderCode: BigInt(workOrderCode),
        woOperationCode: BigInt(operationCode),
      },
    });

    if (!opRecord) {
      throw new RpcException({
        status: 404,
        message: 'Operation not found in Oracle sync table',
      });
    }

    if (!opRecord.oclWoOperationId) {
      throw new RpcException({
        status: 409,
        message: 'Operation has not been synced to Oracle',
      });
    }

    try {
      const resourcesResponse =
        (await this.oracleApiClient.getOperationResources(
          Number(woRecord.oclWoId),
          Number(opRecord.oclWoOperationId),
        )) as { items: unknown[] };
      return stripLinks(resourcesResponse.items ?? []);
    } catch (error) {
      console.error('Error fetching operation resources from Oracle:', error);
      throw new RpcException({
        status: 502,
        message: 'Failed to fetch operation resources from Oracle Fusion',
      });
    }
  }
}
