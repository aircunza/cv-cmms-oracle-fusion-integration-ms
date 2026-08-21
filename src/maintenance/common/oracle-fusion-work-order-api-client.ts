import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OracleInstancesService } from '../../oracle-instances/oracle-instances.service';
import { GeneralEncryption } from '../../common/encryption/general-encryption';

@Injectable()
export class OracleFusionWorkOrderApiClient {
  constructor(private readonly oracleInstancesService: OracleInstancesService) {}

  private async getAuthConfig() {
    const instance = await this.oracleInstancesService.searchBasic('MAINTENANCE');
    const decrypted = JSON.parse(GeneralEncryption.decrypt(instance.basic));
    const token = Buffer.from(`${decrypted.us}:${decrypted.pw}`).toString('base64');
    return {
      baseUrl: decrypted.url,
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
      },
    };
  }

  async createWorkOrder(payload: any): Promise<any> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.post(`${baseUrl}/maintenanceWorkOrders`, payload, { headers });
    return res.data;
  }

  async getWorkOrderById(id: string): Promise<any> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.get(`${baseUrl}/maintenanceWorkOrders/${id}`, { headers });
    return res.data;
  }

  async updateWorkOrder(oclWoId: number, payload: any): Promise<any> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.patch(`${baseUrl}/maintenanceWorkOrders/${oclWoId}`, payload, { headers });
    return res.data;
  }

  async createOperation(oclWoId: number, operation: any): Promise<any> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.post(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation`,
      operation,
      { headers },
    );
    return res.data;
  }

  async updateOperation(oclWoId: number, oclOperationId: number, operation: any): Promise<any> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.patch(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclOperationId}`,
      operation,
      { headers },
    );
    return res.data;
  }

  async deleteOperation(oclWoId: number, oclOperationId: number): Promise<void> {
    const { baseUrl, headers } = await this.getAuthConfig();
    await axios.delete(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclOperationId}`,
      { headers },
    );
  }

  async createOperationMaterial(oclWoId: number, oclWoOperationId: number, material: any): Promise<any> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.post(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationMaterial`,
      material,
      { headers },
    );
    return res.data;
  }

  async deleteOperationMaterial(oclWoId: number, oclWoOperationId: number, oclWoOperationMaterialId: number): Promise<void> {
    const { baseUrl, headers } = await this.getAuthConfig();
    await axios.delete(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationMaterial/${oclWoOperationMaterialId}`,
      { headers },
    );
  }

  async deleteOperationResource(oclWoId: number, oclWoOperationId: number, oclWoOperationResourceId: number): Promise<void> {
    const { baseUrl, headers } = await this.getAuthConfig();
    await axios.delete(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationResource/${oclWoOperationResourceId}`,
      { headers },
    );
  }

  async createOperationResource(oclWoId: number, oclWoOperationId: number, resource: any): Promise<any> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.post(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationResource`,
      resource,
      { headers },
    );
    return res.data;
  }

  async getOperationResources(oclWoId: number, oclWoOperationId: number): Promise<any> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.get(
      `${baseUrl}/maintenanceWorkOrders/${oclWoId}/child/WorkOrderOperation/${oclWoOperationId}/child/WorkOrderOperationResource`,
      { headers },
    );
    return res.data;
  }
}
