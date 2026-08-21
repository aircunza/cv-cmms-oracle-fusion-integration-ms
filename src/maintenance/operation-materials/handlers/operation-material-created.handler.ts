import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../../prisma.service';
import { OracleFusionWorkOrderApiClient } from '../../common/oracle-fusion-work-order-api-client';

@Injectable()
export class OperationMaterialCreatedHandler {
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
      console.warn(`Cannot create material for operation ${payload.operationCode}: missing oclWoId or oclWoOperationId`);
      return;
    }

    const existing = await this.prisma.oracleWoOperationMaterials.findFirst({
      where: {
        woOperationCode: payload.operationCode,
        materialSequenceNumber: payload.material.materialSequenceNumber,
      },
    });

    if (existing) {
      console.warn(`Material ${payload.material.materialSequenceNumber} for operation ${payload.operationCode} already synced, skipping`);
      return;
    }

    try {
      const oraclePayload = {
        ItemNumber: payload.material.materialCode,
        MaterialSequenceNumber: payload.material.materialSequenceNumber,
        Quantity: payload.material.quantity,
        SupplyType: payload.material.supplyType,
      };

      const oracleMaterial = await this.oracleApiClient.createOperationMaterial(
        payload.oclWoId,
        payload.oclWoOperationId,
        oraclePayload,
      );

      if (!oracleMaterial?.WoOperationMaterialId) {
        throw new Error('Oracle API did not return WoOperationMaterialId');
      }

      await this.prisma.oracleWoOperationMaterials.create({
        data: {
          oclWoId: payload.oclWoId,
          oclWoOperationId: payload.oclWoOperationId,
          oclWoOperationMaterialId: oracleMaterial.WoOperationMaterialId,
          woOperationCode: payload.operationCode,
          materialSequenceNumber: payload.material.materialSequenceNumber,
          syncStatus: 'synced',
          retryCount: 0,
          lastSyncAttempt: new Date(),
        },
      });

      console.log(`✅ Material ${payload.material.materialSequenceNumber} synced to Oracle`);
    } catch (error: any) {
      console.error(`❌ Failed to create material for operation ${payload.operationCode}:`, error?.message || error);
      throw new RpcException({
        status: 500,
        message: `Failed to sync material to Oracle: ${error?.message}`,
      });
    }
  }
}
