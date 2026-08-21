import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { OperationMaterialsService } from './operation-materials.service';
import { OperationMaterialCreatedHandler } from './handlers/operation-material-created.handler';
import { OperationMaterialDeletedHandler } from './handlers/operation-material-deleted.handler';

@Controller('operation-materials')
export class OperationMaterialsController {
  constructor(
    private readonly operationMaterialsService: OperationMaterialsService,
    private readonly operationMaterialCreatedHandler: OperationMaterialCreatedHandler,
    private readonly operationMaterialDeletedHandler: OperationMaterialDeletedHandler,
  ) {}

  @EventPattern('operation.material.created')
  handleOperationMaterialCreated(event: any) {
    return this.operationMaterialCreatedHandler.handle(event);
  }

  @EventPattern('operation.material.deleted')
  handleOperationMaterialDeleted(event: any) {
    return this.operationMaterialDeletedHandler.handle(event);
  }
}
