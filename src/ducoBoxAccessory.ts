import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  Logger,
} from 'homebridge';
import { DucoEnergyPlatform } from './platform';
import { DucoNode } from './ducoApi';

/**
 * DucoBox Ventilation Accessory — 4 Switches
 *
 * Exposes the DucoBox as 4 mutually exclusive switches in HomeKit:
 *   - Auto
 *   - Speed 1 (MAN1)
 *   - Speed 2 (MAN2)
 *   - Speed 3 (MAN3)
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

    // Create 4 switches
    const modeDefinitions = [
      { name: 'Auto', state: 'AUTO', subtype: 'duco-auto' },
      { name: 'Speed 1', state: 'MAN1', subtype: 'duco-man1' },
      { name: 'Speed 2', state: 'MAN2', subtype: 'duco-man2' },
      { name: 'Speed 3', state: 'MAN3', subtype: 'duco-man3' },
    ];

    for (const def of modeDefinitions) {
      // Find existing or create new service, using subtype to distinguish
      let service = this.accessory.getServiceById(this.platform.Service.Switch, def.subtype);
      if (!service) {
        service = this.accessory.addService(
          this.platform.Service.Switch,
          def.name,
          def.subtype,
        );
      }
      service.setCharacteristic(this.platform.Characteristic.Name, def.name);

      const mode: VentilationMode = {
        name: def.name,
        state: def.state,
        service,
      };

      // On/off handlers
      service.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.currentState === def.state)
        .onSet((value: CharacteristicValue) => {
          if (value) {
            // Turning this mode ON
            this.setVentilationState(def.state);
          } else {
            // Turning off → go to AUTO (can't turn off ventilation)
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

  /**
   * Update all switch states so only the active one is ON
   */
  private updateSwitchStates(): void {
    for (const mode of this.modes) {
      mode.service.updateCharacteristic(
        this.platform.Characteristic.On,
        this.currentState === mode.state,
      );
    }
  }

  /**
   * Update from polled API data
   */
  updateFromNode(node: DucoNode): void {
    const state = node.Ventilation?.State?.Val || 'AUTO';
    if (state !== this.currentState) {
      this.currentState = state;
      this.updateSwitchStates();
    }
  }
}
