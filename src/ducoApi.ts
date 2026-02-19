import axios, { AxiosInstance } from 'axios';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DucoNode {
  Node: number;
  General: {
    Type?: string;
    SubType?: string;
    NetworkType?: string;
    Ident?: string;
    SwVersion?: string;
    [key: string]: unknown;
  };
  Ventilation?: {
    State?: string;
    Mode?: string;
    FlowLvlTgt?: number;
    TimeStateRemain?: number;
    TimeStateEnd?: number;
    [key: string]: unknown;
  };
  Sensor?: {
    RH?: number;         // Relative humidity %
    Temp?: number;        // Temperature °C (often x10)
    CO2?: number;         // CO2 ppm
    IaqCo2?: number;
    IaqRh?: number;
    [key: string]: unknown;
  };
  HeatRecovery?: {
    Temp_Oda?: number;    // Outdoor air temperature
    Temp_Sup?: number;    // Supply air temperature
    Temp_Eta?: number;    // Extract air temperature
    Temp_Eha?: number;    // Exhaust air temperature
    BypassState?: string;
    [key: string]: unknown;
  };
  Fan?: {
    SpeedRpm_Sup?: number;
    SpeedRpm_Eha?: number;
    FlowRate_Sup?: number;
    FlowRate_Eha?: number;
    [key: string]: unknown;
  };
  Filter?: {
    RemainingTime?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DucoNodeInfo {
  Nodes: DucoNode[];
}

export interface DucoAction {
  Action: string;
  ValType: string;
  Enum?: string[];
}

export interface DucoActionsResponse {
  Actions: DucoAction[];
}

export interface DucoSystemInfo {
  General?: {
    Type?: string;
    SubType?: string;
    BoardSerial?: string;
    SwVersionBox?: string;
    SwVersionCb?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── API Client ───────────────────────────────────────────────────────────────

export class DucoApiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(host: string, port: number = 80) {
    this.baseUrl = `http://${host}:${port}`;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: { 'Accept': 'application/json' },
    });
  }

  // ── Info endpoints ──────────────────────────────────────────────────────

  /**
   * Get all node info — returns sensor readings, ventilation state, etc.
   * This is the primary polling endpoint.
   */
  async getNodes(): Promise<DucoNode[]> {
    try {
      const resp = await this.client.get('/info/nodes');
      // The API may return { Nodes: [...] } or just [...]
      const data = resp.data;
      if (data.Nodes) return data.Nodes;
      if (Array.isArray(data)) return data;
      // Fallback: try alternative endpoint structure
      const resp2 = await this.client.get('/nodes');
      const data2 = resp2.data;
      if (data2.Nodes) return data2.Nodes;
      if (Array.isArray(data2)) return data2;
      return [];
    } catch (err) {
      throw new Error(`Failed to get nodes: ${(err as Error).message}`);
    }
  }

  /**
   * Get info for a specific node
   */
  async getNodeInfo(nodeId: number): Promise<DucoNode | null> {
    try {
      const resp = await this.client.get(`/info/nodes/${nodeId}`);
      return resp.data;
    } catch (err) {
      throw new Error(`Failed to get node ${nodeId}: ${(err as Error).message}`);
    }
  }

  /**
   * Get system info (board serial, firmware versions, etc.)
   */
  async getSystemInfo(): Promise<DucoSystemInfo> {
    try {
      const resp = await this.client.get('/info');
      return resp.data;
    } catch (err) {
      throw new Error(`Failed to get system info: ${(err as Error).message}`);
    }
  }

  // ── Action endpoints ────────────────────────────────────────────────────

  /**
   * Get supported actions for the whole device
   */
  async getActions(): Promise<DucoAction[]> {
    try {
      const resp = await this.client.get('/action');
      return resp.data.Actions || resp.data || [];
    } catch (err) {
      throw new Error(`Failed to get actions: ${(err as Error).message}`);
    }
  }

  /**
   * Get supported actions for a specific node
   */
  async getNodeActions(nodeId: number): Promise<DucoAction[]> {
    try {
      const resp = await this.client.get(`/action/${nodeId}`);
      return resp.data.Actions || resp.data || [];
    } catch (err) {
      throw new Error(`Failed to get node actions for ${nodeId}: ${(err as Error).message}`);
    }
  }

  /**
   * Send an action to the whole device (e.g. set ventilation mode)
   */
  async sendAction(action: string, value: string | number | boolean): Promise<void> {
    try {
      await this.client.post('/action', {
        Action: action,
        Val: value,
      });
    } catch (err) {
      throw new Error(`Failed to send action ${action}: ${(err as Error).message}`);
    }
  }

  /**
   * Send an action to a specific node
   */
  async sendNodeAction(nodeId: number, action: string, value: string | number | boolean): Promise<void> {
    try {
      await this.client.post(`/action/${nodeId}`, {
        Action: action,
        Val: value,
      });
    } catch (err) {
      throw new Error(`Failed to send action ${action} to node ${nodeId}: ${(err as Error).message}`);
    }
  }

  // ── Config endpoints ────────────────────────────────────────────────────

  /**
   * Get configuration for a specific node
   */
  async getNodeConfig(nodeId: number): Promise<Record<string, unknown>> {
    try {
      const resp = await this.client.get(`/config/nodes/${nodeId}`);
      return resp.data;
    } catch (err) {
      throw new Error(`Failed to get config for node ${nodeId}: ${(err as Error).message}`);
    }
  }

  // ── Health ──────────────────────────────────────────────────────────────

  /**
   * Check API health — useful for verifying connectivity
   */
  async checkHealth(): Promise<boolean> {
    try {
      const resp = await this.client.get('/health');
      return resp.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Attempt auto-discovery of API structure.
   * The local API might vary slightly between firmware versions.
   * This method tries common endpoint patterns and returns what works.
   */
  async discoverEndpoints(): Promise<{ infoEndpoint: string; actionEndpoint: string }> {
    const infoPaths = ['/info/nodes', '/nodes', '/info'];
    const actionPaths = ['/action', '/actions'];

    let infoEndpoint = '/info/nodes';
    let actionEndpoint = '/action';

    for (const path of infoPaths) {
      try {
        const resp = await this.client.get(path);
        if (resp.status === 200 && resp.data) {
          infoEndpoint = path;
          break;
        }
      } catch { /* try next */ }
    }

    for (const path of actionPaths) {
      try {
        const resp = await this.client.get(path);
        if (resp.status === 200) {
          actionEndpoint = path;
          break;
        }
      } catch { /* try next */ }
    }

    return { infoEndpoint, actionEndpoint };
  }
}
