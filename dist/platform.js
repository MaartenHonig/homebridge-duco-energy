"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DucoPlatform = void 0;
const ducoApi_1 = require("./ducoApi");
const dataLogger_1 = require("./dataLogger");
const dashboard_1 = require("./dashboard");
const ventilationAccessory_1 = require("./ventilationAccessory");
const sensorAccessory_1 = require("./sensorAccessory");
const PLUGIN_NAME = 'homebridge-duco';
const PLATFORM_NAME = 'DucoPlatform';
class DucoPlatform {
    constructor(log, config, homebridgeApi) {
        this.log = log;
        this.homebridgeApi = homebridgeApi;
        this.accessories = [];
        this.discoveredAccessories = new Map();
        this.pollingTimer = null;
        this.purgeTimer = null;
        this.config = config;
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
    configureAccessory(accessory) {
        this.log.info('Restoring cached accessory:', accessory.displayName);
        this.accessories.push(accessory);
    }
    /**
     * Main initialization — connect to Duco, discover nodes, start polling
     */
    async initialize() {
        try {
            // Set up API client
            this.api = new ducoApi_1.DucoApiClient(this.config.host, this.config.port || 80);
            // Test connectivity
            const healthy = await this.api.checkHealth();
            if (!healthy) {
                this.log.warn('Duco health check failed — will retry. Make sure the Connectivity Board is reachable at', this.config.host);
            }
            // Set up data logger
            const storagePath = this.homebridgeApi.user.storagePath();
            this.dataLogger = new dataLogger_1.DataLogger(storagePath, this.config.dataRetentionDays || 30);
            // Set up dashboard
            this.dashboard = new dashboard_1.DashboardServer(this.dataLogger, this.log, this.config.dashboardPort || 8581);
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
        }
        catch (err) {
            this.log.error('Failed to initialize Duco plugin:', err.message);
        }
    }
    /**
     * Discover all nodes on the Duco network and create accessories
     */
    async discoverDevices() {
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
                        const accessory = new ventilationAccessory_1.DucoVentilationAccessory(this, existingAccessory, node, this.api, this.config);
                        this.discoveredAccessories.set(uuid, accessory);
                    }
                    else {
                        this.log.info('  → Creating new ventilation accessory');
                        const accessory = new this.homebridgeApi.platformAccessory(displayName, uuid);
                        accessory.context.node = node;
                        const ducoAccessory = new ventilationAccessory_1.DucoVentilationAccessory(this, accessory, node, this.api, this.config);
                        this.discoveredAccessories.set(uuid, ducoAccessory);
                        this.homebridgeApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                    }
                }
                else if (nodeType === 'BSRH' || nodeType === 'UCCO2' || nodeType === 'UCRH' ||
                    nodeType === 'SENSOR' || nodeType === 'UCBAT' ||
                    nodeType.includes('SENSOR') || nodeType.includes('RH') || nodeType.includes('CO2')) {
                    // Sensor node — humidity/temperature/CO2
                    if (existingAccessory) {
                        this.log.info('  → Restoring sensor accessory from cache');
                        const accessory = new sensorAccessory_1.DucoSensorAccessory(this, existingAccessory, node);
                        this.discoveredAccessories.set(uuid, accessory);
                    }
                    else {
                        this.log.info('  → Creating new sensor accessory');
                        const accessory = new this.homebridgeApi.platformAccessory(displayName, uuid);
                        accessory.context.node = node;
                        const ducoAccessory = new sensorAccessory_1.DucoSensorAccessory(this, accessory, node);
                        this.discoveredAccessories.set(uuid, ducoAccessory);
                        this.homebridgeApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                    }
                }
                else {
                    // Other node types (valves, controllers, etc.) — register as sensor for monitoring
                    this.log.info(`  → Node type "${nodeType}" — registering as generic sensor`);
                    if (existingAccessory) {
                        const accessory = new sensorAccessory_1.DucoSensorAccessory(this, existingAccessory, node);
                        this.discoveredAccessories.set(uuid, accessory);
                    }
                    else {
                        const accessory = new this.homebridgeApi.platformAccessory(displayName, uuid);
                        accessory.context.node = node;
                        const ducoAccessory = new sensorAccessory_1.DucoSensorAccessory(this, accessory, node);
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
        }
        catch (err) {
            this.log.error('Failed to discover Duco devices:', err.message);
            this.log.error('Will retry on next poll cycle');
        }
    }
    /**
     * Poll all node sensor data and update accessories + data logger
     */
    async pollSensors() {
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
        }
        catch (err) {
            this.log.warn('Poll failed:', err.message);
        }
    }
}
exports.DucoPlatform = DucoPlatform;
// ── Plugin registration ──────────────────────────────────────────────────────
exports.default = (api) => {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, DucoPlatform);
};
