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
 * Exposes the DucoBox as 4 clearly labeled switches in HomeKit:
 *   - Duco Auto
 *   - Duco Speed 1
 *   - Duco Speed 2
 *   - Duco Speed 3
 *
 * Only one switch can be on at a time. Turning one on
 * automatically turns the others off.
 */

interface VentilationMode {
  name: string;
  state: string;
  service: Service;
}

export class DucoBoxAccessory {
  private modes: VentilationMode[] = [];
  private nodeId: number;
  private currentState: string = 'AUTO';

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

    // Remove any old Fan service from previous versions
    const oldFan = this.accessory.getService(this.platform.Service.Fanv2);
    if (oldFan) {
      this.accessory.removeService(oldFan);
    }

    // Create 4 switches with distinct names
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

  private async setVentilationState(state: string): Promise<void> {
    if (state === this.currentState) return;

    try {
      this.log.info(`Setting ventilation to ${state} (node ${this.nodeId})`);
      await this.platform.apiClient.setNodeVentilationState(this.nodeId, state);
      this.currentState = state;
      this.updateSwitchStates();
    } catch (err) {
      this.log.error(`Failed to set ventilation state: ${err}`);
    }
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
    if (state !== this.currentState) {
      this.currentState = state;
      this.updateSwitchStates();
    }
  }
}
