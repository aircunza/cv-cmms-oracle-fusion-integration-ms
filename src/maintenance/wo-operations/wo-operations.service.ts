import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class WoOperationsService {
  constructor(private readonly prisma: PrismaService) {}
}
