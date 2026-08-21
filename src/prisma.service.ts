import { PrismaClient } from 'generated/prisma/client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaMssql } from '@prisma/adapter-mssql';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      adapter: new PrismaMssql(process.env.DATABASE_URL!),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
