import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

@Injectable()
export class OperationDeletedHandler {
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

    try {
      await this.oracleApiClient.deleteOperation(payload.oclWoId, payload.oclWoOperationId);

      await this.prisma.oracleWoOperations.deleteMany({
        where: { woOperationCode: payload.operationCode },
      });

      console.log(`✅ Operation ${payload.operationCode} deleted from Oracle`);
    } catch (error: any) {
      console.error(`❌ Failed to delete operation ${payload.operationCode} from Oracle:`, error?.message || error);
      throw new RpcException({
        status: 500,
        message: `Failed to delete operation ${payload.operationCode} from Oracle: ${error?.message}`,
      });
    }
  }
}
