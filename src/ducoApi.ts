import axios, { AxiosInstance } from 'axios';

// ─── API Response Types ─────────────────────────────────────────────────────

export interface DucoNodeGeneral {
  Type: { Val: string };
  SubType: { Val: number };
  NetworkType: { Val: string };
  Parent: { Val: number };
  Asso: { Val: number };
  Name: { Val: string };
  Identify: { Val: number };
}

export interface DucoNodeVentilation {
  State: { Val: string };
  TimeStateRemain: { Val: number };
  TimeStateEnd: { Val: number };
  Mode: { Val: string };
  FlowLvlTgt: { Val: number };
}

export interface DucoNodeSensor {
  IaqCo2: { Val: number };
  IaqRh: { Val: number };
  Co2: { Val: number };
  Rh: { Val: number };
  // Allow additional sensor fields the API may return
  [key: string]: { Val: number | string } | undefined;
}

export interface DucoNode {
  Node: number;
  General: DucoNodeGeneral;
  Ventilation: DucoNodeVentilation;
  Sensor: DucoNodeSensor;
}

export interface DucoDeviceInfo {
  Id: string;
  DeviceType: string;
  SerialNumber: string;
  Online: boolean;
}

export interface DucoNodesResponse {
  DeviceInfo: DucoDeviceInfo;
  Nodes: DucoNode[];
}

export interface DucoActionItem {
  Action: string;
  ValType: string;
  Enum: string[];
}

export interface DucoActionsResponse {
  DeviceInfo: DucoDeviceInfo;
  Actions: DucoActionItem[];
}

export interface DucoNodeActionsResponse {
  DeviceInfo: DucoDeviceInfo;
  Node: number;
  Actions: DucoActionItem[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

export class DucoApiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(host: string) {
    this.baseUrl = `http://${host}`;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get API info / health check
   */
  async getApiInfo(): Promise<Record<string, unknown>> {
    const response = await this.client.get('/info');
    return response.data;
  }

  /**
   * Get all nodes with their current state and sensor data
   */
  async getNodes(): Promise<DucoNodesResponse> {
    const response = await this.client.get('/info/nodes');
    return response.data;
  }

  /**
   * Get info for a specific node
   */
  async getNodeInfo(nodeId: number): Promise<DucoNode> {
    const response = await this.client.get(`/info/nodes/${nodeId}`);
    return response.data;
  }

  /**
   * Get supported actions for the device
   */
  async getActions(): Promise<DucoActionsResponse> {
    const response = await this.client.get('/action');
    return response.data;
  }

  /**
   * Get supported actions for a specific node
   */
  async getNodeActions(nodeId: number): Promise<DucoNodeActionsResponse> {
    const response = await this.client.get(`/action/nodes/${nodeId}`);
    return response.data;
  }

  /**
   * Send an action to the whole device (e.g., set ventilation mode)
   */
  async sendAction(action: string, value: string | number | boolean): Promise<void> {
    await this.client.post('/action', {
      Action: action,
      Val: value,
    });
  }

  /**
   * Send an action to a specific node (e.g., override a specific zone)
   */
  async sendNodeAction(nodeId: number, action: string, value: string | number | boolean): Promise<void> {
    await this.client.post(`/action/nodes/${nodeId}`, {
      Action: action,
      Val: value,
    });
  }

  /**
   * Get all config
   */
  async getConfig(): Promise<Record<string, unknown>> {
    const response = await this.client.get('/config');
    return response.data;
  }

  /**
   * Get config for a specific node
   */
  async getNodeConfig(nodeId: number): Promise<Record<string, unknown>> {
    const response = await this.client.get(`/config/nodes/${nodeId}`);
    return response.data;
  }

  /**
   * Set ventilation state for a node
   * States: AUTO, MAN1, MAN2, MAN3, AWAY
   */
  async setNodeVentilationState(nodeId: number, state: string): Promise<void> {
    await this.sendNodeAction(nodeId, 'SetVentilationState', state);
  }

  /**
   * Set ventilation state for the whole box
   */
  async setVentilationState(state: string): Promise<void> {
    await this.sendAction('SetVentilationState', state);
  }

  /**
   * Test connectivity to the Duco box
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getApiInfo();
      return true;
    } catch {
      return false;
    }
  }
}
