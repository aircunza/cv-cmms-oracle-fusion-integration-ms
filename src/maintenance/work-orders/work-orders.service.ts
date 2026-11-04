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

  async getIntegrationWorkOrder(workOrderCode: number) {
    const [result] = await this.getIntegrationWorkOrdersByCodes([
      workOrderCode,
    ]);
    return result;
  }

  async getIntegrationWorkOrdersByCodes(workOrderCodes: number[]) {
    const uniqueCodes = [...new Set(workOrderCodes.map((c) => Number(c)))];
    const codes = uniqueCodes.map((c) => BigInt(c));

    const workOrders = await this.prisma.oracleWorkOrders.findMany({
      where: { workOrderCode: { in: codes } },
    });

    const operations = await this.prisma.oracleWoOperations.findMany({
      where: { workOrderCode: { in: codes } },
      orderBy: { woOperationCode: 'asc' },
    });

    const operationCodes = operations.map((op) => op.woOperationCode);

    const materials = await this.prisma.oracleWoOperationMaterials.findMany({
      where: { woOperationCode: { in: operationCodes } },
      orderBy: { materialSequenceNumber: 'asc' },
    });

    const humanResources =
      await this.prisma.oracleWoOperationHumanResources.findMany({
        where: { woOperationCode: { in: operationCodes } },
        orderBy: { resourceSequenceNumber: 'asc' },
      });

    const workOrderByCode = new Map(
      workOrders.map((wo) => [wo.workOrderCode.toString(), wo]),
    );

    const materialsByOperation = new Map<string, typeof materials>();
    for (const material of materials) {
      const key = material.woOperationCode.toString();
      materialsByOperation.set(key, [
        ...(materialsByOperation.get(key) ?? []),
        material,
      ]);
    }

    const resourcesByOperation = new Map<string, typeof humanResources>();
    for (const resource of humanResources) {
      const key = resource.woOperationCode.toString();
      resourcesByOperation.set(key, [
        ...(resourcesByOperation.get(key) ?? []),
        resource,
      ]);
    }

    const operationsByWorkOrder = new Map<string, typeof operations>();
    for (const op of operations) {
      const key = op.workOrderCode.toString();
      operationsByWorkOrder.set(key, [
        ...(operationsByWorkOrder.get(key) ?? []),
        op,
      ]);
    }

    return uniqueCodes.map((code) => {
      const key = code.toString();
      const wo = workOrderByCode.get(key);

      if (!wo) {
        return { workOrderCode: key, status: 'not_found' as const };
      }

      return {
        workOrderCode: key,
        status: 'found' as const,
        oracleWorkOrderId: wo.oclWoId,
        oracleWorkOrderNumber: wo.oclWoNumber,
        oracleWorkOrderStatusCode: wo.oclWoStatusCode,
        syncStatus: wo.syncStatus,
        syncError: wo.syncError,
        retryCount: wo.retryCount,
        lastSyncAttempt: wo.lastSyncAttempt,
        createdAt: wo.createdAt,
        updatedAt: wo.updatedAt,
        operations: (operationsByWorkOrder.get(key) ?? []).map((op) => {
          const opKey = op.woOperationCode.toString();
          return {
            woOperationCode: opKey,
            oracleOperationId: op.oclWoOperationId,
            oracleOperationName: op.oclOperationName,
            oracleOperationDescription: op.oclOperationDescription,
            syncStatus: op.syncStatus,
            syncError: op.syncError,
            retryCount: op.retryCount,
            lastSyncAttempt: op.lastSyncAttempt,
            createdAt: op.createdAt,
            updatedAt: op.updatedAt,
            materials: (materialsByOperation.get(opKey) ?? []).map((m) => ({
              materialSequenceNumber: m.materialSequenceNumber,
              oracleOperationMaterialId: m.oclWoOperationMaterialId,
              syncStatus: m.syncStatus,
              syncError: m.syncError,
              retryCount: m.retryCount,
              lastSyncAttempt: m.lastSyncAttempt,
              createdAt: m.createdAt,
              updatedAt: m.updatedAt,
            })),
            humanResources: (resourcesByOperation.get(opKey) ?? []).map(
              (r) => ({
                resourceSequenceNumber: r.resourceSequenceNumber,
                resourceCode: r.resourceCode,
                oracleOperationResourceId: r.oclWoOperationResourceId,
                syncStatus: r.syncStatus,
                syncError: r.syncError,
                retryCount: r.retryCount,
                lastSyncAttempt: r.lastSyncAttempt,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              }),
            ),
          };
        }),
      };
    });
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
