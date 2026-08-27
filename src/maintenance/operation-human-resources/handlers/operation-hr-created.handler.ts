import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

interface OperationHrEvent {
  payload?: string | OperationHrPayload;
}

interface OperationHrPayload {
  enableOracleWorkOrder?: string;
  oclWorkOrderId?: number;
  oclWoOperationId?: number;
  operationCode: number;
  resourceCode?: string;
  plannedStartDate?: string;
  plannedCompletionDate?: string;
  resourceSequenceNumber: number;
  usageRate?: number;
}

interface OracleResourceResponse {
  WoOperationResourceId?: number;
  ResourceCode?: string;
}

interface OracleResourceItem {
  WoOperationResourceId?: number;
  ResourceCode?: string;
}

interface OracleResourcesResponse {
  items?: OracleResourceItem[];
}

@Injectable()
export class OperationHrCreatedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oracleApiClient: OracleFusionWorkOrderApiClient,
  ) {}

  async handle(event: OperationHrEvent) {
    const payload: OperationHrPayload =
      typeof event.payload === 'string'
        ? (JSON.parse(event.payload) as OperationHrPayload)
        : (event.payload as OperationHrPayload);

    if (payload.enableOracleWorkOrder !== 'Y') {
      return;
    }

    if (!payload.oclWorkOrderId || !payload.oclWoOperationId) {
      console.warn(
        `Cannot create HR for operation ${payload.operationCode}: missing oclWorkOrderId or oclWoOperationId`,
      );
      return;
    }

    const oclWorkOrderId = payload.oclWorkOrderId;
    const oclWoOperationId = payload.oclWoOperationId;
    const woOperationCodeBigInt = BigInt(payload.operationCode);

    try {
      const oraclePayload: Record<string, unknown> = {
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

      const oracleResource =
        (await this.oracleApiClient.createOperationResource(
          oclWorkOrderId,
          oclWoOperationId,
          oraclePayload,
        )) as OracleResourceResponse;

      if (!oracleResource?.WoOperationResourceId) {
        throw new Error('Oracle API did not return WoOperationResourceId');
      }

      let resourceCode = payload.resourceCode;

      if (!oracleResource.ResourceCode) {
        try {
          const fullResourcesResponse =
            (await this.oracleApiClient.getOperationResources(
              oclWorkOrderId,
              oclWoOperationId,
            )) as OracleResourcesResponse;

          const fullResource = fullResourcesResponse?.items?.find(
            (r) =>
              r.WoOperationResourceId === oracleResource.WoOperationResourceId,
          );

          if (fullResource?.ResourceCode) {
            resourceCode = fullResource.ResourceCode;
          }
        } catch (getError: unknown) {
          const err = getError as { message?: string };
          console.warn(
            `Failed to GET complete resource from Oracle: ${err?.message}`,
          );
        }
      } else {
        resourceCode = oracleResource.ResourceCode;
      }

      await this.prisma.oracleWoOperationHumanResources.upsert({
        where: {
          woOperationCode_resourceCode: {
            woOperationCode: woOperationCodeBigInt,
            resourceCode: resourceCode ?? '',
          },
        },
        create: {
          oclWoId: oclWorkOrderId,
          oclWoOperationId,
          oclWoOperationResourceId: oracleResource.WoOperationResourceId,
          woOperationCode: woOperationCodeBigInt,
          resourceSequenceNumber: payload.resourceSequenceNumber,
          resourceCode,
          syncStatus: 'synced',
          retryCount: 0,
          lastSyncAttempt: new Date(),
        },
        update: {
          oclWoOperationResourceId: oracleResource.WoOperationResourceId,
          resourceSequenceNumber: payload.resourceSequenceNumber,
          syncStatus: 'synced',
          retryCount: 0,
          syncError: null,
          lastSyncAttempt: new Date(),
        },
      });

      console.log(`HR ${payload.resourceCode} synced to Oracle`);
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(
        `Failed to create HR for operation ${payload.operationCode}:`,
        err?.message || error,
      );
      throw new RpcException({
        status: 500,
        message: `Failed to sync HR to Oracle: ${err?.message}`,
      });
    }
  }
}
