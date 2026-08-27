import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface OperationDeletedEvent {
  payload?: string | OperationDeletedPayload;
}

interface OperationDeletedPayload {
  enableOracleWorkOrder?: string;
  oclWoId?: number;
  oclWoOperationId?: number;
  operationCode?: number;
}

@Injectable()
export class OperationDeletedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: OperationDeletedEvent) {
    const payload: OperationDeletedPayload =
      typeof event.payload === 'string'
        ? (JSON.parse(event.payload) as OperationDeletedPayload)
        : (event.payload as OperationDeletedPayload);

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWoId || !payload.oclWoOperationId) {
      return;
    }

    const oclWoId = payload.oclWoId;
    const oclWoOperationId = payload.oclWoOperationId;

    try {
      await this.oracleApiClient.deleteOperation(oclWoId, oclWoOperationId);

      await this.prisma.oracleWoOperations.deleteMany({
        where: { woOperationCode: BigInt(payload.operationCode!) },
      });

      console.log(`Operation ${payload.operationCode} deleted from Oracle`);
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(
        `Failed to delete operation ${payload.operationCode} from Oracle:`,
        err?.message || error,
      );
      throw new RpcException({
        status: 500,
        message: `Failed to delete operation ${payload.operationCode} from Oracle: ${err?.message}`,
      });
    }
  }
}
