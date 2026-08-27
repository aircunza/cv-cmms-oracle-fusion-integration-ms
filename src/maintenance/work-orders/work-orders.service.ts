import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

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
}
