import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface OperationCreatedEvent {
  payload?: string | OperationCreatedPayload;
}

interface OperationCreatedPayload {
  enableOracleWorkOrder?: string;
  oclWoId: number;
  oclWoNumber?: string;
  workOrderCode: number;
  operationCode: number;
  operation?: {
    operationName?: string;
    operationDescription?: string;
    operationSeqNumber?: number;
    operationType?: string;
    actualStartDate?: string;
    actualCompletionDate?: string;
  };
  isLastOperation?: boolean;
}

interface OracleOperationResponse {
  WoOperationId?: number;
  OperationName?: string;
  OperationDescription?: string;
}

@Injectable()
export class OperationCreatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: OperationCreatedEvent) {
    const payload: OperationCreatedPayload =
      typeof event.payload === 'string'
        ? (JSON.parse(event.payload) as OperationCreatedPayload)
        : (event.payload as OperationCreatedPayload);

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWoId) {
      console.warn(
        `Cannot create operation for WO ${payload.workOrderCode} in Oracle: no oclWoId found`,
      );
      return;
    }

    const woOperationCodeBigInt = BigInt(payload.operationCode);

    try {
      const oraclePayload = this.mapOperationToOracle(
        payload.operation,
        payload.isLastOperation,
      );

      const oracleOperation = (await this.oracleApiClient.createOperation(
        payload.oclWoId,
        oraclePayload,
      )) as OracleOperationResponse;

      if (!oracleOperation?.WoOperationId) {
        throw new Error(
          'Oracle API did not return WoOperationId for created operation',
        );
      }

      await this.prisma.oracleWoOperations.upsert({
        where: { woOperationCode: woOperationCodeBigInt },
        create: {
          oclWoId: payload.oclWoId,
          oclWoNumber: payload.oclWoNumber,
          oclWoOperationId: oracleOperation.WoOperationId,
          oclOperationName:
            oracleOperation.OperationName || payload.operation?.operationName,
          oclOperationDescription:
            oracleOperation.OperationDescription ||
            payload.operation?.operationDescription,
          workOrderCode: BigInt(payload.workOrderCode),
          woOperationCode: woOperationCodeBigInt,
          syncStatus: 'synced',
          retryCount: 0,
          lastSyncAttempt: new Date(),
        },
        update: {
          oclWoOperationId: oracleOperation.WoOperationId,
          oclOperationName:
            oracleOperation.OperationName || payload.operation?.operationName,
          oclOperationDescription:
            oracleOperation.OperationDescription ||
            payload.operation?.operationDescription,
          syncStatus: 'synced',
          retryCount: 0,
          syncError: null,
          lastSyncAttempt: new Date(),
        },
      });

      console.log(
        `Operation ${payload.operationCode} synced to Oracle (oclWoOperationId: ${oracleOperation.WoOperationId})`,
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(
        `Failed to create operation ${payload.operationCode} in Oracle:`,
        err?.message || error,
      );
      throw new RpcException({
        status: 500,
        message: `Failed to sync operation ${payload.operationCode} to Oracle: ${err?.message}`,
      });
    }
  }

  private mapOperationToOracle(
    operation: OperationCreatedPayload['operation'],
    isLastOperation: boolean | undefined,
  ): Record<string, unknown> {
    return {
      OperationName: operation?.operationName,
      OperationDescription: operation?.operationDescription,
      OperationSequenceNumber: operation?.operationSeqNumber,
      OperationType:
        operation?.operationType === 'Supplier' ? 'OSP' : 'Internal',
      PlannedStartDate: this.formatDate(operation?.actualStartDate),
      PlannedCompletionDate: this.formatDate(operation?.actualCompletionDate),
      CountPointOperationFlag: isLastOperation,
    };
  }

  private formatDate(date: string | undefined): string {
    if (!date) return '';
    return new Date(date).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  }
}
