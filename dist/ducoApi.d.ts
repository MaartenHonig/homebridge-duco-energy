export interface DucoNode {
    Node: number;
    General: {
        Type?: string;
        SubType?: string;
        NetworkType?: string;
        Ident?: string;
        SwVersion?: string;
        [key: string]: unknown;
    };
    Ventilation?: {
        State?: string;
        Mode?: string;
        FlowLvlTgt?: number;
        TimeStateRemain?: number;
        TimeStateEnd?: number;
        [key: string]: unknown;
    };
    Sensor?: {
        RH?: number;
        Temp?: number;
        CO2?: number;
        IaqCo2?: number;
        IaqRh?: number;
        [key: string]: unknown;
    };
    HeatRecovery?: {
        Temp_Oda?: number;
        Temp_Sup?: number;
        Temp_Eta?: number;
        Temp_Eha?: number;
        BypassState?: string;
        [key: string]: unknown;
    };
    Fan?: {
        SpeedRpm_Sup?: number;
        SpeedRpm_Eha?: number;
        FlowRate_Sup?: number;
        FlowRate_Eha?: number;
        [key: string]: unknown;
    };
    Filter?: {
        RemainingTime?: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export interface DucoNodeInfo {
    Nodes: DucoNode[];
}
export interface DucoAction {
    Action: string;
    ValType: string;
    Enum?: string[];
}
export interface DucoActionsResponse {
    Actions: DucoAction[];
}
export interface DucoSystemInfo {
    General?: {
        Type?: string;
        SubType?: string;
        BoardSerial?: string;
        SwVersionBox?: string;
        SwVersionCb?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export declare class DucoApiClient {
    private client;
    private baseUrl;
    constructor(host: string, port?: number);
    /**
     * Get all node info — returns sensor readings, ventilation state, etc.
     * This is the primary polling endpoint.
     */
    getNodes(): Promise<DucoNode[]>;
    /**
     * Get info for a specific node
     */
    getNodeInfo(nodeId: number): Promise<DucoNode | null>;
    /**
     * Get system info (board serial, firmware versions, etc.)
     */
    getSystemInfo(): Promise<DucoSystemInfo>;
    /**
     * Get supported actions for the whole device
     */
    getActions(): Promise<DucoAction[]>;
    /**
     * Get supported actions for a specific node
     */
    getNodeActions(nodeId: number): Promise<DucoAction[]>;
    /**
     * Send an action to the whole device (e.g. set ventilation mode)
     */
    sendAction(action: string, value: string | number | boolean): Promise<void>;
    /**
     * Send an action to a specific node
     */
    sendNodeAction(nodeId: number, action: string, value: string | number | boolean): Promise<void>;
    /**
     * Get configuration for a specific node
     */
    getNodeConfig(nodeId: number): Promise<Record<string, unknown>>;
    /**
     * Check API health — useful for verifying connectivity
     */
    checkHealth(): Promise<boolean>;
    /**
     * Attempt auto-discovery of API structure.
     * The local API might vary slightly between firmware versions.
     * This method tries common endpoint patterns and returns what works.
     */
    discoverEndpoints(): Promise<{
        infoEndpoint: string;
        actionEndpoint: string;
    }>;
}
