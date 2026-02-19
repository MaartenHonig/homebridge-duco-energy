import { PlatformAccessory } from 'homebridge';
import { DucoPlatform } from './platform';
import { DucoNode } from './ducoApi';
/**
 * Sensor accessory for Duco sensor nodes (BSRH, UCCO2, etc.)
 *
 * BSRH = Built-in Sensor Relative Humidity (your bathroom controllers)
 * UCCO2 = User Controller CO2
 * UCRH = User Controller Relative Humidity
 *
 * Exposes to HomeKit:
 *   - Humidity Sensor (if node has RH data)
 *   - Temperature Sensor (if node has Temp data)
 *   - Air Quality Sensor (if node has CO2 data)
 */
export declare class DucoSensorAccessory {
    private readonly platform;
    private readonly accessory;
    private currentNode;
    private humidityService;
    private temperatureService;
    private airQualityService;
    private infoService;
    private currentHumidity;
    private currentTemperature;
    private currentCO2;
    constructor(platform: DucoPlatform, accessory: PlatformAccessory, currentNode: DucoNode);
    private getHumidity;
    private getTemperature;
    private getAirQuality;
    private getCO2Level;
    private hasHumidity;
    private hasTemperature;
    private hasCO2;
    updateFromNode(node: DucoNode): void;
}
