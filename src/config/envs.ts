import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  NATS_SERVERS: string[];
  NATS_USER: string;
  NATS_PASS: string;
  ORACLE_ENCRYPTION_KEY: string;
}

const envsSchema = joi
  .object({
    PORT: joi.number().required(),
    DATABASE_URL: joi.string().required(),
    NATS_SERVERS: joi.array().items(joi.string()).required(),
    NATS_USER: joi.string().required(),
    NATS_PASS: joi.string().required(),
    ORACLE_ENCRYPTION_KEY: joi.string().required(),
  })
  .unknown(true);

const result = envsSchema.validate({
  ...process.env,
  NATS_SERVERS: process.env.NATS_SERVERS?.split(','),
});

if (result.error) {
  throw new Error(`Config validation error: ${result.error.message}`);
}

const envVars = result.value as EnvVars;

export const envs = {
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  natsServers: envVars.NATS_SERVERS,
  natsUser: envVars.NATS_USER,
  natsPass: envVars.NATS_PASS,
  oracleEncryptionKey: envVars.ORACLE_ENCRYPTION_KEY,
};
