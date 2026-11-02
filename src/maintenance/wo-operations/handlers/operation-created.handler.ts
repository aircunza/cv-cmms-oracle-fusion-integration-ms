import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface OperationCreatedEvent {
  payload?: string | OperationCreatedPayload;
}

interface OperationCreatedPayload {
  enableOracleWorkOrder?: string;
  oclWoId?: number;
  oclWoNumber?: string;
  workOrderCode: number;
  operationCode: number;
  operation?: {
    operationName?: string;
    operationDescription?: string;
    operationSeqNumber?: number;
    operationType?: string;
    oracleOperationType?: string;
    workCenterCode?: string;
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

    const parentWo = await this.prisma.oracleWorkOrders.findUnique({
      where: { workOrderCode: BigInt(payload.workOrderCode) },
    });

    if (!parentWo?.oclWoId) {
      // La WO padre aún no existe en Oracle: no se puede crear la operación.
      throw new RpcException({
        status: 409,
        message: `Work order ${payload.workOrderCode} is not synced to Oracle yet; operation ${payload.operationCode} not created`,
      });
    }

    const oclWoId = Number(parentWo.oclWoId);
    const oclWoNumber =
      payload.oclWoNumber ?? parentWo.oclWoNumber ?? undefined;
    const woOperationCodeBigInt = BigInt(payload.operationCode);

    try {
      await this.ensureWorkOrderDatesCoverOperation(
        oclWoId,
        payload.operation?.actualStartDate,
        payload.operation?.actualCompletionDate,
      );

      const oraclePayload = this.mapOperationToOracle(
        payload.operation,
        payload.isLastOperation,
      );

      const oracleOperation = (await this.oracleApiClient.createOperation(
        oclWoId,
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
          oclWoId,
          oclWoNumber,
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
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        response?: { status?: number; data?: unknown };
      };
      const oracleDetail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : undefined;
      console.error(
        `[wo.operation.created] failed operation ${payload.operationCode}`,
        {
          status: err?.response?.status,
          oracleResponse: err?.response?.data,
          message: err?.message || error,
        },
      );
      throw new RpcException({
        status: 500,
        message: `Failed to sync operation ${payload.operationCode} to Oracle: ${err?.message}${oracleDetail ? ` - ${oracleDetail}` : ''}`,
      });
    }
  }

  private mapOperationToOracle(
    operation: OperationCreatedPayload['operation'],
    isLastOperation: boolean | undefined,
  ): Record<string, unknown> {
    return {
      OperationName: operation?.operationName?.substring(0, 120),
      OperationDescription: operation?.operationDescription?.substring(0, 240),
      OperationSequenceNumber: operation?.operationSeqNumber,
      OperationType:
        operation?.oracleOperationType ??
        (operation?.operationType === 'Supplier' ? 'OSP' : 'Internal'),
      WorkCenterCode: operation?.workCenterCode,
      PlannedStartDate: this.formatDate(operation?.actualStartDate),
      PlannedCompletionDate: this.formatDate(operation?.actualCompletionDate),
      CountPointOperationFlag: isLastOperation,
    };
  }

  /**
   * Oracle rechaza la operation (WIE-4425443) si sus fechas planificadas
   * quedan fuera del rango planificado de la work order. Si el rango actual
   * no la cubre, se amplía la WO con PATCH antes de crear la operation.
   */
  private async ensureWorkOrderDatesCoverOperation(
    oclWoId: number,
    opStart: string | undefined,
    opEnd: string | undefined,
  ): Promise<void> {
    if (!opStart || !opEnd) return;

    const opStartMs = new Date(opStart).getTime();
    const opEndMs = new Date(opEnd).getTime();
    if (Number.isNaN(opStartMs) || Number.isNaN(opEndMs)) return;

    const wo = (await this.oracleApiClient.getWorkOrderById(
      String(oclWoId),
    )) as { PlannedStartDate?: string; PlannedCompletionDate?: string };

    const woStartMs = wo?.PlannedStartDate
      ? new Date(wo.PlannedStartDate).getTime()
      : NaN;
    const woEndMs = wo?.PlannedCompletionDate
      ? new Date(wo.PlannedCompletionDate).getTime()
      : NaN;

    const newStartMs = Number.isNaN(woStartMs)
      ? opStartMs
      : Math.min(woStartMs, opStartMs);
    const newEndMs = Number.isNaN(woEndMs)
      ? opEndMs
      : Math.max(woEndMs, opEndMs);

    const changed = newStartMs !== woStartMs || newEndMs !== woEndMs;

    if (!changed) return;

    await this.oracleApiClient.updateWorkOrder(oclWoId, {
      PlannedStartDate: this.formatDate(new Date(newStartMs).toISOString()),
      PlannedCompletionDate: this.formatDate(new Date(newEndMs).toISOString()),
    });
  }

  private formatDate(date: string | undefined): string {
    if (!date) return '';
    return new Date(date).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  }
}
