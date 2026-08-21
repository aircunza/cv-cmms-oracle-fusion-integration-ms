import { Module } from '@nestjs/common';
import { OperationHumanResourcesController } from './operation-human-resources.controller';
import { OperationHumanResourcesService } from './operation-human-resources.service';
import { OperationHrCreatedHandler } from './handlers/operation-hr-created.handler';
import { OperationHrDeletedHandler } from './handlers/operation-hr-deleted.handler';
import { OracleFusionWorkOrderApiClient } from '../common/oracle-fusion-work-order-api-client';
import { OracleInstancesModule } from '../../oracle-instances/oracle-instances.module';
import { PrismaService } from '../../prisma.service';

@Module({
  imports: [OracleInstancesModule],
  controllers: [OperationHumanResourcesController],
  providers: [
    OperationHumanResourcesService,
    OperationHrCreatedHandler,
    OperationHrDeletedHandler,
    OracleFusionWorkOrderApiClient,
    PrismaService,
  ],
  exports: [OperationHumanResourcesService],
})
export class OperationHumanResourcesModule {}
