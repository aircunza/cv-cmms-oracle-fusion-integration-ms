import {
  assertRpcError,
  sendPattern,
  setupOracleFusionE2eContext,
  teardownOracleFusionE2eContext,
  type OracleFusionE2eContext,
} from '../support/oracle-fusion-e2e-context';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

type FindOneResponse = {
  oracleInstance: {
    id: string;
    environment: string;
    module: string;
  };
};

describe('Oracle Instance Find One (e2e, NATS)', () => {
  let context: OracleFusionE2eContext;

  beforeAll(async () => {
    context = await setupOracleFusionE2eContext();
  });

  afterAll(async () => {
    if (context) {
      await teardownOracleFusionE2eContext(context);
    }
  });

  it('returns an oracle instance by id', async () => {
    const response = await sendPattern<FindOneResponse>(
      context.client,
      'oracle.instance.find.one',
      {
        id: 1,
      },
    );

    expect(response.oracleInstance).toBeDefined();
    expect(response.oracleInstance.id).toBe('1');
    expect(response.oracleInstance.environment).toBeDefined();
    expect(response.oracleInstance.module).toBeDefined();
  });

  it('does not return the basic (encrypted) field', async () => {
    const response = await sendPattern<FindOneResponse>(
      context.client,
      'oracle.instance.find.one',
      {
        id: 1,
      },
    );

    expect(Object.keys(response.oracleInstance)).not.toContain('basic');
  });

  it('returns 404 when instance does not exist', async () => {
    await assertRpcError(
      sendPattern(context.client, 'oracle.instance.find.one', {
        id: 999999,
      }),
      404,
      'INSTANCE_NOT_FOUND',
    );
  });
});
