import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { OracleFusionInventoryApiClient } from './common/oracle-fusion-inventory-api-client';
import { OracleInstancesModule } from '../oracle-instances/oracle-instances.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [OracleInstancesModule],
  controllers: [InventoryController],
  providers: [InventoryService, OracleFusionInventoryApiClient, PrismaService],
})
export class InventoryModule {}
