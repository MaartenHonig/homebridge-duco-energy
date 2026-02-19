import { DucoNode } from './ducoApi';
export interface SensorReading {
    timestamp: number;
    nodeId: number;
    nodeName: string;
    nodeType: string;
    ventilationState: string;
    ventilationMode: string;
    timeStateRemain: number;
    flowLvlTgt: number;
    iaqCo2: number;
    iaqRh: number;
    co2: number;
    rh: number;
}
export interface SystemTemps {
    tempOda: number;
    tempSup: number;
    tempEta: number;
    tempEha: number;
    filterDaysRemain: number;
}
export interface ChartDataPoint {
    timestamp: number;
    value: number;
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
    getChartData(nodeId: number, field: string, fromTimestamp: number, toTimestamp: number): Promise<ChartDataPoint[]>;
    getVentilationTimeline(nodeId: number, fromTimestamp: number, toTimestamp: number): Promise<{
        timestamp: number;
        state: string;
        mode: string;
    }[]>;
    getLatestReadings(): Promise<SensorReading[]>;
    getKnownNodes(): Promise<{
        nodeId: number;
        nodeName: string;
        nodeType: string;
    }[]>;
    logSystemTemps(temps: SystemTemps): Promise<void>;
    getSystemTempsChart(field: string, fromTimestamp: number, toTimestamp: number): Promise<ChartDataPoint[]>;
    getLatestSystemTemps(): Promise<SystemTemps | null>;
    cleanup(): Promise<void>;
    close(): void;
}
