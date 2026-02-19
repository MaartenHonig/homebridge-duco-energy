import { PlatformAccessory } from 'homebridge';
import { DucoPlatform, DucoPluginConfig } from './platform';
import { DucoApiClient, DucoNode } from './ducoApi';
export declare class DucoVentilationAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly api;
    private readonly config;
    private fanService;
    private autoSwitchService;
    private level1SwitchService;
    private level2SwitchService;
    private level3SwitchService;
    private infoService;
    private filterService;
    private currentNode;
    private currentMode;
    private currentSpeed;
    constructor(platform: DucoPlatform, accessory: PlatformAccessory, node: DucoNode, api: DucoApiClient, config: DucoPluginConfig);
    private getActive;
    private setActive;
    private getRotationSpeed;
    private setRotationSpeed;
    /**
     * Handle a mode switch tap. All four switches funnel through here.
     * Tapping an already-active switch turns it off → go to Auto.
     * Tapping an inactive switch activates it and deactivates the others.
     */
    private handleModeSwitch;
    /**
     * Optimistically update all HomeKit characteristics to reflect the new mode.
     * This is instant — no API call involved.
     */
    private setModeOptimistic;
    private getFilterStatus;
    /**
     * Send mode change to the Duco API in the background.
     * Does NOT block the UI — if it fails, the next poll will correct state.
     */
    private sendModeToApi;
    private setDucoMode;
    updateFromNode(node: DucoNode): void;
}
