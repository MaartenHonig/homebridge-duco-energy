export interface DucoNodeGeneral {
    Type: {
        Val: string;
    };
    SubType: {
        Val: number;
    };
    NetworkType: {
        Val: string;
    };
    Parent: {
        Val: number;
    };
    Asso: {
        Val: number;
    };
    Name: {
        Val: string;
    };
    Identify: {
        Val: number;
    };
}
export interface DucoNodeVentilation {
    State: {
        Val: string;
    };
    TimeStateRemain: {
        Val: number;
    };
    TimeStateEnd: {
        Val: number;
    };
    Mode: {
        Val: string;
    };
    FlowLvlTgt: {
        Val: number;
    };
}
export interface DucoNodeSensor {
    IaqCo2: {
        Val: number;
    };
    IaqRh: {
        Val: number;
    };
    Co2: {
        Val: number;
    };
    Rh: {
        Val: number;
    };
    [key: string]: {
        Val: number | string;
    } | undefined;
}
export interface DucoNode {
    Node: number;
    General: DucoNodeGeneral;
    Ventilation: DucoNodeVentilation;
    Sensor: DucoNodeSensor;
}
export interface DucoDeviceInfo {
    Id: string;
    DeviceType: string;
    SerialNumber: string;
    Online: boolean;
}
export interface DucoNodesResponse {
    DeviceInfo: DucoDeviceInfo;
    Nodes: DucoNode[];
}
export interface DucoActionItem {
    Action: string;
    ValType: string;
    Enum: string[];
}
export interface DucoActionsResponse {
    DeviceInfo: DucoDeviceInfo;
    Actions: DucoActionItem[];
}
export interface DucoNodeActionsResponse {
    DeviceInfo: DucoDeviceInfo;
    Node: number;
    Actions: DucoActionItem[];
}
export declare class DucoApiClient {
    private client;
    private baseUrl;
    constructor(host: string);
    /**
     * Get API info / health check
     */
    getApiInfo(): Promise<Record<string, unknown>>;
    /**
     * Get all nodes with their current state and sensor data
     */
    getNodes(): Promise<DucoNodesResponse>;
    /**
     * Get info for a specific node
     */
    getNodeInfo(nodeId: number): Promise<DucoNode>;
    /**
     * Get supported actions for the device
     */
    getActions(): Promise<DucoActionsResponse>;
    /**
     * Get supported actions for a specific node
     */
    getNodeActions(nodeId: number): Promise<DucoNodeActionsResponse>;
    /**
     * Send an action to the whole device (e.g., set ventilation mode)
     */
    sendAction(action: string, value: string | number | boolean): Promise<void>;
    /**
     * Send an action to a specific node (e.g., override a specific zone)
     */
    sendNodeAction(nodeId: number, action: string, value: string | number | boolean): Promise<void>;
    /**
     * Get all config
     */
    getConfig(): Promise<Record<string, unknown>>;
    /**
     * Get config for a specific node
     */
    getNodeConfig(nodeId: number): Promise<Record<string, unknown>>;
    /**
     * Set ventilation state for a node
     * States: AUTO, MAN1, MAN2, MAN3, AWAY
     */
    setNodeVentilationState(nodeId: number, state: string): Promise<void>;
    /**
     * Set ventilation state for the whole box
     */
    setVentilationState(state: string): Promise<void>;
    /**
     * Test connectivity to the Duco box
     */
    testConnection(): Promise<boolean>;
}
