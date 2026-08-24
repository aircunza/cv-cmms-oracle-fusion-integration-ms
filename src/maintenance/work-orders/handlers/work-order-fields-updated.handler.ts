import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface FieldsUpdatedEvent {
  payload?: string | FieldsUpdatedPayload;
}

interface FieldsUpdatedPayload {
  enableOracleWorkOrder?: string;
  oclWoId?: number;
  workOrderCode?: number;
  changedFields?: Record<string, unknown>;
}

@Injectable()
export class WorkOrderFieldsUpdatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: FieldsUpdatedEvent) {
    const payload: FieldsUpdatedPayload =
      typeof event.payload === 'string'
        ? (JSON.parse(event.payload) as FieldsUpdatedPayload)
        : (event.payload ?? {});

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWoId) {
      return;
    }

    if (
      !payload.changedFields ||
      Object.keys(payload.changedFields).length === 0
    ) {
      return;
    }

    const oclWoId = payload.oclWoId;

    try {
      await this.oracleApiClient.updateWorkOrder(
        oclWoId,
        payload.changedFields,
      );

      await this.prisma.oracleWorkOrders.updateMany({
        where: { oclWoId },
        data: {
          updatedAt: new Date(),
        },
      });

      console.log(
        `Work Order ${payload.workOrderCode} fields updated in Oracle`,
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(
        `Failed to update Work Order ${payload.workOrderCode} in Oracle:`,
        err?.message || error,
      );

      await this.prisma.oracleWorkOrders.updateMany({
        where: { oclWoId },
        data: {
          syncStatus: 'failed',
          syncError: err?.message || 'Unknown error',
          retryCount: { increment: 1 },
          lastSyncAttempt: new Date(),
        },
      });

      throw new RpcException({
        status: 500,
        message: `Failed to update Work Order ${payload.workOrderCode} in Oracle: ${err?.message}`,
      });
    }
  }
}
