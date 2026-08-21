import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

@Injectable()
export class WorkOrderCreatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: any) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.workOrderCode) {
      console.warn(`Cannot create Work Order in Oracle: no workOrderCode found`);
      return;
    }

    const existing = await this.prisma.oracleWorkOrders.findFirst({
      where: { workOrderCode: payload.workOrderCode },
    });

    if (existing) {
      console.warn(`Work Order ${payload.workOrderCode} already synced to Oracle, skipping`);
      return;
    }

    try {
      await this.prisma.oracleWorkOrders.create({
        data: {
          workOrderCode: payload.workOrderCode,
          syncStatus: 'pending',
          retryCount: 0,
        },
      });

      const oracleResponse = await this.oracleApiClient.createWorkOrder(payload.payload);

      if (!oracleResponse?.WorkOrderId) {
        throw new Error('Oracle API did not return WorkOrderId for created Work Order');
      }

      await this.prisma.oracleWorkOrders.updateMany({
        where: { workOrderCode: payload.workOrderCode },
        data: {
          oclWoId: oracleResponse.WorkOrderId,
          oclWoNumber: oracleResponse.WorkOrderNumber,
          oclWoStatusCode: oracleResponse.WorkOrderStatusCode,
          syncStatus: 'synced',
          lastSyncAttempt: new Date(),
        },
      });

      console.log(`✅ Work Order ${payload.workOrderCode} synced to Oracle (oclWoId: ${oracleResponse.WorkOrderId})`);
    } catch (error: any) {
      console.error(`❌ Failed to create Work Order ${payload.workOrderCode} in Oracle:`, error?.message || error);

      await this.prisma.oracleWorkOrders.updateMany({
        where: { workOrderCode: payload.workOrderCode, syncStatus: 'pending' },
        data: {
          syncStatus: 'failed',
          syncError: error?.message || 'Unknown error',
          retryCount: { increment: 1 },
          lastSyncAttempt: new Date(),
        },
      });

      throw new RpcException({
        status: 500,
        message: `Failed to sync Work Order ${payload.workOrderCode} to Oracle: ${error?.message}`,
      });
    }
  }
}
