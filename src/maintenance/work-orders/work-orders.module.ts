import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrderCreatedHandler } from './handlers/work-order-created.handler';
import { WorkOrderFieldsUpdatedHandler } from './handlers/work-order-fields-updated.handler';
import { OracleFusionWorkOrderApiClient } from '../common/oracle-fusion-work-order-api-client';
import { OracleInstancesModule } from '../../oracle-instances/oracle-instances.module';
import { PrismaService } from '../../prisma.service';

@Module({
  imports: [OracleInstancesModule],
  controllers: [WorkOrdersController],
  providers: [
    WorkOrdersService,
    WorkOrderCreatedHandler,
    WorkOrderFieldsUpdatedHandler,
    OracleFusionWorkOrderApiClient,
    PrismaService,
  ],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
