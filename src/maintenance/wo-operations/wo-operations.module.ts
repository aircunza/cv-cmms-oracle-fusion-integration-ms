import { Module } from '@nestjs/common';
import { WoOperationsController } from './wo-operations.controller';
import { WoOperationsService } from './wo-operations.service';
import { OperationCreatedHandler } from './handlers/operation-created.handler';
import { OperationUpdatedHandler } from './handlers/operation-updated.handler';
import { OperationDeletedHandler } from './handlers/operation-deleted.handler';
import { OracleFusionWorkOrderApiClient } from '../common/oracle-fusion-work-order-api-client';
import { OracleInstancesModule } from '../../oracle-instances/oracle-instances.module';
import { PrismaService } from '../../prisma.service';

@Module({
  imports: [OracleInstancesModule],
  controllers: [WoOperationsController],
  providers: [
    WoOperationsService,
    OperationCreatedHandler,
    OperationUpdatedHandler,
    OperationDeletedHandler,
    OracleFusionWorkOrderApiClient,
    PrismaService,
  ],
  exports: [WoOperationsService],
})
export class WoOperationsModule {}
