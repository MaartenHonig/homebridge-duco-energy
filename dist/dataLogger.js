"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataLogger = void 0;
const sql_js_1 = __importDefault(require("sql.js"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class DataLogger {
    constructor(storagePath, retentionDays = 30) {
        this.db = null;
        this.saveTimer = null;
        this.dirty = false;
        this.dbPath = storagePath;
        this.retentionDays = retentionDays;
        this.ready = this.init();
    }
    async init() {
        const SQL = await (0, sql_js_1.default)();
        const dbDir = path_1.default.dirname(this.dbPath);
        if (!fs_1.default.existsSync(dbDir)) {
            fs_1.default.mkdirSync(dbDir, { recursive: true });
        }
        if (fs_1.default.existsSync(this.dbPath)) {
            const buffer = fs_1.default.readFileSync(this.dbPath);
            this.db = new SQL.Database(buffer);
        }
        else {
            this.db = new SQL.Database();
        }
        this.db.run(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        node_id INTEGER NOT NULL,
        node_name TEXT NOT NULL,
        node_type TEXT NOT NULL,
        ventilation_state TEXT,
        ventilation_mode TEXT,
        time_state_remain INTEGER DEFAULT 0,
        flow_lvl_tgt INTEGER DEFAULT 0,
        iaq_co2 REAL DEFAULT 0,
        iaq_rh REAL DEFAULT 0,
        co2 REAL DEFAULT 0,
        rh REAL DEFAULT 0
      )
    `);
        this.db.run('CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON sensor_readings(timestamp)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_readings_node_id ON sensor_readings(node_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_readings_node_timestamp ON sensor_readings(node_id, timestamp)');
        this.saveTimer = setInterval(() => this.saveToDisk(), 60000);
    }
    saveToDisk() {
        if (!this.db || !this.dirty)
            return;
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs_1.default.writeFileSync(this.dbPath, buffer);
            this.dirty = false;
        }
        catch {
            // Will retry next interval
        }
    }
    async logNodes(nodes) {
        await this.ready;
        if (!this.db)
            return;
        const timestamp = Math.floor(Date.now() / 1000);
        const stmt = this.db.prepare(`
      INSERT INTO sensor_readings (
        timestamp, node_id, node_name, node_type,
        ventilation_state, ventilation_mode, time_state_remain, flow_lvl_tgt,
        iaq_co2, iaq_rh, co2, rh
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const node of nodes) {
            stmt.run([
                timestamp,
                node.Node,
                node.General?.Name?.Val ?? `Node ${node.Node}`,
                node.General?.Type?.Val ?? 'UNKNOWN',
                node.Ventilation?.State?.Val ?? '',
                node.Ventilation?.Mode?.Val ?? '',
                node.Ventilation?.TimeStateRemain?.Val ?? 0,
                node.Ventilation?.FlowLvlTgt?.Val ?? 0,
                node.Sensor?.IaqCo2?.Val ?? 0,
                node.Sensor?.IaqRh?.Val ?? 0,
                node.Sensor?.Co2?.Val ?? 0,
                node.Sensor?.Rh?.Val ?? 0,
            ]);
        }
        stmt.free();
        this.dirty = true;
    }
    async getChartData(nodeId, field, fromTimestamp, toTimestamp) {
        await this.ready;
        if (!this.db)
            return [];
        const validFields = [
            'rh', 'co2', 'iaq_co2', 'iaq_rh',
            'flow_lvl_tgt', 'time_state_remain',
        ];
        if (!validFields.includes(field)) {
            throw new Error(`Invalid field: ${field}`);
        }
        const results = [];
        const stmt = this.db.prepare(`SELECT timestamp, ${field} as value
       FROM sensor_readings
       WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`);
        stmt.bind([nodeId, fromTimestamp, toTimestamp]);
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push({ timestamp: row.timestamp, value: row.value });
        }
        stmt.free();
        return results;
    }
    async getVentilationTimeline(nodeId, fromTimestamp, toTimestamp) {
        await this.ready;
        if (!this.db)
            return [];
        const results = [];
        const stmt = this.db.prepare(`SELECT timestamp, ventilation_state as state, ventilation_mode as mode
       FROM sensor_readings
       WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`);
        stmt.bind([nodeId, fromTimestamp, toTimestamp]);
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push(row);
        }
        stmt.free();
        return results;
    }
    async getLatestReadings() {
        await this.ready;
        if (!this.db)
            return [];
        const results = [];
        const stmt = this.db.prepare(`
      SELECT
        sr.timestamp, sr.node_id as nodeId, sr.node_name as nodeName,
        sr.node_type as nodeType, sr.ventilation_state as ventilationState,
        sr.ventilation_mode as ventilationMode,
        sr.time_state_remain as timeStateRemain,
        sr.flow_lvl_tgt as flowLvlTgt,
        sr.iaq_co2 as iaqCo2, sr.iaq_rh as iaqRh,
        sr.co2, sr.rh
      FROM sensor_readings sr
      INNER JOIN (
        SELECT node_id, MAX(timestamp) as max_ts
        FROM sensor_readings
        GROUP BY node_id
      ) latest ON sr.node_id = latest.node_id AND sr.timestamp = latest.max_ts
      ORDER BY sr.node_id
    `);
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
    async getKnownNodes() {
        await this.ready;
        if (!this.db)
            return [];
        const results = [];
        const stmt = this.db.prepare(`
      SELECT DISTINCT node_id as nodeId, node_name as nodeName, node_type as nodeType
      FROM sensor_readings
      ORDER BY node_id
    `);
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
    async cleanup() {
        await this.ready;
        if (!this.db)
            return;
        const cutoff = Math.floor(Date.now() / 1000) - this.retentionDays * 86400;
        this.db.run('DELETE FROM sensor_readings WHERE timestamp < ?', [cutoff]);
        this.dirty = true;
        this.saveToDisk();
    }
    close() {
        if (this.saveTimer)
            clearInterval(this.saveTimer);
        this.saveToDisk();
        if (this.db)
            this.db.close();
    }
}
exports.DataLogger = DataLogger;
