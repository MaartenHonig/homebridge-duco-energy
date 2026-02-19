"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DucoSensorAccessory = void 0;
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
class DucoSensorAccessory {
    constructor(platform, accessory, currentNode) {
        this.platform = platform;
        this.accessory = accessory;
        this.currentNode = currentNode;
        this.humidityService = null;
        this.temperatureService = null;
        this.airQualityService = null;
        this.currentHumidity = 0;
        this.currentTemperature = 20;
        this.currentCO2 = 400;
        const nodeType = currentNode.General?.Type || 'UNKNOWN';
        // ── Accessory Information ───────────────────────────────────────────
        this.infoService = this.accessory.getService(this.platform.Service.AccessoryInformation);
        this.infoService
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Duco')
            .setCharacteristic(this.platform.Characteristic.Model, `Duco ${nodeType}`)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, currentNode.General?.Ident || `Node-${currentNode.Node}`)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, currentNode.General?.SwVersion || '1.0');
        // ── Humidity Sensor ─────────────────────────────────────────────────
        if (this.hasHumidity(currentNode)) {
            this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
                this.accessory.addService(this.platform.Service.HumiditySensor, 'Humidity');
            this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
                .onGet(this.getHumidity.bind(this));
        }
        // ── Temperature Sensor ──────────────────────────────────────────────
        if (this.hasTemperature(currentNode)) {
            this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
                this.accessory.addService(this.platform.Service.TemperatureSensor, 'Temperature');
            this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
                .onGet(this.getTemperature.bind(this))
                .setProps({ minValue: -40, maxValue: 100 });
        }
        // ── Air Quality Sensor (CO2) ────────────────────────────────────────
        if (this.hasCO2(currentNode)) {
            this.airQualityService = this.accessory.getService(this.platform.Service.AirQualitySensor) ||
                this.accessory.addService(this.platform.Service.AirQualitySensor, 'Air Quality');
            this.airQualityService.getCharacteristic(this.platform.Characteristic.AirQuality)
                .onGet(this.getAirQuality.bind(this));
            this.airQualityService.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
                .onGet(this.getCO2Level.bind(this));
        }
        // Apply initial values
        this.updateFromNode(currentNode);
    }
    // ── Humidity ─────────────────────────────────────────────────────────────
    getHumidity() {
        return this.currentHumidity;
    }
    // ── Temperature ──────────────────────────────────────────────────────────
    getTemperature() {
        return this.currentTemperature;
    }
    // ── Air Quality ──────────────────────────────────────────────────────────
    getAirQuality() {
        const co2 = this.currentCO2;
        const AQ = this.platform.Characteristic.AirQuality;
        if (co2 <= 400)
            return AQ.EXCELLENT;
        if (co2 <= 700)
            return AQ.GOOD;
        if (co2 <= 1000)
            return AQ.FAIR;
        if (co2 <= 1500)
            return AQ.INFERIOR;
        return AQ.POOR;
    }
    getCO2Level() {
        return this.currentCO2;
    }
    // ── Node type detection helpers ──────────────────────────────────────────
    hasHumidity(node) {
        const type = (node.General?.Type || '').toUpperCase();
        return (node.Sensor?.RH != null ||
            node.Sensor?.IaqRh != null ||
            type.includes('RH') ||
            type === 'BSRH' ||
            type === 'UCRH');
    }
    hasTemperature(node) {
        return (node.Sensor?.Temp != null ||
            node.HeatRecovery?.Temp_Oda != null ||
            node.HeatRecovery?.Temp_Sup != null ||
            node.HeatRecovery?.Temp_Eta != null);
    }
    hasCO2(node) {
        const type = (node.General?.Type || '').toUpperCase();
        return (node.Sensor?.CO2 != null ||
            node.Sensor?.IaqCo2 != null ||
            type.includes('CO2') ||
            type === 'UCCO2');
    }
    // ── Update from polled data ──────────────────────────────────────────────
    updateFromNode(node) {
        this.currentNode = node;
        this.accessory.context.node = node;
        // Update humidity
        if (this.humidityService) {
            const rh = node.Sensor?.RH ?? node.Sensor?.IaqRh;
            if (rh != null) {
                // Duco may report humidity as integer (0-100) or with decimal
                this.currentHumidity = Math.max(0, Math.min(100, rh));
                this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.currentHumidity);
            }
        }
        // Update temperature
        if (this.temperatureService) {
            let temp = node.Sensor?.Temp;
            if (temp == null) {
                temp = node.HeatRecovery?.Temp_Eta ?? node.HeatRecovery?.Temp_Sup;
            }
            if (temp != null) {
                // Duco often returns temp * 10 (e.g. 215 = 21.5°C)
                this.currentTemperature = temp > 100 ? temp / 10 : temp;
                this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.currentTemperature);
            }
        }
        // Update CO2
        if (this.airQualityService) {
            const co2 = node.Sensor?.CO2 ?? node.Sensor?.IaqCo2;
            if (co2 != null) {
                this.currentCO2 = co2;
                this.airQualityService.updateCharacteristic(this.platform.Characteristic.AirQuality, this.getAirQuality());
                this.airQualityService.updateCharacteristic(this.platform.Characteristic.CarbonDioxideLevel, this.currentCO2);
            }
        }
    }
}
exports.DucoSensorAccessory = DucoSensorAccessory;
