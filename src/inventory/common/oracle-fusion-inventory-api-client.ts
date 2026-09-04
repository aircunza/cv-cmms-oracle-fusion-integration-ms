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
export class OracleFusionInventoryApiClient {
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

  async getOnhandBalanceByItemNumber(itemNumber: string): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.get(`${baseUrl}/inventoryOnhandBalances`, {
      headers,
      params: {
        q: `ItemNumber=${itemNumber}`,
      },
    });
    return res.data;
  }

  async searchByDescription(
    description: string,
    organizationCode: string,
  ): Promise<unknown> {
    const { baseUrl, headers } = await this.getAuthConfig();
    const res = await axios.get(`${baseUrl}/inventoryOnhandBalances`, {
      headers,
      params: {
        q: `ItemDescription LIKE '%${description}%';OrganizationCode='${organizationCode}'`,
        limit: 100,
      },
    });
    return res.data;
  }
}
