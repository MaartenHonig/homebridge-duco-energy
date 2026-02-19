import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  Logger,
} from 'homebridge';
import { DucoEnergyPlatform } from './platform';
import { DucoNode } from './ducoApi';

/**
 * DucoBox Ventilation Accessory
 *
 * Exposes the DucoBox as one grouped accessory in HomeKit:
 *   - Fan service showing actual flow % from the Duco API (read-only slider)
 *   - 4 mutually exclusive mode switches: Auto, Speed 1, Speed 2, Speed 3
 *   - 4 temperature sensors: Outdoor, Supply, Extract, Exhaust
 *
 * Flow levels for each manual mode are learned from observed API data.
 * Once learned, switching modes updates the flow slider instantly.
 */

interface VentilationMode {
  name: string;
  state: string;
  service: Service;
}

export class DucoBoxAccessory {
  private modes: VentilationMode[] = [];
  private flowService: Service;
  private tempOdaService: Service;
  private tempSupService: Service;
  private tempEtaService: Service;
  private tempEhaService: Service;
  private nodeId: number;
  private currentState: string = 'AUTO';
  private currentFlow: number = 0;

  // Flow levels learned from observed poll data
  private learnedFlowLevels: Record<string, number> = {};

  constructor(
    private readonly platform: DucoEnergyPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly log: Logger,
    nodeId: number,
  ) {
    this.nodeId = nodeId;

    // Restore learned flow levels from accessory context (persisted across restarts)
    if (this.accessory.context.learnedFlowLevels) {
      this.learnedFlowLevels = this.accessory.context.learnedFlowLevels;
      this.log.info(`Restored learned flow levels: ${JSON.stringify(this.learnedFlowLevels)}`);
    }

    // Accessory info
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Duco')
      .setCharacteristic(this.platform.Characteristic.Model, 'DucoBox Energy')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `DUCO-BOX-${nodeId}`);

    // ─── Remove old services from previous versions ───────────────
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
    } catch { /* older HAP */ }

    // Always active — ventilation is always running
    this.flowService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(() => this.platform.Characteristic.Active.ACTIVE)
      .onSet(() => {
        this.flowService.updateCharacteristic(
          this.platform.Characteristic.Active,
          this.platform.Characteristic.Active.ACTIVE,
        );
      });

    // RotationSpeed = flow % from API. Dragging does nothing — snaps back.
    this.flowService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
      .onGet(() => this.currentFlow)
      .onSet(() => {
        this.flowService.updateCharacteristic(
          this.platform.Characteristic.RotationSpeed,
          this.currentFlow,
        );
      });

    // ─── Temperature sensors ──────────────────────────────────────
    this.tempOdaService = this.getOrAddTempSensor('Outdoor', 'temp-oda');
    this.tempSupService = this.getOrAddTempSensor('Supply', 'temp-sup');
    this.tempEtaService = this.getOrAddTempSensor('Extract', 'temp-eta');
    this.tempEhaService = this.getOrAddTempSensor('Exhaust', 'temp-eha');

    // ─── 4 Mode switches ─────────────────────────────────────────
    const modeDefinitions = [
      { name: 'Duco Auto', state: 'AUTO', subtype: 'duco-auto' },
      { name: 'Duco Speed 1', state: 'MAN1', subtype: 'duco-man1' },
      { name: 'Duco Speed 2', state: 'MAN2', subtype: 'duco-man2' },
      { name: 'Duco Speed 3', state: 'MAN3', subtype: 'duco-man3' },
    ];

    // Remove any stale switch services that don't match our subtypes
    const validSubtypes = modeDefinitions.map(d => d.subtype);
    const allSwitches = this.accessory.services.filter(
      s => s.UUID === this.platform.Service.Switch.UUID,
    );
    for (const svc of allSwitches) {
      if (!validSubtypes.includes(svc.subtype || '')) {
        this.accessory.removeService(svc);
      }
    }

    for (const def of modeDefinitions) {
      let service = this.accessory.getServiceById(this.platform.Service.Switch, def.subtype);
      if (!service) {
        service = this.accessory.addService(
          this.platform.Service.Switch,
          def.name,
          def.subtype,
        );
      }

      service.setCharacteristic(this.platform.Characteristic.Name, def.name);
      service.displayName = def.name;
      try {
        service.setCharacteristic(this.platform.Characteristic.ConfiguredName, def.name);
      } catch { /* older HAP */ }

      const mode: VentilationMode = {
        name: def.name,
        state: def.state,
        service,
      };

      service.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.currentState === def.state)
        .onSet((value: CharacteristicValue) => {
          if (def.state === 'AUTO') {
            // Auto switch: on = go to auto, off = ignore (you're already not in auto)
            if (value) {
              this.setVentilationState('AUTO', false);
            }
          } else {
            // Manual mode switches:
            if (value) {
              // Tapping an inactive manual mode → switch to it
              this.setVentilationState(def.state, false);
            } else {
              // Tapping an active manual mode (toggle off) → stack timer (+15 min)
              if (this.currentState === def.state) {
                this.setVentilationState(def.state, true);
                // Keep the switch visually ON since we're stacking, not turning off
                service.updateCharacteristic(this.platform.Characteristic.On, true);
              }
            }
          }
        });

      this.modes.push(mode);
    }
  }

  private getOrAddTempSensor(name: string, subtype: string): Service {
    const fullName = `Duco ${name}`;
    let service = this.accessory.getServiceById(this.platform.Service.TemperatureSensor, subtype);
    if (!service) {
      service = this.accessory.addService(this.platform.Service.TemperatureSensor, fullName, subtype);
    }
    service.setCharacteristic(this.platform.Characteristic.Name, fullName);
    service.displayName = fullName;
    try {
      service.setCharacteristic(this.platform.Characteristic.ConfiguredName, fullName);
    } catch { /* older HAP */ }

    // Set reasonable range for ventilation temps
    service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({ minValue: -40, maxValue: 100 });

    return service;
  }

  private setVentilationState(state: string, stack: boolean = false): void {
    if (state === this.currentState && !stack) return;

    if (stack) {
      this.log.info(`Stacking timer for ${state} (+15 min, node ${this.nodeId})`);
    } else {
      this.log.info(`Setting ventilation to ${state} (node ${this.nodeId})`);
    }

    // Optimistic update — instantly update switches in HomeKit
    this.currentState = state;
    this.updateSwitchStates();

    // Optimistic flow update from learned levels
    if (this.learnedFlowLevels[state] !== undefined) {
      this.currentFlow = this.learnedFlowLevels[state];
      this.flowService.updateCharacteristic(
        this.platform.Characteristic.RotationSpeed,
        this.currentFlow,
      );
      this.log.debug(`Optimistic flow for ${state}: ${this.currentFlow}%`);
    }

    // Fire API call in background
    this.platform.apiClient.setNodeVentilationState(this.nodeId, state)
      .catch((err) => {
        this.log.warn(`API call for ${state} failed — will correct on next poll: ${err}`);
      });
  }

  private updateSwitchStates(): void {
    for (const mode of this.modes) {
      mode.service.updateCharacteristic(
        this.platform.Characteristic.On,
        this.currentState === mode.state,
      );
    }
  }

  updateFromNode(node: DucoNode): void {
    const state = node.Ventilation?.State?.Val || 'AUTO';
    const flow = node.Ventilation?.FlowLvlTgt?.Val ?? 0;

    // Learn flow level for this state
    if (state !== 'AUTO' && flow > 0) {
      if (this.learnedFlowLevels[state] !== flow) {
        this.learnedFlowLevels[state] = flow;
        this.accessory.context.learnedFlowLevels = this.learnedFlowLevels;
        this.log.info(`Learned flow level: ${state} = ${flow}%`);
      }
    }

    if (state !== this.currentState) {
      this.currentState = state;
      this.updateSwitchStates();
    }

    if (flow !== this.currentFlow) {
      this.currentFlow = flow;
      this.flowService.updateCharacteristic(
        this.platform.Characteristic.RotationSpeed,
        this.currentFlow,
      );
    }
  }

  /**
   * Update temperature sensors from system info poll
   */
  updateTemperatures(temps: { tempOda: number; tempSup: number; tempEta: number; tempEha: number }): void {
    this.tempOdaService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, temps.tempOda);
    this.tempSupService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, temps.tempSup);
    this.tempEtaService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, temps.tempEta);
    this.tempEhaService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, temps.tempEha);
  }
}
