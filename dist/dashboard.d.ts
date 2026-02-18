import { DataLogger } from './dataLogger';
import { Logger } from 'homebridge';
export declare class DashboardServer {
    private app;
    private server;
    private dataLogger;
    private log;
    private port;
    constructor(dataLogger: DataLogger, log: Logger, port: number);
    private setupRoutes;
    start(): void;
    stop(): void;
    private getDashboardHtml;
}
