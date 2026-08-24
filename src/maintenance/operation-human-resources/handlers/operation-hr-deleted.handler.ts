import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface OperationHrDeletedEvent {
  payload?: string | OperationHrDeletedPayload;
}

interface OperationHrDeletedPayload {
  enableOracleWorkOrder?: string;
  oclWoId?: number;
  oclWoOperationId?: number;
  oclWoOperationResourceId?: number;
  operationCode?: number;
  resourceCode?: string;
  resourceSequenceNumber?: number;
}

@Injectable()
export class OperationHrDeletedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: OperationHrDeletedEvent) {
    const payload: OperationHrDeletedPayload =
      typeof event.payload === 'string'
        ? (JSON.parse(event.payload) as OperationHrDeletedPayload)
        : (event.payload ?? {});

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (
      !payload.oclWoId ||
      !payload.oclWoOperationId ||
      !payload.oclWoOperationResourceId
    ) {
      return;
    }

    const oclWoId = payload.oclWoId;
    const oclWoOperationId = payload.oclWoOperationId;
    const oclWoOperationResourceId = payload.oclWoOperationResourceId;

    try {
      await this.oracleApiClient.deleteOperationResource(
        oclWoId,
        oclWoOperationId,
        oclWoOperationResourceId,
      );

      if (payload.resourceCode) {
        await this.prisma.oracleWoOperationHumanResources.deleteMany({
          where: {
            woOperationCode: payload.operationCode,
            resourceCode: payload.resourceCode,
          },
        });
      } else if (payload.resourceSequenceNumber) {
        await this.prisma.oracleWoOperationHumanResources.deleteMany({
          where: {
            woOperationCode: payload.operationCode,
            resourceSequenceNumber: payload.resourceSequenceNumber,
          },
        });
      }

      console.log(
        `HR ${payload.resourceCode || payload.resourceSequenceNumber} deleted from Oracle`,
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('Failed to delete HR from Oracle:', err?.message || error);
      throw new RpcException({
        status: 500,
        message: `Failed to delete HR from Oracle: ${err?.message}`,
      });
    }
  }
}
