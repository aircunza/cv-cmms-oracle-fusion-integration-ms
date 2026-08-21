import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

@Injectable()
export class OperationHrDeletedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: any) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWoId || !payload.oclWoOperationId || !payload.oclWoOperationResourceId) {
      return;
    }

    try {
      await this.oracleApiClient.deleteOperationResource(
        payload.oclWoId,
        payload.oclWoOperationId,
        payload.oclWoOperationResourceId,
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

      console.log(`✅ HR ${payload.resourceCode || payload.resourceSequenceNumber} deleted from Oracle`);
    } catch (error: any) {
      console.error(`❌ Failed to delete HR from Oracle:`, error?.message || error);
      throw new RpcException({
        status: 500,
        message: `Failed to delete HR from Oracle: ${error?.message}`,
      });
    }
  }
}
