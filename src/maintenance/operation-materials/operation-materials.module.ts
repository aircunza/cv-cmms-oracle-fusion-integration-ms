import { Module } from '@nestjs/common';
import { OperationMaterialsController } from './operation-materials.controller';
import { OperationMaterialsService } from './operation-materials.service';
import { OperationMaterialCreatedHandler } from './handlers/operation-material-created.handler';
import { OperationMaterialDeletedHandler } from './handlers/operation-material-deleted.handler';
import { OracleFusionWorkOrderApiClient } from '../common/oracle-fusion-work-order-api-client';
import { OracleInstancesModule } from '../../oracle-instances/oracle-instances.module';
import { PrismaService } from '../../prisma.service';

@Module({
  imports: [OracleInstancesModule],
  controllers: [OperationMaterialsController],
  providers: [
    OperationMaterialsService,
    OperationMaterialCreatedHandler,
    OperationMaterialDeletedHandler,
    OracleFusionWorkOrderApiClient,
    PrismaService,
  ],
  exports: [OperationMaterialsService],
})
export class OperationMaterialsModule {}
