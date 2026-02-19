import { PlatformAccessory, Logger } from 'homebridge';
import { DucoEnergyPlatform } from './platform';
import { DucoNode } from './ducoApi';
export declare class DucoBoxAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly log;
    private modes;
    private flowService;
    private tempOdaService;
    private tempSupService;
    private tempEtaService;
    private tempEhaService;
    private nodeId;
    private currentState;
    private currentFlow;
    private learnedFlowLevels;
    constructor(platform: DucoEnergyPlatform, accessory: PlatformAccessory, log: Logger, nodeId: number);
    private getOrAddTempSensor;
    private setVentilationState;
    private updateSwitchStates;
    updateFromNode(node: DucoNode): void;
    /**
     * Update temperature sensors from system info poll
     */
    updateTemperatures(temps: {
        tempOda: number;
        tempSup: number;
        tempEta: number;
        tempEha: number;
    }): void;
}
