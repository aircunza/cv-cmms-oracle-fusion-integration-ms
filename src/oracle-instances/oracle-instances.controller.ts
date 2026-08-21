import { Controller } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { MessagePattern } from '@nestjs/microservices';
import { OracleInstancesService } from './oracle-instances.service';
import { CreateOracleInstanceDto, UpdateOracleInstanceDto } from './dto';

@Controller('oracle-instances')
export class OracleInstancesController {
  constructor(private readonly oracleInstancesService: OracleInstancesService) {}

  @MessagePattern('oracle.instance.create')
  create(@Payload() dto: CreateOracleInstanceDto) {
    return this.oracleInstancesService.create(dto);
  }

  @MessagePattern('oracle.instance.find.one')
  findOne(@Payload() dto: { id: number }) {
    return this.oracleInstancesService.findOne(dto.id);
  }

  @MessagePattern('oracle.instance.find.all')
  findAll(@Payload() dto: { limit?: number; offset?: number }) {
    return this.oracleInstancesService.findAll(dto?.limit, dto?.offset);
  }

  @MessagePattern('oracle.instance.update')
  update(@Payload() dto: { id: number; data: UpdateOracleInstanceDto }) {
    return this.oracleInstancesService.update(dto.id, dto.data);
  }

  @MessagePattern('oracle.instance.delete')
  remove(@Payload() dto: { id: number }) {
    return this.oracleInstancesService.remove(dto.id);
  }
}
