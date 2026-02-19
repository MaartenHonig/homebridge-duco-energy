import { DataLogger } from './dataLogger';
import { Logger } from 'homebridge';
export declare class DashboardServer {
    private app;
    private server;
    private port;
    private logger;
    private log;
    constructor(logger: DataLogger, log: Logger, port?: number);
    private setupRoutes;
    start(): void;
    stop(): void;
    private getDashboardHtml;
}
