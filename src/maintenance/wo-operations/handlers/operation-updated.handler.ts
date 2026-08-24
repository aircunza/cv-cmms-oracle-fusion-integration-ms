import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface OperationUpdatedEvent {
  payload?: string | OperationUpdatedPayload;
}

interface OperationUpdatedPayload {
  enableOracleWorkOrder?: string;
  oclWoId?: number;
  oclWoOperationId?: number;
  operationCode?: number;
  changedFields?: Record<string, unknown>;
}

@Injectable()
export class OperationUpdatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: OperationUpdatedEvent) {
    const payload: OperationUpdatedPayload =
      typeof event.payload === 'string'
        ? (JSON.parse(event.payload) as OperationUpdatedPayload)
        : (event.payload as OperationUpdatedPayload);

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWoId || !payload.oclWoOperationId) {
      return;
    }

    if (
      !payload.changedFields ||
      Object.keys(payload.changedFields).length === 0
    ) {
      return;
    }

    const oclWoId = payload.oclWoId;
    const oclWoOperationId = payload.oclWoOperationId;

    try {
      const oraclePayload = this.mapOperationFieldsToOracle(
        payload.changedFields,
      );

      await this.oracleApiClient.updateOperation(
        oclWoId,
        oclWoOperationId,
        oraclePayload,
      );

      await this.prisma.oracleWoOperations.updateMany({
        where: { oclWoOperationId },
        data: { updatedAt: new Date() },
      });

      console.log(`Operation ${payload.operationCode} updated in Oracle`);
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(
        `Failed to update operation ${payload.operationCode} in Oracle:`,
        err?.message || error,
      );
      throw new RpcException({
        status: 500,
        message: `Failed to update operation ${payload.operationCode} in Oracle: ${err?.message}`,
      });
    }
  }

  private mapOperationFieldsToOracle(
    changedFields: Record<string, unknown>,
  ): Record<string, unknown> {
    const oraclePayload: Record<string, unknown> = {};

    if (changedFields.operationName)
      oraclePayload.OperationName = changedFields.operationName;
    if (changedFields.operationDescription)
      oraclePayload.OperationDescription = changedFields.operationDescription;
    if (changedFields.operationType)
      oraclePayload.OperationType =
        changedFields.operationType === 'Supplier' ? 'OSP' : 'Internal';
    if (changedFields.actualStartDate)
      oraclePayload.PlannedStartDate = this.formatDate(
        changedFields.actualStartDate as string,
      );
    if (changedFields.actualCompletionDate)
      oraclePayload.PlannedCompletionDate = this.formatDate(
        changedFields.actualCompletionDate as string,
      );

    return oraclePayload;
  }

  private formatDate(date: string): string {
    if (!date) return '';
    return new Date(date).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  }
}
