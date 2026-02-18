"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DucoEnergyPlatform = void 0;
const path_1 = __importDefault(require("path"));
const ducoApi_1 = require("./ducoApi");
const dataLogger_1 = require("./dataLogger");
const dashboard_1 = require("./dashboard");
const ducoBoxAccessory_1 = require("./ducoBoxAccessory");
const ducoSensorAccessory_1 = require("./ducoSensorAccessory");
const PLATFORM_NAME = 'DucoEnergy';
const PLUGIN_NAME = 'homebridge-duco-energy';
class DucoEnergyPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.dashboard = null;
        this.accessories = [];
        this.boxAccessories = new Map();
        this.sensorAccessories = new Map();
        this.pollingTimer = null;
        this.cleanupTimer = null;
        this.config = config;
        if (!this.config.host) {
            this.log.error('No host configured! Please set the Duco Connectivity Board IP address.');
            this.apiClient = new ducoApi_1.DucoApiClient('0.0.0.0');
            this.dataLogger = new dataLogger_1.DataLogger(path_1.default.join(api.user.storagePath(), 'duco-energy.db'));
            return;
        }
        this.apiClient = new ducoApi_1.DucoApiClient(this.config.host);
        // Initialize data logger
        const dbPath = path_1.default.join(api.user.storagePath(), 'duco-energy.db');
        const retentionDays = this.config.dataRetentionDays ?? 30;
        this.dataLogger = new dataLogger_1.DataLogger(dbPath, retentionDays);
        this.log.info(`Duco Energy plugin initializing. Host: ${this.config.host}`);
        // When Homebridge finishes loading cached accessories
        this.api.on('didFinishLaunching', () => {
            this.log.info('Duco Energy: didFinishLaunching');
            this.discoverDevices();
        });
        // Cleanup on shutdown
        this.api.on('shutdown', () => {
            this.log.info('Duco Energy: shutting down');
            if (this.pollingTimer)
                clearInterval(this.pollingTimer);
            if (this.cleanupTimer)
                clearInterval(this.cleanupTimer);
            if (this.dashboard)
                this.dashboard.stop();
            this.dataLogger.close();
        });
    }
    /**
     * Called by Homebridge for each cached accessory at startup
     */
    configureAccessory(accessory) {
        this.log.info(`Loading cached accessory: ${accessory.displayName}`);
        this.accessories.push(accessory);
    }
    /**
     * Discover Duco nodes and register accessories
     */
    async discoverDevices() {
        try {
            // Test connection
            const connected = await this.apiClient.testConnection();
            if (!connected) {
                this.log.error(`Cannot connect to Duco box at ${this.config.host}. Will retry on next poll.`);
                this.startPolling();
                return;
            }
            this.log.info('Connected to Duco box successfully!');
            // Fetch all nodes
            const response = await this.apiClient.getNodes();
            const nodes = response.Nodes ?? [];
            this.log.info(`Discovered ${nodes.length} nodes on Duco network`);
            for (const node of nodes) {
                this.log.info(`Node ${node.Node} raw: Type=${JSON.stringify(node.General?.Type)}, Name=${JSON.stringify(node.General?.Name)}, SubType=${JSON.stringify(node.General?.SubType)}`);
                const nodeType = node.General?.Type?.Val || 'UNKNOWN';
                const nodeName = node.General?.Name?.Val || `Duco ${nodeType} ${node.Node}`;
                const uuid = this.api.hap.uuid.generate(`duco-${this.config.host}-node-${node.Node}`);
                // Check if already cached
                const existingAccessory = this.accessories.find(a => a.UUID === uuid);
                if (nodeType === 'BOX') {
                    // Main ventilation box → Fan accessory
                    if (existingAccessory) {
                        this.log.info(`Restoring BOX accessory: ${nodeName}`);
                        const boxAcc = new ducoBoxAccessory_1.DucoBoxAccessory(this, existingAccessory, this.log, node.Node);
                        this.boxAccessories.set(node.Node, boxAcc);
                    }
                    else {
                        this.log.info(`Adding new BOX accessory: ${nodeName}`);
                        const accessory = new this.api.platformAccessory(nodeName, uuid);
                        accessory.context.nodeId = node.Node;
                        accessory.context.nodeType = nodeType;
                        const boxAcc = new ducoBoxAccessory_1.DucoBoxAccessory(this, accessory, this.log, node.Node);
                        this.boxAccessories.set(node.Node, boxAcc);
                        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                        this.accessories.push(accessory);
                    }
                }
                else if (['BSRH', 'UCCO2', 'UCRH'].includes(nodeType)) {
                    // Sensor nodes → Humidity + Air Quality + Motion (override indicator)
                    if (existingAccessory) {
                        this.log.info(`Restoring sensor accessory: ${nodeName} (${nodeType})`);
                        const sensorAcc = new ducoSensorAccessory_1.DucoSensorAccessory(this, existingAccessory, this.log, node.Node, nodeName, nodeType);
                        this.sensorAccessories.set(node.Node, sensorAcc);
                    }
                    else {
                        this.log.info(`Adding new sensor accessory: ${nodeName} (${nodeType})`);
                        const accessory = new this.api.platformAccessory(`${nodeName}`, uuid);
                        accessory.context.nodeId = node.Node;
                        accessory.context.nodeType = nodeType;
                        const sensorAcc = new ducoSensorAccessory_1.DucoSensorAccessory(this, accessory, this.log, node.Node, nodeName, nodeType);
                        this.sensorAccessories.set(node.Node, sensorAcc);
                        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                        this.accessories.push(accessory);
                    }
                }
                else {
                    this.log.debug(`Skipping unsupported node type: ${nodeType} (${nodeName})`);
                }
            }
            // Remove orphaned accessories
            const activeUUIDs = nodes.map(n => this.api.hap.uuid.generate(`duco-${this.config.host}-node-${n.Node}`));
            const orphans = this.accessories.filter(a => !activeUUIDs.includes(a.UUID));
            if (orphans.length > 0) {
                this.log.info(`Removing ${orphans.length} orphaned accessories`);
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, orphans);
            }
            // Start polling & dashboard
            this.startPolling();
            this.startDashboard();
            this.startCleanupTimer();
        }
        catch (err) {
            this.log.error(`Failed to discover devices: ${err}`);
            // Start polling anyway to retry
            this.startPolling();
            this.startDashboard();
        }
    }
    /**
     * Poll the Duco API at regular intervals
     */
    startPolling() {
        const interval = (this.config.pollingInterval ?? 30) * 1000;
        this.log.info(`Starting polling every ${interval / 1000}s`);
        const poll = async () => {
            try {
                const response = await this.apiClient.getNodes();
                const nodes = response.Nodes ?? [];
                // Update accessories
                for (const node of nodes) {
                    const boxAcc = this.boxAccessories.get(node.Node);
                    if (boxAcc)
                        boxAcc.updateFromNode(node);
                    const sensorAcc = this.sensorAccessories.get(node.Node);
                    if (sensorAcc)
                        sensorAcc.updateFromNode(node);
                }
                // Log to database
                this.dataLogger.logNodes(nodes);
            }
            catch (err) {
                this.log.warn(`Poll failed: ${err}`);
            }
        };
        // Initial poll
        poll();
        // Regular interval
        this.pollingTimer = setInterval(poll, interval);
    }
    /**
     * Start the web dashboard
     */
    startDashboard() {
        if (this.config.enableDashboard === false) {
            this.log.info('Dashboard disabled in config');
            return;
        }
        const port = this.config.dashboardPort ?? 9100;
        this.dashboard = new dashboard_1.DashboardServer(this.dataLogger, this.log, port);
        this.dashboard.start();
    }
    /**
     * Periodically clean up old data
     */
    startCleanupTimer() {
        // Run cleanup once a day
        this.cleanupTimer = setInterval(() => {
            this.log.info('Running data cleanup...');
            this.dataLogger.cleanup();
        }, 86400000);
        // Also run once at startup
        this.dataLogger.cleanup();
    }
}
exports.DucoEnergyPlatform = DucoEnergyPlatform;
