"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DucoBoxAccessory = void 0;
/**
 * DucoBox Ventilation Fan Accessory
 *
 * Exposes the main DucoBox unit as a Fan in HomeKit with 4 speeds:
 *   0% = AUTO mode
 *  33% = MAN1 (low)
 *  67% = MAN2 (medium)
 * 100% = MAN3 (high)
 *
 * The fan is always "on" (ventilation is always running).
 * Speed 0 maps to AUTO, not OFF.
 */
class DucoBoxAccessory {
    constructor(platform, accessory, log, nodeId) {
        this.platform = platform;
        this.accessory = accessory;
        this.log = log;
        this.currentState = 'AUTO';
        this.currentSpeed = 0;
        this.nodeId = nodeId;
        // Accessory info
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Duco')
            .setCharacteristic(this.platform.Characteristic.Model, 'DucoBox Energy')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `DUCO-BOX-${nodeId}`);
        // Fan v2 service
        this.service = this.accessory.getService(this.platform.Service.Fanv2)
            || this.accessory.addService(this.platform.Service.Fanv2, 'Duco Ventilation');
        // Active state (always active — ventilation can't be turned off)
        this.service.getCharacteristic(this.platform.Characteristic.Active)
            .onGet(() => this.platform.Characteristic.Active.ACTIVE)
            .onSet((_value) => {
            // Ventilation is always active, setting to inactive → go to AUTO
            this.setVentilationState('AUTO');
        });
        // Rotation speed: 0=AUTO, 33=MAN1, 67=MAN2, 100=MAN3
        this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
            .onGet(() => this.currentSpeed)
            .onSet((value) => {
            const speed = value;
            let state;
            if (speed <= 10) {
                state = 'AUTO';
            }
            else if (speed <= 40) {
                state = 'MAN1';
            }
            else if (speed <= 75) {
                state = 'MAN2';
            }
            else {
                state = 'MAN3';
            }
            this.setVentilationState(state);
        });
        // Current fan state (useful for showing in Home app)
        this.service.getCharacteristic(this.platform.Characteristic.CurrentFanState)
            .onGet(() => this.platform.Characteristic.CurrentFanState.BLOWING_AIR);
        // Target fan state: Auto = 1, Manual = 0
        this.service.getCharacteristic(this.platform.Characteristic.TargetFanState)
            .onGet(() => {
            return this.currentState === 'AUTO'
                ? this.platform.Characteristic.TargetFanState.AUTO
                : this.platform.Characteristic.TargetFanState.MANUAL;
        })
            .onSet((value) => {
            if (value === this.platform.Characteristic.TargetFanState.AUTO) {
                this.setVentilationState('AUTO');
            }
            // Manual is handled via RotationSpeed
        });
    }
    async setVentilationState(state) {
        try {
            this.log.info(`Setting ventilation to ${state} (node ${this.nodeId})`);
            await this.platform.apiClient.setNodeVentilationState(this.nodeId, state);
            this.currentState = state;
            this.currentSpeed = this.stateToSpeed(state);
        }
        catch (err) {
            this.log.error(`Failed to set ventilation state: ${err}`);
        }
    }
    stateToSpeed(state) {
        switch (state) {
            case 'AUTO': return 0;
            case 'MAN1': return 33;
            case 'MAN2': return 67;
            case 'MAN3': return 100;
            default: return 0;
        }
    }
    /**
     * Update from polled API data
     */
    updateFromNode(node) {
        const state = node.Ventilation?.State?.Val ?? 'AUTO';
        if (state !== this.currentState) {
            this.currentState = state;
            this.currentSpeed = this.stateToSpeed(state);
            this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.currentSpeed);
            this.service.updateCharacteristic(this.platform.Characteristic.TargetFanState, state === 'AUTO'
                ? this.platform.Characteristic.TargetFanState.AUTO
                : this.platform.Characteristic.TargetFanState.MANUAL);
        }
    }
}
exports.DucoBoxAccessory = DucoBoxAccessory;
