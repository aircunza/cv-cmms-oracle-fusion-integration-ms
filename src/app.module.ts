import { Module } from '@nestjs/common';
import { OracleInstancesModule } from './oracle-instances/oracle-instances.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [OracleInstancesModule, MaintenanceModule, InventoryModule],
})
export class AppModule {}
