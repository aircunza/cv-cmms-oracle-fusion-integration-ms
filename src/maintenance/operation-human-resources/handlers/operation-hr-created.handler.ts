import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

@Injectable()
export class OperationHrCreatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: any) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWorkOrderId || !payload.oclWoOperationId) {
      console.warn(`Cannot create HR for operation ${payload.operationCode}: missing oclWorkOrderId or oclWoOperationId`);
      return;
    }

    const existing = await this.prisma.oracleWoOperationHumanResources.findFirst({
      where: {
        woOperationCode: payload.operationCode,
        resourceCode: payload.resourceCode,
      },
    });

    if (existing) {
      console.warn(`HR ${payload.resourceCode} for operation ${payload.operationCode} already synced, skipping`);
      return;
    }

    try {
      const oraclePayload: any = {
        ResourceCode: payload.resourceCode,
        PlannedStartDate: payload.plannedStartDate,
        PlannedCompletionDate: payload.plannedCompletionDate,
      };

      if (payload.resourceSequenceNumber !== undefined) {
        oraclePayload.ResourceSequenceNumber = payload.resourceSequenceNumber;
      }

      if (payload.usageRate !== undefined) {
        oraclePayload.UsageRate = payload.usageRate;
      }

      const oracleResource = await this.oracleApiClient.createOperationResource(
        payload.oclWorkOrderId,
        payload.oclWoOperationId,
        oraclePayload,
      );

      if (!oracleResource?.WoOperationResourceId) {
        throw new Error('Oracle API did not return WoOperationResourceId');
      }

      let resourceCode = payload.resourceCode;

      if (!oracleResource.ResourceCode) {
        try {
          const fullResourcesResponse = await this.oracleApiClient.getOperationResources(
            payload.oclWorkOrderId,
            payload.oclWoOperationId,
          );

          const fullResource = fullResourcesResponse?.items?.find(
            (r: any) => r.WoOperationResourceId === oracleResource.WoOperationResourceId,
          );

          if (fullResource?.ResourceCode) {
            resourceCode = fullResource.ResourceCode;
          }
        } catch (getError: any) {
          console.warn(`⚠️ Failed to GET complete resource from Oracle: ${getError?.message}`);
        }
      } else {
        resourceCode = oracleResource.ResourceCode;
      }

      await this.prisma.oracleWoOperationHumanResources.create({
        data: {
          oclWoId: payload.oclWorkOrderId,
          oclWoOperationId: payload.oclWoOperationId,
          oclWoOperationResourceId: oracleResource.WoOperationResourceId,
          woOperationCode: payload.operationCode,
          resourceSequenceNumber: payload.resourceSequenceNumber,
          resourceCode,
          syncStatus: 'synced',
          retryCount: 0,
          lastSyncAttempt: new Date(),
        },
      });

      console.log(`✅ HR ${payload.resourceCode} synced to Oracle`);
    } catch (error: any) {
      console.error(`❌ Failed to create HR for operation ${payload.operationCode}:`, error?.message || error);
      throw new RpcException({
        status: 500,
        message: `Failed to sync HR to Oracle: ${error?.message}`,
      });
    }
  }
}
