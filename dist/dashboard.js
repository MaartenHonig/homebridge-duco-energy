"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardServer = void 0;
const express_1 = __importDefault(require("express"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class DashboardServer {
    constructor(dataLogger, log, port, apiClient) {
        this.server = null;
        this.dataLogger = dataLogger;
        this.log = log;
        this.port = port;
        this.apiClient = apiClient;
        this.app = (0, express_1.default)();
        // Load HTML at startup
        const htmlPath = path.join(__dirname, 'dashboard.html');
        try {
            this.dashboardHtml = fs.readFileSync(htmlPath, 'utf8');
        }
        catch {
            this.log.warn('dashboard.html not found at ' + htmlPath + ', using fallback');
            this.dashboardHtml = '<html><body><h1>Dashboard HTML not found</h1></body></html>';
        }
        this.setupRoutes();
    }
    setupRoutes() {
        this.app.get('/api/nodes', async (_req, res) => {
            try {
                res.json(await this.dataLogger.getKnownNodes());
            }
            catch {
                res.status(500).json({ error: 'Failed' });
            }
        });
        this.app.get('/api/latest', async (_req, res) => {
            try {
                res.json(await this.dataLogger.getLatestReadings());
            }
            catch {
                res.status(500).json({ error: 'Failed' });
            }
        });
        this.app.get('/api/temps/latest', async (_req, res) => {
            try {
                res.json(await this.dataLogger.getLatestSystemTemps());
            }
            catch {
                res.status(500).json({ error: 'Failed' });
            }
        });
        this.app.get('/api/temps/chart/:field', async (req, res) => {
            try {
                const field = req.params.field;
                const range = req.query.range || '24h';
                const now = Math.floor(Date.now() / 1000);
                const from = this.rangeToFrom(range, now);
                res.json(await this.dataLogger.getSystemTempsChart(field, from, now));
            }
            catch {
                res.status(500).json({ error: 'Failed' });
            }
        });
        this.app.get('/api/sysinfo', async (_req, res) => {
            try {
                if (this.apiClient) {
                    const info = await this.apiClient.getSystemInfo();
                    res.json(info);
                }
                else {
                    res.status(503).json({ error: 'API client not available' });
                }
            }
            catch {
                res.status(500).json({ error: 'Failed' });
            }
        });
        this.app.get('/api/chart/:nodeId/:field', async (req, res) => {
            try {
                const nodeId = parseInt(req.params.nodeId, 10);
                const field = req.params.field;
                const range = req.query.range || '24h';
                const now = Math.floor(Date.now() / 1000);
                const from = this.rangeToFrom(range, now);
                res.json(await this.dataLogger.getChartData(nodeId, field, from, now));
            }
            catch {
                res.status(500).json({ error: 'Failed' });
            }
        });
        this.app.get('/api/flow-driver/:nodeId', async (req, res) => {
            try {
                const nodeId = parseInt(req.params.nodeId, 10);
                const range = req.query.range || '24h';
                const now = Math.floor(Date.now() / 1000);
                const from = this.rangeToFrom(range, now);
                res.json(await this.dataLogger.getFlowWithDriver(nodeId, from, now));
            }
            catch {
                res.status(500).json({ error: 'Failed' });
            }
        });
        this.app.get('/api/timeline/:nodeId', async (req, res) => {
            try {
                const nodeId = parseInt(req.params.nodeId, 10);
                const range = req.query.range || '24h';
                const now = Math.floor(Date.now() / 1000);
                const from = this.rangeToFrom(range, now);
                res.json(await this.dataLogger.getVentilationTimeline(nodeId, from, now));
            }
            catch {
                res.status(500).json({ error: 'Failed' });
            }
        });
        this.app.get('/', (_req, res) => {
            res.send(this.dashboardHtml);
        });
    }
    rangeToFrom(range, now) {
        switch (range) {
            case '1h': return now - 3600;
            case '6h': return now - 21600;
            case '24h': return now - 86400;
            case '7d': return now - 604800;
            case '30d': return now - 2592000;
            default: return now - 86400;
        }
    }
    start() {
        this.server = this.app.listen(this.port, '0.0.0.0', () => {
            this.log.info('Duco Energy Dashboard running at http://localhost:' + this.port);
        });
    }
    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}
exports.DashboardServer = DashboardServer;
