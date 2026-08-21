import { Module } from '@nestjs/common';
import { OracleInstancesController } from './oracle-instances.controller';
import { OracleInstancesService } from './oracle-instances.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [OracleInstancesController],
  providers: [OracleInstancesService, PrismaService],
  exports: [OracleInstancesService],
})
export class OracleInstancesModule {}
