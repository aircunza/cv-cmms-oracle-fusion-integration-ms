import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { OperationHumanResourcesService } from './operation-human-resources.service';
import { OperationHrCreatedHandler } from './handlers/operation-hr-created.handler';
import { OperationHrDeletedHandler } from './handlers/operation-hr-deleted.handler';

@Controller('operation-human-resources')
export class OperationHumanResourcesController {
  constructor(
    private readonly operationHumanResourcesService: OperationHumanResourcesService,
    private readonly operationHrCreatedHandler: OperationHrCreatedHandler,
    private readonly operationHrDeletedHandler: OperationHrDeletedHandler,
  ) {}

  @EventPattern('operation.hr.created')
  handleOperationHrCreated(event: any) {
    return this.operationHrCreatedHandler.handle(event);
  }

  @EventPattern('operation.hr.deleted')
  handleOperationHrDeleted(event: any) {
    return this.operationHrDeletedHandler.handle(event);
  }
}
