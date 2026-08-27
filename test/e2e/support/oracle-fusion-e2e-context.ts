import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClientProxy,
  ClientProxyFactory,
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { AppModule } from 'src/app.module';
import { envs } from 'src/config';
import { PrismaService } from 'src/prisma.service';
import { OracleFusionWorkOrderApiClient } from 'src/maintenance/common/oracle-fusion-work-order-api-client';
import { mockWorkOrders } from '../data/oracle-fusion-mock-data';

(BigInt.prototype as { toJSON?: () => string }).toJSON = function toJSON(
  this: bigint,
) {
  return this.toString();
};

export type OracleFusionE2eContext = {
  app: {
    close: () => Promise<void>;
    listen: () => Promise<void>;
    useGlobalPipes: (pipe: ValidationPipe) => void;
  };
  client: ClientProxy;
  prisma: PrismaService;
};

export async function setupOracleFusionE2eContext(overrides?: {
  oracleApiMock?: Partial<OracleFusionWorkOrderApiClient>;
}): Promise<OracleFusionE2eContext> {
  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (overrides?.oracleApiMock) {
    moduleBuilder
      .overrideProvider(OracleFusionWorkOrderApiClient)
      .useValue(overrides.oracleApiMock);
  }

  const moduleFixture: TestingModule = await moduleBuilder.compile();

  const prisma = moduleFixture.get(PrismaService);

  const app = moduleFixture.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: {
      servers: envs.natsServers,
      user: envs.natsUser,
      pass: envs.natsPass,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen();

  const client = ClientProxyFactory.create({
    transport: Transport.NATS,
    options: {
      servers: envs.natsServers,
      user: envs.natsUser,
      pass: envs.natsPass,
    },
  });

  await client.connect();

  return { app, client, prisma };
}

export async function teardownOracleFusionE2eContext(
  context: OracleFusionE2eContext,
): Promise<void> {
  try {
    await context.prisma.oracleWoOperationHumanResources.deleteMany({});
    await context.prisma.oracleWoOperationMaterials.deleteMany({});
    await context.prisma.oracleWoOperations.deleteMany({});
    await context.prisma.oracleWorkOrders.deleteMany({});
  } catch {
    // ignore cleanup errors during teardown
  }
  context.client.close();
  await context.app.close();
  await context.prisma.$disconnect();
}

export async function sendPattern<T = any>(
  client: ClientProxy,
  pattern: string,
  payload: unknown,
): Promise<T> {
  return firstValueFrom(client.send<T>(pattern, payload).pipe(timeout(8000)));
}

export async function sendEvent(
  client: ClientProxy,
  pattern: string,
  payload: unknown,
): Promise<void> {
  await firstValueFrom(client.emit(pattern, payload));
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function assertRpcError(
  operation: Promise<unknown>,
  expectedStatus: number,
  expectedMessage?: string,
): Promise<void> {
  try {
    await operation;
    throw new Error('Expected RPC error, but operation succeeded');
  } catch (error: unknown) {
    const err = error as {
      message?: string | string[];
      status?: number;
      statusCode?: number;
      error?: unknown;
    };
    const messageText = Array.isArray(err?.message)
      ? err.message.join(' ')
      : String(err?.message ?? '');

    const numericStatus =
      typeof err?.status === 'number'
        ? err.status
        : typeof err?.statusCode === 'number'
          ? err.statusCode
          : undefined;

    if (numericStatus !== undefined) {
      expect(numericStatus).toBe(expectedStatus);
    } else {
      const inferredStatus =
        /not found|404/i.test(messageText) ||
        /not found/i.test(typeof err?.error === 'string' ? err.error : '')
          ? 404
          : /bad request|400|validation|must|should not be empty/i.test(
                messageText,
              )
            ? 400
            : undefined;

      expect(inferredStatus).toBe(expectedStatus);
    }

    if (expectedMessage !== undefined) {
      expect(messageText).toContain(expectedMessage);
    }
  }
}

export function buildWorkOrderCreatedEvent(
  overrides: Record<string, any> = {},
) {
  const fallbackPayload = {
    OrganizationCode: 'ORG-TEST-001',
    WorkOrderDescription: 'E2E Preventive maintenance test',
    AssetNumber: 'AST-E2E-001',
    WorkOrderTypeCode: 'Planned',
    WorkOrderSubTypeCode: 'Preventive',
    WorkOrderPriority: '2',
    WorkOrderStatusCode: 'Unreleased',
    PlannedStartDate: '2025-11-21T08:00:00+00:00',
    WorkOrderOperation: [
      {
        OperationName: 'Lubrication',
        OperationSequenceNumber: 10,
        OperationDescription: 'Lubrication of all components',
        OperationType: 'Internal',
        WorkCenterCode: 'MaintenanceDepartment',
        CountPointOperationFlag: true,
        PlannedStartDate: '2025-11-21T08:00:00.000Z',
        WorkOrderOperationResource: [
          {
            PrincipalFlag: false,
            BasisType: 1,
            ResourceCode: 'RES-E2E-001',
            UsageRate: 2,
            ResourceSequenceNumber: 1,
            ChargeType: 'AUTOMATIC',
          },
        ],
        WorkOrderOperationMaterial: [
          {
            MaterialSequenceNumber: 10,
            Quantity: 1,
            SupplyType: '1',
            InventoryItemNumber: 'MAT-E2E-001',
          },
        ],
      },
    ],
  };

  const mockWorkOrder = mockWorkOrders?.[0];
  const defaultPayload = mockWorkOrder
    ? { ...fallbackPayload, ...mockWorkOrder }
    : fallbackPayload;

  const mergedPayload = {
    ...defaultPayload,
    ...(overrides.payload as Record<string, unknown>),
  };

  const eventPayload = {
    enableOracleWorkOrder: 'Y',
    workOrderCode: 9001,
    payload: mergedPayload,
    ...overrides,
  } as Record<string, unknown>;

  return JSON.stringify(eventPayload);
}
