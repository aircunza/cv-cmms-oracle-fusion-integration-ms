import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma.service';
import { GeneralEncryption } from '../common/encryption/general-encryption';
import { CreateOracleInstanceDto, UpdateOracleInstanceDto } from './dto';

@Injectable()
export class OracleInstancesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOracleInstanceDto) {
    const existing = await this.prisma.oracleInstances.findFirst({
      where: {
        environment: dto.environment,
        module: dto.module,
      },
    });

    if (existing) {
      throw new RpcException({
        status: 409,
        message: 'INSTANCE_ALREADY_EXISTS',
      });
    }

    const credentials = JSON.stringify({
      us: dto.username,
      pw: dto.password,
      url: dto.url,
    });

    const encrypted = GeneralEncryption.encrypt(credentials);

    const instance = await this.prisma.oracleInstances.create({
      data: {
        environment: dto.environment,
        module: dto.module,
        basic: encrypted,
      },
    });

    return {
      oracleInstance: {
        id: instance.id,
        environment: instance.environment,
        module: instance.module,
      },
    };
  }

  async findOne(id: number) {
    const instance = await this.prisma.oracleInstances.findUnique({
      where: { id },
    });

    if (!instance) {
      throw new RpcException({
        status: 404,
        message: 'INSTANCE_NOT_FOUND',
      });
    }

    return {
      oracleInstance: {
        id: instance.id,
        environment: instance.environment,
        module: instance.module,
      },
    };
  }

  async findAll(limit = 10, offset = 0) {
    const [instances, total] = await Promise.all([
      this.prisma.oracleInstances.findMany({
        skip: offset,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.prisma.oracleInstances.count(),
    ]);

    return {
      oracleInstances: instances.map((i) => ({
        id: i.id,
        environment: i.environment,
        module: i.module,
      })),
      total,
    };
  }

  async update(id: number, dto: UpdateOracleInstanceDto) {
    const existing = await this.prisma.oracleInstances.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new RpcException({
        status: 404,
        message: 'INSTANCE_NOT_FOUND',
      });
    }

    const updateData: any = {};

    if (dto.environment !== undefined) updateData.environment = dto.environment;
    if (dto.module !== undefined) updateData.module = dto.module;

    if (
      dto.url !== undefined ||
      dto.username !== undefined ||
      dto.password !== undefined
    ) {
      const us = dto.username ?? this.decryptField(existing.basic).us;
      const pw = dto.password ?? this.decryptField(existing.basic).pw;
      const url = dto.url ?? this.decryptField(existing.basic).url;

      const credentials = JSON.stringify({ us, pw, url });
      updateData.basic = GeneralEncryption.encrypt(credentials);
    }

    const updated = await this.prisma.oracleInstances.update({
      where: { id },
      data: updateData,
    });

    return {
      oracleInstance: {
        id: updated.id,
        environment: updated.environment,
        module: updated.module,
      },
    };
  }

  async remove(id: number) {
    const existing = await this.prisma.oracleInstances.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new RpcException({
        status: 404,
        message: 'INSTANCE_NOT_FOUND',
      });
    }

    await this.prisma.oracleInstances.delete({
      where: { id },
    });

    return { message: 'INSTANCE_DELETED' };
  }

  async searchBasic(module = 'MAINTENANCE') {
    const instance = await this.prisma.oracleInstances.findFirst({
      where: { module },
    });

    if (!instance) {
      throw new RpcException({
        status: 404,
        message: 'ORACLE_INSTANCE_NOT_FOUND',
      });
    }

    return instance;
  }

  private decryptField(basic: string): { us: string; pw: string; url: string } {
    return JSON.parse(GeneralEncryption.decrypt(basic));
  }
}
