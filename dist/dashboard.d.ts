import { DataLogger } from './dataLogger';
import { Logger } from 'homebridge';
import { DucoApiClient } from './ducoApi';
export declare class DashboardServer {
    private app;
    private server;
    private dataLogger;
    private apiClient;
    private log;
    private port;
    private dashboardHtml;
    constructor(dataLogger: DataLogger, log: Logger, port: number, apiClient: DucoApiClient);
    private setupRoutes;
    private rangeToFrom;
    start(): void;
    stop(): void;
}
