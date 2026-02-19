"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DucoVentilationAccessory = void 0;
/**
 * Duco Ventilation Accessory
 *
 * Exposes the DucoBox as one grouped accessory in HomeKit with:
 *   - Fan service (shows actual airflow % — dynamic in Auto, fixed in manual)
 *   - 4 mutually exclusive mode switches: Auto, Level 1, Level 2, Level 3
 *   - Filter maintenance indicator
 *
 * All UI updates are optimistic — characteristics update immediately on tap,
 * then the API call fires in the background. If the API call fails, the next
 * poll cycle will correct the state.
 *
 * In Auto mode, the fan speed reflects the Duco's actual demand-driven airflow
 * and updates each poll cycle. In manual modes, the speed is fixed:
 *   Level 1 = 33%, Level 2 = 66%, Level 3 = 100%
 */
const MODE_SPEED = {
    AUTO: 0,
    MAN1: 33,
    MAN2: 66,
    MAN3: 100,
};
class DucoVentilationAccessory {
    constructor(platform, accessory, node, api, config) {
        this.platform = platform;
        this.accessory = accessory;
        this.api = api;
        this.config = config;
        this.currentMode = 'AUTO';
        this.currentSpeed = 0; // 0-100, reflects actual airflow in Auto
        this.currentNode = node;
        // ── Accessory Information ───────────────────────────────────────────
        this.infoService = this.accessory.getService(this.platform.Service.AccessoryInformation);
        this.infoService
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Duco')
            .setCharacteristic(this.platform.Characteristic.Model, 'DucoBox Energy 450')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, node.General?.Ident || 'Unknown')
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, node.General?.SwVersion || '1.0');
        // ── Fan Service (shows actual airflow) ───────────────────────────────
        this.fanService = this.accessory.getService(this.platform.Service.Fanv2) ||
            this.accessory.addService(this.platform.Service.Fanv2, 'Ventilation');
        this.fanService.getCharacteristic(this.platform.Characteristic.Active)
            .onGet(this.getActive.bind(this))
            .onSet(this.setActive.bind(this));
        this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .onGet(this.getRotationSpeed.bind(this))
            .onSet(this.setRotationSpeed.bind(this))
            .setProps({ minValue: 0, maxValue: 100, minStep: 1 });
        // ── Remove old services if they exist (migration from old plugin) ────
        const oldBoostService = this.accessory.getService('Boost');
        if (oldBoostService) {
            this.platform.log.info('Removing old Boost service (migrated to Level switches)');
            this.accessory.removeService(oldBoostService);
        }
        const oldAutoService = this.accessory.getService('Auto Mode');
        if (oldAutoService) {
            this.platform.log.info('Removing old Auto Mode service (migrated to Auto switch)');
            this.accessory.removeService(oldAutoService);
        }
        // ── Mode Switches (mutually exclusive) ───────────────────────────────
        this.autoSwitchService = this.accessory.getService('Auto') ||
            this.accessory.addService(this.platform.Service.Switch, 'Auto', 'mode-auto');
        this.level1SwitchService = this.accessory.getService('Level 1') ||
            this.accessory.addService(this.platform.Service.Switch, 'Level 1', 'mode-level1');
        this.level2SwitchService = this.accessory.getService('Level 2') ||
            this.accessory.addService(this.platform.Service.Switch, 'Level 2', 'mode-level2');
        this.level3SwitchService = this.accessory.getService('Level 3') ||
            this.accessory.addService(this.platform.Service.Switch, 'Level 3', 'mode-level3');
        this.autoSwitchService.getCharacteristic(this.platform.Characteristic.On)
            .onGet(() => this.currentMode === 'AUTO')
            .onSet(this.handleModeSwitch.bind(this, 'AUTO'));
        this.level1SwitchService.getCharacteristic(this.platform.Characteristic.On)
            .onGet(() => this.currentMode === 'MAN1')
            .onSet(this.handleModeSwitch.bind(this, 'MAN1'));
        this.level2SwitchService.getCharacteristic(this.platform.Characteristic.On)
            .onGet(() => this.currentMode === 'MAN2')
            .onSet(this.handleModeSwitch.bind(this, 'MAN2'));
        this.level3SwitchService.getCharacteristic(this.platform.Characteristic.On)
            .onGet(() => this.currentMode === 'MAN3')
            .onSet(this.handleModeSwitch.bind(this, 'MAN3'));
        // ── Filter Maintenance Service ──────────────────────────────────────
        this.filterService = this.accessory.getService(this.platform.Service.FilterMaintenance) ||
            this.accessory.addService(this.platform.Service.FilterMaintenance, 'Filter');
        this.filterService.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
            .onGet(this.getFilterStatus.bind(this));
        // Initial state from node data
        this.updateFromNode(node);
    }
    // ── Fan control ──────────────────────────────────────────────────────────
    getActive() {
        return this.platform.Characteristic.Active.ACTIVE;
    }
    async setActive(value) {
        // Ventilation should always be active — turning "off" goes to Auto
        if (value === this.platform.Characteristic.Active.INACTIVE) {
            this.setModeOptimistic('AUTO');
            this.sendModeToApi('AUTO');
        }
    }
    getRotationSpeed() {
        return this.currentSpeed;
    }
    async setRotationSpeed(value) {
        const speed = value;
        // Map slider position to nearest mode
        let mode;
        if (speed <= 0) {
            mode = 'AUTO';
        }
        else if (speed <= 33) {
            mode = 'MAN1';
        }
        else if (speed <= 66) {
            mode = 'MAN2';
        }
        else {
            mode = 'MAN3';
        }
        // Optimistic update
        this.setModeOptimistic(mode);
        // Fire API call in background
        this.sendModeToApi(mode);
    }
    // ── Mode switching (the core logic) ──────────────────────────────────────
    /**
     * Handle a mode switch tap. All four switches funnel through here.
     * Tapping an already-active switch turns it off → go to Auto.
     * Tapping an inactive switch activates it and deactivates the others.
     */
    async handleModeSwitch(mode, value) {
        const turnOn = value;
        if (!turnOn) {
            // Turning off the current mode → fall back to Auto
            this.setModeOptimistic('AUTO');
            this.sendModeToApi('AUTO');
        }
        else {
            // Turning on this mode
            this.setModeOptimistic(mode);
            this.sendModeToApi(mode);
        }
    }
    /**
     * Optimistically update all HomeKit characteristics to reflect the new mode.
     * This is instant — no API call involved.
     */
    setModeOptimistic(mode) {
        this.currentMode = mode;
        this.currentSpeed = MODE_SPEED[mode];
        // Update fan speed
        this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.currentSpeed);
        // Update all mode switches — only the active one should be on
        this.autoSwitchService.updateCharacteristic(this.platform.Characteristic.On, mode === 'AUTO');
        this.level1SwitchService.updateCharacteristic(this.platform.Characteristic.On, mode === 'MAN1');
        this.level2SwitchService.updateCharacteristic(this.platform.Characteristic.On, mode === 'MAN2');
        this.level3SwitchService.updateCharacteristic(this.platform.Characteristic.On, mode === 'MAN3');
    }
    // ── Filter ───────────────────────────────────────────────────────────────
    getFilterStatus() {
        const remaining = this.currentNode.Filter?.RemainingTime;
        if (remaining != null && remaining <= 0) {
            return this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER;
        }
        return this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
    }
    // ── API communication (fire-and-forget) ──────────────────────────────────
    /**
     * Send mode change to the Duco API in the background.
     * Does NOT block the UI — if it fails, the next poll will correct state.
     */
    sendModeToApi(mode) {
        this.setDucoMode(mode).catch((err) => {
            this.platform.log.warn(`API call for mode ${mode} failed — will correct on next poll:`, err.message);
        });
    }
    async setDucoMode(mode) {
        // Try different action names — the exact name depends on firmware
        const actionNames = ['SetVentilationMode', 'SetMode', 'SetVentilation'];
        let success = false;
        for (const actionName of actionNames) {
            try {
                await this.api.sendAction(actionName, mode);
                this.platform.log.debug(`Set ventilation mode to ${mode} via ${actionName}`);
                success = true;
                break;
            }
            catch {
                // try next action name
            }
        }
        if (!success) {
            // Try node-level action on the BOX node
            await this.api.sendNodeAction(this.currentNode.Node, 'SetMode', mode);
            this.platform.log.debug(`Set ventilation mode to ${mode} via node action`);
        }
    }
    // ── Update from polled data ──────────────────────────────────────────────
    updateFromNode(node) {
        this.currentNode = node;
        this.accessory.context.node = node;
        // Update ventilation state from node data
        const mode = node.Ventilation?.Mode;
        if (mode) {
            const modeUpper = mode.toUpperCase();
            if (modeUpper === 'AUTO' || modeUpper === 'AUT') {
                this.currentMode = 'AUTO';
                // In Auto mode, try to get actual flow percentage from the Duco
                const flowTarget = node.Ventilation?.FlowLvlTgt;
                if (flowTarget != null && flowTarget >= 0) {
                    this.currentSpeed = Math.min(100, Math.max(0, flowTarget));
                }
                else {
                    this.currentSpeed = 0;
                }
            }
            else if (modeUpper === 'MAN1' || modeUpper === 'CNT1' || modeUpper === 'LOW') {
                this.currentMode = 'MAN1';
                this.currentSpeed = MODE_SPEED.MAN1;
            }
            else if (modeUpper === 'MAN2' || modeUpper === 'CNT2' || modeUpper === 'MEDIUM') {
                this.currentMode = 'MAN2';
                this.currentSpeed = MODE_SPEED.MAN2;
            }
            else if (modeUpper === 'MAN3' || modeUpper === 'CNT3' || modeUpper === 'HIGH') {
                this.currentMode = 'MAN3';
                this.currentSpeed = MODE_SPEED.MAN3;
            }
            // Update fan speed
            this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.currentSpeed);
            // Update mode switches
            this.autoSwitchService.updateCharacteristic(this.platform.Characteristic.On, this.currentMode === 'AUTO');
            this.level1SwitchService.updateCharacteristic(this.platform.Characteristic.On, this.currentMode === 'MAN1');
            this.level2SwitchService.updateCharacteristic(this.platform.Characteristic.On, this.currentMode === 'MAN2');
            this.level3SwitchService.updateCharacteristic(this.platform.Characteristic.On, this.currentMode === 'MAN3');
        }
        // Update filter status
        this.filterService.updateCharacteristic(this.platform.Characteristic.FilterChangeIndication, this.getFilterStatus());
    }
}
exports.DucoVentilationAccessory = DucoVentilationAccessory;
