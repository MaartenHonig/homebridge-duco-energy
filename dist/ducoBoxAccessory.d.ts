import { PlatformAccessory, Logger } from 'homebridge';
import { DucoEnergyPlatform } from './platform';
import { DucoNode } from './ducoApi';
export declare class DucoBoxAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly log;
    private modes;
    private nodeId;
    private currentState;
    constructor(platform: DucoEnergyPlatform, accessory: PlatformAccessory, log: Logger, nodeId: number);
    private setVentilationState;
    /**
     * Update all switch states so only the active one is ON
     */
    private updateSwitchStates;
    /**
     * Update from polled API data
     */
    updateFromNode(node: DucoNode): void;
}
