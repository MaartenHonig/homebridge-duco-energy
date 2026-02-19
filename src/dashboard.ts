import express, { Request, Response } from 'express';
import { Server } from 'http';
import { DataLogger } from './dataLogger';
import { Logger } from 'homebridge';
import * as fs from 'fs';
import * as path from 'path';

export class DashboardServer {
  private app: express.Application;
  private server: Server | null = null;
  private dataLogger: DataLogger;
  private log: Logger;
  private port: number;
  private dashboardHtml: string;

  constructor(dataLogger: DataLogger, log: Logger, port: number) {
    this.dataLogger = dataLogger;
    this.log = log;
    this.port = port;
    this.app = express();

    // Load HTML at startup
    const htmlPath = path.join(__dirname, 'dashboard.html');
    try {
      this.dashboardHtml = fs.readFileSync(htmlPath, 'utf8');
    } catch {
      this.log.warn('dashboard.html not found at ' + htmlPath + ', using fallback');
      this.dashboardHtml = '<html><body><h1>Dashboard HTML not found</h1></body></html>';
    }

    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/api/nodes', async (_req: Request, res: Response) => {
      try { res.json(await this.dataLogger.getKnownNodes()); }
      catch { res.status(500).json({ error: 'Failed' }); }
    });

    this.app.get('/api/latest', async (_req: Request, res: Response) => {
      try { res.json(await this.dataLogger.getLatestReadings()); }
      catch { res.status(500).json({ error: 'Failed' }); }
    });

    this.app.get('/api/chart/:nodeId/:field', async (req: Request, res: Response) => {
      try {
        const nodeId = parseInt(req.params.nodeId, 10);
        const field = req.params.field;
        const range = (req.query.range as string) || '24h';
        const now = Math.floor(Date.now() / 1000);
        const from = this.rangeToFrom(range, now);
        res.json(await this.dataLogger.getChartData(nodeId, field, from, now));
      } catch { res.status(500).json({ error: 'Failed' }); }
    });

    this.app.get('/api/timeline/:nodeId', async (req: Request, res: Response) => {
      try {
        const nodeId = parseInt(req.params.nodeId, 10);
        const range = (req.query.range as string) || '24h';
        const now = Math.floor(Date.now() / 1000);
        const from = this.rangeToFrom(range, now);
        res.json(await this.dataLogger.getVentilationTimeline(nodeId, from, now));
      } catch { res.status(500).json({ error: 'Failed' }); }
    });

    this.app.get('/', (_req: Request, res: Response) => {
      res.send(this.dashboardHtml);
    });
  }

  private rangeToFrom(range: string, now: number): number {
    switch (range) {
      case '1h': return now - 3600;
      case '6h': return now - 21600;
      case '24h': return now - 86400;
      case '7d': return now - 604800;
      case '30d': return now - 2592000;
      default: return now - 86400;
    }
  }

  start(): void {
    this.server = this.app.listen(this.port, '0.0.0.0', () => {
      this.log.info('Duco Energy Dashboard running at http://localhost:' + this.port);
    });
  }

  stop(): void {
    if (this.server) { this.server.close(); this.server = null; }
  }
}
