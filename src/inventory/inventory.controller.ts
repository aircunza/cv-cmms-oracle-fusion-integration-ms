import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @MessagePattern('oracle.sync.inventory.find-one')
  findByMaterialCode(@Payload() dto: { materialCode: string }) {
    return this.inventoryService.findByMaterialCode(dto.materialCode);
  }

  @MessagePattern('oracle.sync.inventory.search')
  searchByDescription(
    @Payload() dto: { description: string; organizationCode: string },
  ) {
    return this.inventoryService.searchByDescription(
      dto.description,
      dto.organizationCode,
    );
  }
}
