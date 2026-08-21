import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

@Injectable()
export class OperationCreatedHandler {
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
      console.warn(`Cannot create operation for WO ${payload.workOrderCode} in Oracle: no oclWoId found`);
      return;
    }

    const existing = await this.prisma.oracleWoOperations.findFirst({
      where: { woOperationCode: payload.operationCode },
    });

    if (existing) {
      console.warn(`Operation ${payload.operationCode} already synced to Oracle, skipping`);
      return;
    }

    try {
      const oraclePayload = this.mapOperationToOracle(payload.operation, payload.isLastOperation);

      const oracleOperation = await this.oracleApiClient.createOperation(payload.oclWoId, oraclePayload);

      if (!oracleOperation?.WoOperationId) {
        throw new Error('Oracle API did not return WoOperationId for created operation');
      }

      await this.prisma.oracleWoOperations.create({
        data: {
          oclWoId: payload.oclWoId,
          oclWoNumber: payload.oclWoNumber,
          oclWoOperationId: oracleOperation.WoOperationId,
          oclOperationName: oracleOperation.OperationName || payload.operation.operationName,
          oclOperationDescription: oracleOperation.OperationDescription || payload.operation.operationDescription,
          workOrderCode: payload.workOrderCode,
          woOperationCode: payload.operationCode,
          syncStatus: 'synced',
          retryCount: 0,
          lastSyncAttempt: new Date(),
        },
      });

      console.log(`✅ Operation ${payload.operationCode} synced to Oracle (oclWoOperationId: ${oracleOperation.WoOperationId})`);
    } catch (error: any) {
      console.error(`❌ Failed to create operation ${payload.operationCode} in Oracle:`, error?.message || error);
      throw new RpcException({
        status: 500,
        message: `Failed to sync operation ${payload.operationCode} to Oracle: ${error?.message}`,
      });
    }
  }

  private mapOperationToOracle(operation: any, isLastOperation: boolean): any {
    return {
      OperationName: operation.operationName,
      OperationDescription: operation.operationDescription,
      OperationSequenceNumber: operation.operationSeqNumber,
      OperationType: operation.operationType === 'Supplier' ? 'OSP' : 'Internal',
      PlannedStartDate: this.formatDate(operation.actualStartDate),
      PlannedCompletionDate: this.formatDate(operation.actualCompletionDate),
      CountPointOperationFlag: isLastOperation,
    };
  }

  private formatDate(date: string): string {
    if (!date) return '';
    return new Date(date).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  }
}
