import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { WoOperationsService } from './wo-operations.service';
import { OperationCreatedHandler } from './handlers/operation-created.handler';
import { OperationUpdatedHandler } from './handlers/operation-updated.handler';
import { OperationDeletedHandler } from './handlers/operation-deleted.handler';

@Controller('wo-operations')
export class WoOperationsController {
  constructor(
    private readonly woOperationsService: WoOperationsService,
    private readonly operationCreatedHandler: OperationCreatedHandler,
    private readonly operationUpdatedHandler: OperationUpdatedHandler,
    private readonly operationDeletedHandler: OperationDeletedHandler,
  ) {}

  @EventPattern('wo.operation.created')
  handleOperationCreated(event: any) {
    return this.operationCreatedHandler.handle(event);
  }

  @EventPattern('wo.operation.updated')
  handleOperationUpdated(event: any) {
    return this.operationUpdatedHandler.handle(event);
  }

  @EventPattern('wo.operation.deleted')
  handleOperationDeleted(event: any) {
    return this.operationDeletedHandler.handle(event);
  }
}
