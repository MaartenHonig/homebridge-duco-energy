import { PlatformAccessory, Logger } from 'homebridge';
import { DucoEnergyPlatform } from './platform';
import { DucoNode } from './ducoApi';
/**
 * Duco BSRH Sensor Accessory
 *
 * Exposes bathroom humidity/CO2 controllers as HomeKit sensors:
 * - Humidity Sensor (Rh %)
 * - Air Quality Sensor (IaqRh / IaqCo2 mapped to HomeKit AQ levels)
 *
 * Also exposes all raw values as custom characteristics visible in
 * third-party HomeKit apps (like Eve).
 */
export declare class DucoSensorAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly log;
    private humidityService;
    private airQualityService;
    private ventilationStateService;
    private nodeId;
    private nodeName;
    constructor(platform: DucoEnergyPlatform, accessory: PlatformAccessory, log: Logger, nodeId: number, nodeName: string, nodeType: string);
    /**
     * Map IAQ index (0-100+) to HomeKit Air Quality levels
     * HomeKit: 0=Unknown, 1=Excellent, 2=Good, 3=Fair, 4=Inferior, 5=Poor
     */
    private mapIaqToHomeKit;
    /**
     * Update from polled API data
     */
    updateFromNode(node: DucoNode): void;
}
