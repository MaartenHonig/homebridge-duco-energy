"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DucoBoxAccessory = void 0;
class DucoBoxAccessory {
    constructor(platform, accessory, log, nodeId) {
        this.platform = platform;
        this.accessory = accessory;
        this.log = log;
        this.modes = [];
        this.currentState = 'AUTO';
        this.currentFlow = 0;
        this.nodeId = nodeId;
        // Accessory info
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Duco')
            .setCharacteristic(this.platform.Characteristic.Model, 'DucoBox Energy')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `DUCO-BOX-${nodeId}`);
        // ─── Remove old Lightbulb service from previous version ───────
        const oldLightbulb = this.accessory.getServiceById(this.platform.Service.Lightbulb, 'duco-flow');
        if (oldLightbulb) {
            this.log.info('Removing old Lightbulb flow service (migrated to Fan)');
            this.accessory.removeService(oldLightbulb);
        }
        // ─── Fan service: flow % indicator (read-only speed) ──────────
        this.flowService = this.accessory.getServiceById(this.platform.Service.Fanv2, 'duco-flow')
            || this.accessory.addService(this.platform.Service.Fanv2, 'Duco Flow %', 'duco-flow');
        this.flowService.setCharacteristic(this.platform.Characteristic.Name, 'Duco Flow %');
        this.flowService.displayName = 'Duco Flow %';
        try {
            this.flowService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Duco Flow %');
        }
        catch { /* older HAP */ }
        // Always active — ventilation is always running
        this.flowService.getCharacteristic(this.platform.Characteristic.Active)
            .onGet(() => this.platform.Characteristic.Active.ACTIVE)
            .onSet(() => {
            // Ignore off — snap back to active
            this.flowService.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
        });
        // RotationSpeed = flow % from API. Dragging does nothing — snaps back.
        this.flowService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
            .onGet(() => this.currentFlow)
            .onSet(() => {
            // Ignore user drag — snap back to real value
            this.flowService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.currentFlow);
        });
        // ─── 4 Mode switches ─────────────────────────────────────────
        const modeDefinitions = [
            { name: 'Duco Auto', state: 'AUTO', subtype: 'duco-auto' },
            { name: 'Duco Speed 1', state: 'MAN1', subtype: 'duco-man1' },
            { name: 'Duco Speed 2', state: 'MAN2', subtype: 'duco-man2' },
            { name: 'Duco Speed 3', state: 'MAN3', subtype: 'duco-man3' },
        ];
        // Remove any stale switch services that don't match our subtypes
        const validSubtypes = modeDefinitions.map(d => d.subtype);
        const allSwitches = this.accessory.services.filter(s => s.UUID === this.platform.Service.Switch.UUID);
        for (const svc of allSwitches) {
            if (!validSubtypes.includes(svc.subtype || '')) {
                this.accessory.removeService(svc);
            }
        }
        for (const def of modeDefinitions) {
            let service = this.accessory.getServiceById(this.platform.Service.Switch, def.subtype);
            if (!service) {
                service = this.accessory.addService(this.platform.Service.Switch, def.name, def.subtype);
            }
            // Set the display name clearly
            service.setCharacteristic(this.platform.Characteristic.Name, def.name);
            service.displayName = def.name;
            // Try to set ConfiguredName if available (iOS 15+)
            try {
                service.setCharacteristic(this.platform.Characteristic.ConfiguredName, def.name);
            }
            catch {
                // ConfiguredName not available on older HAP versions
            }
            const mode = {
                name: def.name,
                state: def.state,
                service,
            };
            service.getCharacteristic(this.platform.Characteristic.On)
                .onGet(() => this.currentState === def.state)
                .onSet((value) => {
                if (value) {
                    this.setVentilationState(def.state);
                }
                else {
                    // Turning off the active mode → go to AUTO
                    if (this.currentState === def.state) {
                        this.setVentilationState('AUTO');
                    }
                }
            });
            this.modes.push(mode);
        }
    }
    setVentilationState(state) {
        if (state === this.currentState)
            return;
        this.log.info(`Setting ventilation to ${state} (node ${this.nodeId})`);
        // Optimistic update — instantly update switches in HomeKit
        this.currentState = state;
        this.updateSwitchStates();
        // Flow % is NOT guessed — it stays at current value until the next
        // poll brings the real FlowLvlTgt from the API
        // Fire API call in background — if it fails, next poll corrects state
        this.platform.apiClient.setNodeVentilationState(this.nodeId, state)
            .catch((err) => {
            this.log.warn(`API call for ${state} failed — will correct on next poll: ${err}`);
        });
    }
    updateSwitchStates() {
        for (const mode of this.modes) {
            mode.service.updateCharacteristic(this.platform.Characteristic.On, this.currentState === mode.state);
        }
    }
    updateFromNode(node) {
        const state = node.Ventilation?.State?.Val || 'AUTO';
        const flow = node.Ventilation?.FlowLvlTgt?.Val ?? 0;
        if (state !== this.currentState) {
            this.currentState = state;
            this.updateSwitchStates();
        }
        if (flow !== this.currentFlow) {
            this.currentFlow = flow;
            this.flowService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.currentFlow);
        }
    }
}
exports.DucoBoxAccessory = DucoBoxAccessory;
