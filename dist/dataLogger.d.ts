import { DucoNode } from './ducoApi';
export interface SensorReading {
    timestamp: number;
    nodeId: number;
    nodeType: string;
    nodeName: string;
    humidity: number | null;
    temperature: number | null;
    co2: number | null;
    ventilationMode: string | null;
    ventilationState: string | null;
    fanSpeedSupply: number | null;
    fanSpeedExhaust: number | null;
    flowRateSupply: number | null;
    flowRateExhaust: number | null;
    timeStateRemain: number | null;
}
export declare class DataLogger {
    private db;
    private dbPath;
    private retentionDays;
    private ready;
    private saveTimer;
    private dirty;
    constructor(storagePath: string, retentionDays?: number);
    private init;
    private saveToDisk;
    logNodes(nodes: DucoNode[]): Promise<void>;
    getReadings(nodeId: number, fromTimestamp: number, toTimestamp: number): Promise<SensorReading[]>;
    getLatestReadings(): Promise<SensorReading[]>;
    getKnownNodes(): Promise<Array<{
        nodeId: number;
        nodeType: string;
        nodeName: string;
    }>>;
    getChartData(nodeId: number, fromTimestamp: number, toTimestamp: number, maxPoints?: number): Promise<SensorReading[]>;
    purgeOldData(): Promise<number>;
    private rowToReading;
    close(): void;
}
