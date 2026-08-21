import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

@Injectable()
export class WorkOrderFieldsUpdatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: any) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWoId) {
      return;
    }

    if (!payload.changedFields || Object.keys(payload.changedFields).length === 0) {
      return;
    }

    try {
      await this.oracleApiClient.updateWorkOrder(payload.oclWoId, payload.changedFields);

      await this.prisma.oracleWorkOrders.updateMany({
        where: { oclWoId: payload.oclWoId },
        data: {
          updatedAt: new Date(),
        },
      });

      console.log(`✅ Work Order ${payload.workOrderCode} fields updated in Oracle`);
    } catch (error: any) {
      console.error(`❌ Failed to update Work Order ${payload.workOrderCode} in Oracle:`, error?.message || error);

      await this.prisma.oracleWorkOrders.updateMany({
        where: { oclWoId: payload.oclWoId },
        data: {
          syncStatus: 'failed',
          syncError: error?.message || 'Unknown error',
          retryCount: { increment: 1 },
          lastSyncAttempt: new Date(),
        },
      });

      throw new RpcException({
        status: 500,
        message: `Failed to update Work Order ${payload.workOrderCode} in Oracle: ${error?.message}`,
      });
    }
  }
}
