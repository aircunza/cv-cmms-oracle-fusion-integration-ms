import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

@Injectable()
export class OperationUpdatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: any) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWoId || !payload.oclWoOperationId) {
      return;
    }

    if (!payload.changedFields || Object.keys(payload.changedFields).length === 0) {
      return;
    }

    try {
      const oraclePayload = this.mapOperationFieldsToOracle(payload.changedFields);

      await this.oracleApiClient.updateOperation(
        payload.oclWoId,
        payload.oclWoOperationId,
        oraclePayload,
      );

      await this.prisma.oracleWoOperations.updateMany({
        where: { oclWoOperationId: payload.oclWoOperationId },
        data: { updatedAt: new Date() },
      });

      console.log(`✅ Operation ${payload.operationCode} updated in Oracle`);
    } catch (error: any) {
      console.error(`❌ Failed to update operation ${payload.operationCode} in Oracle:`, error?.message || error);
      throw new RpcException({
        status: 500,
        message: `Failed to update operation ${payload.operationCode} in Oracle: ${error?.message}`,
      });
    }
  }

  private mapOperationFieldsToOracle(changedFields: any): any {
    const oraclePayload: any = {};

    if (changedFields.operationName) oraclePayload.OperationName = changedFields.operationName;
    if (changedFields.operationDescription) oraclePayload.OperationDescription = changedFields.operationDescription;
    if (changedFields.operationType) oraclePayload.OperationType = changedFields.operationType === 'Supplier' ? 'OSP' : 'Internal';
    if (changedFields.actualStartDate) oraclePayload.PlannedStartDate = this.formatDate(changedFields.actualStartDate);
    if (changedFields.actualCompletionDate) oraclePayload.PlannedCompletionDate = this.formatDate(changedFields.actualCompletionDate);

    return oraclePayload;
  }

  private formatDate(date: string): string {
    if (!date) return '';
    return new Date(date).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  }
}
