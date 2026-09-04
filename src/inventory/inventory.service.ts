import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { OracleFusionInventoryApiClient } from './common/oracle-fusion-inventory-api-client';

interface OracleInventoryItem {
  [key: string]: unknown;
}

interface OracleInventoryResponse {
  items: OracleInventoryItem[];
}

function transformOracleItem(
  item: OracleInventoryItem,
): Record<string, unknown> {
  const transformed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(item)) {
    if (key === 'links') continue;

    if (key === 'ItemNumber') {
      transformed.materialCode = value;
    } else if (key === 'ItemDescription') {
      transformed.materialName = value;
    } else if (key === 'PrimaryQuantity') {
      transformed.quantity = value;
    } else {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      transformed[camelKey] = value;
    }
  }

  return transformed;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly oracleApiClient: OracleFusionInventoryApiClient,
  ) {}

  async findByMaterialCode(materialCode: string) {
    try {
      const response = (await this.oracleApiClient.getOnhandBalanceByItemNumber(
        materialCode,
      )) as OracleInventoryResponse;

      const items = response.items ?? [];

      if (items.length === 0) {
        throw new RpcException({
          status: 404,
          message: 'Inventory item not found',
        });
      }

      return transformOracleItem(items[0]);
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      console.error('Error fetching inventory from Oracle:', error);
      throw new RpcException({
        status: 502,
        message: 'Failed to fetch inventory from Oracle Fusion',
      });
    }
  }

  async searchByDescription(description: string, organizationCode: string) {
    try {
      const response = (await this.oracleApiClient.searchByDescription(
        description,
        organizationCode,
      )) as OracleInventoryResponse;

      const items = response.items ?? [];

      return items.map(transformOracleItem);
    } catch (error) {
      console.error('Error searching inventory from Oracle:', error);
      throw new RpcException({
        status: 502,
        message: 'Failed to search inventory from Oracle Fusion',
      });
    }
  }
}
