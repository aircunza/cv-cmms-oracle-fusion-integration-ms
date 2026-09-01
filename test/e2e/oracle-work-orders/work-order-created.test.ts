import {
  buildWorkOrderCreatedEvent,
  sendEvent,
  setupOracleFusionE2eContext,
  teardownOracleFusionE2eContext,
  type OracleFusionE2eContext,
} from '../support/oracle-fusion-e2e-context';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PrismaService } from '../../../src/prisma.service';

async function waitForSync(
  prisma: PrismaService,
  workOrderCode: number,
  maxWaitMs: number,
  intervalMs = 2000,
): Promise<{ syncStatus: string; [key: string]: unknown } | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const record = await prisma.oracleWorkOrders.findFirst({
      where: { workOrderCode },
    });
    if (record?.syncStatus === 'synced' || record?.syncStatus === 'failed') {
      return record;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

describe('Work Order Created Handler (e2e, NATS Event)', () => {
  let context: OracleFusionE2eContext;

  beforeAll(async () => {
    context = await setupOracleFusionE2eContext();
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25000));

    if (context) {
      await teardownOracleFusionE2eContext(context);
    }
  });

  it('syncs work order to Oracle when enableOracleWorkOrder = "Y"', async () => {
    const event = buildWorkOrderCreatedEvent({ workOrderCode: 9001 });

    await sendEvent(context.client, 'work.order.created', event);

    const record = await waitForSync(context.prisma, 9001, 18000);

    expect(record).not.toBeNull();
    expect(record?.syncStatus).toBe('synced');
    expect(record?.oclWoId).not.toBeNull();
    expect(record?.oclWoNumber).not.toBeNull();
    expect(record?.oclWoStatusCode).not.toBeNull();
    expect(record?.retryCount).toBe(0);
    expect(record?.lastSyncAttempt).not.toBeNull();

    const operations = await context.prisma.oracleWoOperations.findMany({
      where: { workOrderCode: BigInt(9001) },
    });
    expect(operations.length).toBeGreaterThan(0);
    expect(operations[0].oclWoOperationId).not.toBeNull();
    expect(operations[0].woOperationCode).not.toBeNull();
    expect(operations[0].syncStatus).toBe('synced');

    const materials = await context.prisma.oracleWoOperationMaterials.findMany({
      where: { woOperationCode: operations[0].woOperationCode },
    });
    expect(materials.length).toBeGreaterThan(0);
    expect(materials[0].oclWoOperationMaterialId).not.toBeNull();
    expect(materials[0].syncStatus).toBe('synced');

    const resources =
      await context.prisma.oracleWoOperationHumanResources.findMany({
        where: { woOperationCode: operations[0].woOperationCode },
      });
    expect(resources.length).toBeGreaterThan(0);
    expect(resources[0].oclWoOperationResourceId).not.toBeNull();
    expect(resources[0].syncStatus).toBe('synced');
  });

  it('skips sync when enableOracleWorkOrder = "N"', async () => {
    const event = buildWorkOrderCreatedEvent({
      workOrderCode: 9002,
      enableOracleWorkOrder: 'N',
    });

    await sendEvent(context.client, 'work.order.created', event);

    const record = await context.prisma.oracleWorkOrders.findFirst({
      where: { workOrderCode: 9002 },
    });

    expect(record).toBeNull();
  });
});
