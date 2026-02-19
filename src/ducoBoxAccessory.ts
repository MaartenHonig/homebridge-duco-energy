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
 *
 * The fan slider always reflects FlowLvlTgt from the API. Dragging it
 * does nothing — it snaps back to the real value on the next poll.
 *
 * Mode switches update optimistically (instant UI), then fire the API
 * call in the background. If the API fails, the next poll corrects state.
 */

interface VentilationMode {
  name: string;
  state: string;
  service: Service;
}

export class DucoBoxAccessory {
  private modes: VentilationMode[] = [];
  private flowService: Service;
  private nodeId: number;
  private currentState: string = 'AUTO';
  private currentFlow: number = 0;

  constructor(
    private readonly platform: DucoEnergyPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly log: Logger,
    nodeId: number,
  ) {
    this.nodeId = nodeId;

    // Accessory info
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
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
    } catch { /* older HAP */ }

    // Always active — ventilation is always running
    this.flowService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(() => this.platform.Characteristic.Active.ACTIVE)
      .onSet(() => {
        // Ignore off — snap back to active
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
        // Ignore user drag — snap back to real value
        this.flowService.updateCharacteristic(
          this.platform.Characteristic.RotationSpeed,
          this.currentFlow,
        );
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

      // Set the display name clearly
      service.setCharacteristic(this.platform.Characteristic.Name, def.name);
      service.displayName = def.name;

      // Try to set ConfiguredName if available (iOS 15+)
      try {
        service.setCharacteristic(this.platform.Characteristic.ConfiguredName, def.name);
      } catch {
        // ConfiguredName not available on older HAP versions
      }

      const mode: VentilationMode = {
        name: def.name,
        state: def.state,
        service,
      };

      service.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.currentState === def.state)
        .onSet((value: CharacteristicValue) => {
          if (value) {
            this.setVentilationState(def.state);
          } else {
            // Turning off the active mode → go to AUTO
            if (this.currentState === def.state) {
              this.setVentilationState('AUTO');
            }
          }
        });

      this.modes.push(mode);
    }
  }

  private setVentilationState(state: string): void {
    if (state === this.currentState) return;

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
}
