import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { envs } from './config';

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
(BigInt.prototype as any).toJSON = function toJSON(this: bigint) {
  return this.toString();
};

async function bootstrap() {
  const logger = new Logger('Main');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.NATS,
      options: {
        servers: envs.natsServers,
        user: envs.natsUser,
        pass: envs.natsPass,
        maxReconnectAttempts: 10,
        reconnectTimeWait: 2000,
        timeout: 5000,
        pingInterval: 10000,
      },
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen();
  logger.log(
    `Oracle Fusion Integration Microservice running on port ${envs.port}`,
  );
}
void bootstrap();
