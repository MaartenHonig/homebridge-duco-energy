import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { DucoApiClient } from './ducoApi';
export declare class DucoEnergyPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    apiClient: DucoApiClient;
    private dataLogger;
    private dashboard;
    private readonly accessories;
    private boxAccessories;
    private sensorAccessories;
    private pollingTimer;
    private cleanupTimer;
    private readonly config;
    constructor(log: Logger, config: PlatformConfig, api: API);
    /**
     * Called by Homebridge for each cached accessory at startup
     */
    configureAccessory(accessory: PlatformAccessory): void;
    /**
     * Discover Duco nodes and register accessories
     */
    private discoverDevices;
    /**
     * Poll the Duco API at regular intervals
     */
    private startPolling;
    /**
     * Start the web dashboard
     */
    private startDashboard;
    /**
     * Periodically clean up old data
     */
    private startCleanupTimer;
}
