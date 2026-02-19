import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { DucoApiClient, DucoNode } from './ducoApi';
import { DataLogger } from './dataLogger';
import { DashboardServer } from './dashboard';
import { DucoVentilationAccessory } from './ventilationAccessory';
import { DucoSensorAccessory } from './sensorAccessory';

const PLUGIN_NAME = 'homebridge-duco';
const PLATFORM_NAME = 'DucoPlatform';

export interface DucoPluginConfig extends PlatformConfig {
  host: string;
  port?: number;
  pollingInterval?: number;       // seconds, default 30
  dashboardPort?: number;          // default 8581
  dataRetentionDays?: number;      // default 30
  boostDurationMinutes?: number;   // default 45 (3x15 min)
}

export class DucoPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly accessories: PlatformAccessory[] = [];
  private readonly discoveredAccessories: Map<string, DucoVentilationAccessory | DucoSensorAccessory> = new Map();

  private api!: DucoApiClient;
  private dataLogger!: DataLogger;
  private dashboard!: DashboardServer;
  private pollingTimer: NodeJS.Timeout | null = null;
  private purgeTimer: NodeJS.Timeout | null = null;
  private config: DucoPluginConfig;

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly homebridgeApi: API,
  ) {
    this.config = config as DucoPluginConfig;
    this.Service = this.homebridgeApi.hap.Service;
    this.Characteristic = this.homebridgeApi.hap.Characteristic;

    if (!this.config.host) {
      this.log.error('No Duco host configured! Please set "host" in the plugin config.');
      return;
    }

    this.log.info('Duco plugin initializing for host:', this.config.host);

    this.homebridgeApi.on('didFinishLaunching', () => {
      this.initialize();
    });
  }

  /**
   * Called by Homebridge to restore cached accessories
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Restoring cached accessory:', accessory.displayName);
    this.accessories.push(accessory);
  }

  /**
   * Main initialization — connect to Duco, discover nodes, start polling
   */
  private async initialize(): Promise<void> {
    try {
      // Set up API client
      this.api = new DucoApiClient(this.config.host, this.config.port || 80);

      // Test connectivity
      const healthy = await this.api.checkHealth();
      if (!healthy) {
        this.log.warn('Duco health check failed — will retry. Make sure the Connectivity Board is reachable at', this.config.host);
      }

      // Set up data logger
      const storagePath = this.homebridgeApi.user.storagePath();
      this.dataLogger = new DataLogger(storagePath, this.config.dataRetentionDays || 30);

      // Set up dashboard
      this.dashboard = new DashboardServer(
        this.dataLogger,
        this.log,
        this.config.dashboardPort || 8581,
      );
      this.dashboard.start();

      // Discover and register accessories
      await this.discoverDevices();

      // Start polling
      const interval = (this.config.pollingInterval || 30) * 1000;
      this.pollingTimer = setInterval(() => this.pollSensors(), interval);

      // Purge old data daily
      this.purgeTimer = setInterval(async () => {
        const purged = await this.dataLogger.purgeOldData();
        if (purged > 0) {
          this.log.info(`Purged ${purged} old sensor readings`);
        }
      }, 24 * 60 * 60 * 1000);

      this.log.info('Duco plugin initialized successfully');
    } catch (err) {
      this.log.error('Failed to initialize Duco plugin:', (err as Error).message);
    }
  }

  /**
   * Discover all nodes on the Duco network and create accessories
   */
  private async discoverDevices(): Promise<void> {
    try {
      const nodes = await this.api.getNodes();
      this.log.info(`Discovered ${nodes.length} Duco nodes`);

      for (const node of nodes) {
        const nodeType = node.General?.Type || 'UNKNOWN';
        const nodeId = node.Node;
        const uuid = this.homebridgeApi.hap.uuid.generate(`duco-${this.config.host}-${nodeId}`);
        const displayName = node.General?.Ident || `Duco ${nodeType} ${nodeId}`;

        this.log.info(`  Node ${nodeId}: ${nodeType} — "${displayName}"`);

        // Check if accessory already exists
        const existingAccessory = this.accessories.find(a => a.UUID === uuid);

        if (nodeType === 'BOX' || nodeType === 'DUCOBOX') {
          // Main ventilation box — fan control
          if (existingAccessory) {
            this.log.info('  → Restoring ventilation accessory from cache');
            const accessory = new DucoVentilationAccessory(
              this, existingAccessory, node, this.api, this.config,
            );
            this.discoveredAccessories.set(uuid, accessory);
          } else {
            this.log.info('  → Creating new ventilation accessory');
            const accessory = new this.homebridgeApi.platformAccessory(displayName, uuid);
            accessory.context.node = node;
            const ducoAccessory = new DucoVentilationAccessory(
              this, accessory, node, this.api, this.config,
            );
            this.discoveredAccessories.set(uuid, ducoAccessory);
            this.homebridgeApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
        } else if (
          nodeType === 'BSRH' || nodeType === 'UCCO2' || nodeType === 'UCRH' ||
          nodeType === 'SENSOR' || nodeType === 'UCBAT' ||
          nodeType.includes('SENSOR') || nodeType.includes('RH') || nodeType.includes('CO2')
        ) {
          // Sensor node — humidity/temperature/CO2
          if (existingAccessory) {
            this.log.info('  → Restoring sensor accessory from cache');
            const accessory = new DucoSensorAccessory(
              this, existingAccessory, node,
            );
            this.discoveredAccessories.set(uuid, accessory);
          } else {
            this.log.info('  → Creating new sensor accessory');
            const accessory = new this.homebridgeApi.platformAccessory(displayName, uuid);
            accessory.context.node = node;
            const ducoAccessory = new DucoSensorAccessory(
              this, accessory, node,
            );
            this.discoveredAccessories.set(uuid, ducoAccessory);
            this.homebridgeApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
        } else {
          // Other node types (valves, controllers, etc.) — register as sensor for monitoring
          this.log.info(`  → Node type "${nodeType}" — registering as generic sensor`);
          if (existingAccessory) {
            const accessory = new DucoSensorAccessory(this, existingAccessory, node);
            this.discoveredAccessories.set(uuid, accessory);
          } else {
            const accessory = new this.homebridgeApi.platformAccessory(displayName, uuid);
            accessory.context.node = node;
            const ducoAccessory = new DucoSensorAccessory(this, accessory, node);
            this.discoveredAccessories.set(uuid, ducoAccessory);
            this.homebridgeApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
        }
      }

      // Remove stale accessories that are no longer on the network
      const discoveredUUIDs = new Set(this.discoveredAccessories.keys());
      const staleAccessories = this.accessories.filter(a => !discoveredUUIDs.has(a.UUID));
      if (staleAccessories.length > 0) {
        this.log.info(`Removing ${staleAccessories.length} stale accessories`);
        this.homebridgeApi.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
      }
    } catch (err) {
      this.log.error('Failed to discover Duco devices:', (err as Error).message);
      this.log.error('Will retry on next poll cycle');
    }
  }

  /**
   * Poll all node sensor data and update accessories + data logger
   */
  private async pollSensors(): Promise<void> {
    try {
      const nodes = await this.api.getNodes();

      // Log to database for dashboard
      this.dataLogger.logNodes(nodes);

      // Update each accessory with fresh data
      for (const node of nodes) {
        const uuid = this.homebridgeApi.hap.uuid.generate(`duco-${this.config.host}-${node.Node}`);
        const accessory = this.discoveredAccessories.get(uuid);
        if (accessory) {
          accessory.updateFromNode(node);
        }
      }
    } catch (err) {
      this.log.warn('Poll failed:', (err as Error).message);
    }
  }
}

// ── Plugin registration ──────────────────────────────────────────────────────

export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, DucoPlatform);
};
