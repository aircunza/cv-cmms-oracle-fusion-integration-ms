import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from '../config';
import { NATS_SERVICE } from '../config/services';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: NATS_SERVICE,
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
    ]),
  ],
  exports: [
    ClientsModule.register([
      {
        name: NATS_SERVICE,
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
    ]),
  ],
})
export class NatsModule {}
