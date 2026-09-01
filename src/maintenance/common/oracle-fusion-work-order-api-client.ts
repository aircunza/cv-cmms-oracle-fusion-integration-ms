import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleInstancesService } from '../../oracle-instances/oracle-instances.service';
import { GeneralEncryption } from '../../common/encryption/general-encryption';
import { envs } from '../../config';

interface DecryptedCredentials {
  us: string;
  pw: string;
  url: string;
}

interface AuthConfig {
  baseUrl: string;
  headers: {
    Authorization: string;
    'Content-Type': string;
  };
}

@Injectable()
export class OracleFusionWorkOrderApiClient {
  constructor(
    private readonly oracleInstancesService: OracleInstancesService,
  ) {}

  private async getAuthConfig(): Promise<AuthConfig> {
    const instance = await this.oracleInstancesService.searchBasic(
      envs.oracleEnvironment,
      'MAINTENANCE',
    );
    const decrypted = JSON.parse(
      GeneralEncryption.decrypt(instance.basic),
    ) as DecryptedCredentials;
    const token = Buffer.from(`${decrypted.us}:${decrypted.pw}`).toString(
      'base64',
    );

    return {
      baseUrl: decrypted.url,
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
      },
    };
  }

  async createWorkOrder(payload: unknown): Promise<unknown> {
    try {
      const { baseUrl, headers } = await this.getAuthConfig();

      const res = await axios.post(
        `${baseUrl}/maintenanceWorkOrders`,
        payload,
        {
          headers,
        },
      );
      return res.data;
    } catch (error) {
      console.error('Error creating work order:', error);
      throw error;
    }
  }

  async getWorkOrderById(id: string): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.get(`${baseUrl}/maintenanceWorkOrders/${id}`, {
      headers,
    });
    return res.data;
  }

  async updateWorkOrder(oclWoId: number, payload: unknown): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.patch(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}`,
      payload,
      { headers },
    );
    return res.data;
  }

  async createOperation(oclWoId: number, operation: unknown): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.post(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation`,
      operation,
      { headers },
    );
    return res.data;
  }

  async updateOperation(
    oclWoId: number,
    oclOperationId: number,
    operation: unknown,
  ): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.patch(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclOperationId}`,
      operation,
      { headers },
    );
    return res.data;
  }

  async deleteOperation(
    oclWoId: number,
    oclOperationId: number,
  ): Promise<void> {
    const { baseUrl, headers } = await this.getAuthConfig();
    await axios.delete(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclOperationId}`,
      { headers },
    );
  }

  async createOperationMaterial(
    oclWoId: number,
    oclWoOperationId: number,
    material: unknown,
  ): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.post(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationMaterial`,
      material,
      { headers },
    );
    return res.data;
  }

  async deleteOperationMaterial(
    oclWoId: number,
    oclWoOperationId: number,
    oclWoOperationMaterialId: number,
  ): Promise<void> {
    const { baseUrl, headers } = await this.getAuthConfig();
    await axios.delete(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationMaterial/${oclWoOperationMaterialId}`,
      { headers },
    );
  }

  async deleteOperationResource(
    oclWoId: number,
    oclWoOperationId: number,
    oclWoOperationResourceId: number,
  ): Promise<void> {
    const { baseUrl, headers } = await this.getAuthConfig();
    await axios.delete(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationResource/${oclWoOperationResourceId}`,
      { headers },
    );
  }

  async createOperationResource(
    oclWoId: number,
    oclWoOperationId: number,
    resource: unknown,
  ): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.post(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationResource`,
      resource,
      { headers },
    );
    return res.data;
  }

  async getOperationResources(
    oclWoId: number,
    oclWoOperationId: number,
  ): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.get(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationResource`,
      { headers },
    );
    return res.data;
  }

  async getOperationMaterials(
    oclWoId: number,
    oclWoOperationId: number,
  ): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.get(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationMaterial`,
      { headers },
    );
    return res.data;
  }

  async getWorkOrderOperations(oclWoId: number): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.get(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation`,
      { headers },
    );

    return res.data;
  }
}
