"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DucoSensorAccessory = void 0;
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
class DucoSensorAccessory {
    constructor(platform, accessory, log, nodeId, nodeName, nodeType) {
        this.platform = platform;
        this.accessory = accessory;
        this.log = log;
        this.nodeId = nodeId;
        this.nodeName = nodeName;
        // Accessory info
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Duco')
            .setCharacteristic(this.platform.Characteristic.Model, `Duco ${nodeType}`)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `DUCO-${nodeType}-${nodeId}`);
        // ─── Humidity Sensor ──────────────────────────────────────────────
        this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor)
            || this.accessory.addService(this.platform.Service.HumiditySensor, `${nodeName} Humidity`);
        this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
            .onGet(() => this.accessory.context.rh ?? 0);
        // ─── Air Quality Sensor ───────────────────────────────────────────
        this.airQualityService = this.accessory.getService(this.platform.Service.AirQualitySensor)
            || this.accessory.addService(this.platform.Service.AirQualitySensor, `${nodeName} Air Quality`);
        this.airQualityService.getCharacteristic(this.platform.Characteristic.AirQuality)
            .onGet(() => this.mapIaqToHomeKit(this.accessory.context.iaqRh ?? 0));
        // CO2 level characteristic on the air quality sensor
        this.airQualityService.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
            .onGet(() => this.accessory.context.co2 ?? 0);
        // ─── Ventilation state as a switch indicator ──────────────────────
        this.ventilationStateService = this.accessory.getService(this.platform.Service.MotionSensor)
            || this.accessory.addService(this.platform.Service.MotionSensor, `${nodeName} Ventilation Active`);
        this.ventilationStateService.getCharacteristic(this.platform.Characteristic.MotionDetected)
            .onGet(() => {
            // "Motion detected" when ventilation is in manual override (not AUTO)
            const state = this.accessory.context.ventilationState ?? 'AUTO';
            return state !== 'AUTO';
        });
    }
    /**
     * Map IAQ index (0-100+) to HomeKit Air Quality levels
     * HomeKit: 0=Unknown, 1=Excellent, 2=Good, 3=Fair, 4=Inferior, 5=Poor
     */
    mapIaqToHomeKit(iaq) {
        if (iaq <= 0)
            return 0; // Unknown
        if (iaq <= 20)
            return 1; // Excellent
        if (iaq <= 40)
            return 2; // Good
        if (iaq <= 60)
            return 3; // Fair
        if (iaq <= 80)
            return 4; // Inferior
        return 5; // Poor
    }
    /**
     * Update from polled API data
     */
    updateFromNode(node) {
        const rh = node.Sensor?.Rh?.Val ?? 0;
        const co2 = node.Sensor?.Co2?.Val ?? 0;
        const iaqRh = node.Sensor?.IaqRh?.Val ?? 0;
        const iaqCo2 = node.Sensor?.IaqCo2?.Val ?? 0;
        const ventState = node.Ventilation?.State?.Val ?? 'AUTO';
        // Store in context for get handlers
        this.accessory.context.rh = rh;
        this.accessory.context.co2 = co2;
        this.accessory.context.iaqRh = iaqRh;
        this.accessory.context.iaqCo2 = iaqCo2;
        this.accessory.context.ventilationState = ventState;
        // Push updates to HomeKit
        this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, rh);
        this.airQualityService.updateCharacteristic(this.platform.Characteristic.AirQuality, this.mapIaqToHomeKit(iaqRh));
        this.airQualityService.updateCharacteristic(this.platform.Characteristic.CarbonDioxideLevel, co2);
        // Motion = ventilation override active
        this.ventilationStateService.updateCharacteristic(this.platform.Characteristic.MotionDetected, ventState !== 'AUTO');
    }
}
exports.DucoSensorAccessory = DucoSensorAccessory;
