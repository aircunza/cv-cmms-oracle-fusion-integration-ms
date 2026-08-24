import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface MaterialDeletedEvent {
  payload?: string | MaterialDeletedPayload;
}

interface MaterialDeletedPayload {
  enableOracleWorkOrder?: string;
  oclWoId?: number;
  oclWoOperationId?: number;
  oclWoOperationMaterialId?: number;
  operationCode?: number;
  materialSequenceNumber?: number;
}

@Injectable()
export class OperationMaterialDeletedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: MaterialDeletedEvent) {
    const payload: MaterialDeletedPayload =
      typeof event.payload === 'string'
        ? (JSON.parse(event.payload) as MaterialDeletedPayload)
        : (event.payload as MaterialDeletedPayload);

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (
      !payload.oclWoId ||
      !payload.oclWoOperationId ||
      !payload.oclWoOperationMaterialId
    ) {
      return;
    }

    const oclWoId = payload.oclWoId;
    const oclWoOperationId = payload.oclWoOperationId;
    const oclWoOperationMaterialId = payload.oclWoOperationMaterialId;

    try {
      await this.oracleApiClient.deleteOperationMaterial(
        oclWoId,
        oclWoOperationId,
        oclWoOperationMaterialId,
      );

      await this.prisma.oracleWoOperationMaterials.deleteMany({
        where: {
          woOperationCode: payload.operationCode,
          materialSequenceNumber: payload.materialSequenceNumber,
        },
      });

      console.log(
        `Material ${payload.materialSequenceNumber} deleted from Oracle`,
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(
        'Failed to delete material from Oracle:',
        err?.message || error,
      );
      throw new RpcException({
        status: 500,
        message: `Failed to delete material from Oracle: ${err?.message}`,
      });
    }
  }
}
