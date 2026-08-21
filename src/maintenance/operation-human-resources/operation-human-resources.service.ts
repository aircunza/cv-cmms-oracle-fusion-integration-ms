import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class OperationHumanResourcesService {
  constructor(private readonly prisma: PrismaService) {}
}
