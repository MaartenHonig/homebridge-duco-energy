import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
export interface DucoPluginConfig extends PlatformConfig {
    host: string;
    port?: number;
    pollingInterval?: number;
    dashboardPort?: number;
    dataRetentionDays?: number;
    boostDurationMinutes?: number;
}
export declare class DucoPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly homebridgeApi: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    private readonly accessories;
    private readonly discoveredAccessories;
    private api;
    private dataLogger;
    private dashboard;
    private pollingTimer;
    private purgeTimer;
    private config;
    constructor(log: Logger, config: PlatformConfig, homebridgeApi: API);
    /**
     * Called by Homebridge to restore cached accessories
     */
    configureAccessory(accessory: PlatformAccessory): void;
    /**
     * Main initialization — connect to Duco, discover nodes, start polling
     */
    private initialize;
    /**
     * Discover all nodes on the Duco network and create accessories
     */
    private discoverDevices;
    /**
     * Poll all node sensor data and update accessories + data logger
     */
    private pollSensors;
}
declare const _default: (api: API) => void;
export default _default;
