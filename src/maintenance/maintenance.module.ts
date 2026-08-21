import { Module } from '@nestjs/common';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { WoOperationsModule } from './wo-operations/wo-operations.module';
import { OperationMaterialsModule } from './operation-materials/operation-materials.module';
import { OperationHumanResourcesModule } from './operation-human-resources/operation-human-resources.module';

@Module({
  imports: [
    WorkOrdersModule,
    WoOperationsModule,
    OperationMaterialsModule,
    OperationHumanResourcesModule,
  ],
})
export class MaintenanceModule {}
