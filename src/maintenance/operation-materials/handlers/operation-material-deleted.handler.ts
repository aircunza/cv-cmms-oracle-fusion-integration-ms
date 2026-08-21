import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

@Injectable()
export class OperationMaterialDeletedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: any) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWoId || !payload.oclWoOperationId || !payload.oclWoOperationMaterialId) {
      return;
    }

    try {
      await this.oracleApiClient.deleteOperationMaterial(
        payload.oclWoId,
        payload.oclWoOperationId,
        payload.oclWoOperationMaterialId,
      );

      await this.prisma.oracleWoOperationMaterials.deleteMany({
        where: {
          woOperationCode: payload.operationCode,
          materialSequenceNumber: payload.materialSequenceNumber,
        },
      });

      console.log(`✅ Material ${payload.materialSequenceNumber} deleted from Oracle`);
    } catch (error: any) {
      console.error(`❌ Failed to delete material from Oracle:`, error?.message || error);
      throw new RpcException({
        status: 500,
        message: `Failed to delete material from Oracle: ${error?.message}`,
      });
    }
  }
}
