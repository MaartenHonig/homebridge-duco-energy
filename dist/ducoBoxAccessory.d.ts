import { PlatformAccessory, Logger } from 'homebridge';
import { DucoEnergyPlatform } from './platform';
import { DucoNode } from './ducoApi';
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
export declare class DucoBoxAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly log;
    private service;
    private nodeId;
    private currentState;
    private currentSpeed;
    constructor(platform: DucoEnergyPlatform, accessory: PlatformAccessory, log: Logger, nodeId: number);
    private setVentilationState;
    private stateToSpeed;
    /**
     * Update from polled API data
     */
    updateFromNode(node: DucoNode): void;
}
