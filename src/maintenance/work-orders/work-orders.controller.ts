import { Controller } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { EventPattern, MessagePattern } from '@nestjs/microservices';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrderCreatedHandler } from './handlers/work-order-created.handler';
import { WorkOrderFieldsUpdatedHandler } from './handlers/work-order-fields-updated.handler';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly workOrderCreatedHandler: WorkOrderCreatedHandler,
    private readonly workOrderFieldsUpdatedHandler: WorkOrderFieldsUpdatedHandler,
  ) {}

  @EventPattern('work.order.created')
  handleWorkOrderCreated(event: any) {
    return this.workOrderCreatedHandler.handle(event);
  }

  @EventPattern('work.order.fields.updated')
  handleWorkOrderFieldsUpdated(event: any) {
    return this.workOrderFieldsUpdatedHandler.handle(event);
  }

  @MessagePattern('oracle.sync.work-order.status')
  getSyncStatus(@Payload() dto: { workOrderCode: number }) {
    return this.workOrdersService.getSyncStatus(dto.workOrderCode);
  }
}
