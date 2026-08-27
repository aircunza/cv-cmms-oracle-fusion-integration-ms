import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface WorkOrderEvent {
  enableOracleWorkOrder?: string;
  workOrderCode?: number;
  payload?: Record<string, unknown>;
}

interface OracleWorkOrderResponse {
  WorkOrderId?: number;
  WorkOrderNumber?: string;
  WorkOrderStatusCode?: string;
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

      await this.prisma.oracleWorkOrders.updateMany({
        where: { workOrderCode: workOrderCodeBigInt },
        data: {
          oclWoId: oracleResponse.WorkOrderId,
          oclWoNumber: oracleResponse.WorkOrderNumber,
          oclWoStatusCode: oracleResponse.WorkOrderStatusCode,
          syncStatus: 'synced',
          lastSyncAttempt: new Date(),
        },
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
