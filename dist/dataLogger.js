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
        // System-level temperatures from /info endpoint
        this.db.run(`
      CREATE TABLE IF NOT EXISTS system_temps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        temp_oda REAL DEFAULT 0,
        temp_sup REAL DEFAULT 0,
        temp_eta REAL DEFAULT 0,
        temp_eha REAL DEFAULT 0,
        filter_days_remain INTEGER DEFAULT 0
      )
    `);
        this.db.run('CREATE INDEX IF NOT EXISTS idx_temps_timestamp ON system_temps(timestamp)');
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
    async logSystemTemps(temps) {
        await this.ready;
        if (!this.db)
            return;
        const timestamp = Math.floor(Date.now() / 1000);
        this.db.run(`INSERT INTO system_temps (timestamp, temp_oda, temp_sup, temp_eta, temp_eha, filter_days_remain)
       VALUES (?, ?, ?, ?, ?, ?)`, [timestamp, temps.tempOda, temps.tempSup, temps.tempEta, temps.tempEha, temps.filterDaysRemain]);
        this.dirty = true;
    }
    async getSystemTempsChart(field, fromTimestamp, toTimestamp) {
        await this.ready;
        if (!this.db)
            return [];
        const validFields = ['temp_oda', 'temp_sup', 'temp_eta', 'temp_eha', 'filter_days_remain'];
        if (!validFields.includes(field)) {
            throw new Error(`Invalid field: ${field}`);
        }
        const results = [];
        const stmt = this.db.prepare(`SELECT timestamp, ${field} as value
       FROM system_temps
       WHERE timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`);
        stmt.bind([fromTimestamp, toTimestamp]);
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push({ timestamp: row.timestamp, value: row.value });
        }
        stmt.free();
        return results;
    }
    async getFlowWithDriver(boxNodeId, fromTimestamp, toTimestamp) {
        await this.ready;
        if (!this.db)
            return [];
        // Get all UCRH sensor node IDs
        const sensorNodes = [];
        const nstmt = this.db.prepare(`SELECT DISTINCT node_id FROM sensor_readings WHERE node_type = 'UCRH'`);
        while (nstmt.step()) {
            const row = nstmt.getAsObject();
            sensorNodes.push(row.node_id);
        }
        nstmt.free();
        if (sensorNodes.length === 0)
            return [];
        // Get flow data from BOX
        const flowData = [];
        const fstmt = this.db.prepare(`SELECT timestamp, flow_lvl_tgt as flow FROM sensor_readings
       WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`);
        fstmt.bind([boxNodeId, fromTimestamp, toTimestamp]);
        while (fstmt.step()) {
            flowData.push(fstmt.getAsObject());
        }
        fstmt.free();
        // Get iaq_rh data for all sensors, indexed by timestamp
        const sensorIaq = new Map();
        for (const sId of sensorNodes) {
            const iaqMap = new Map();
            const sstmt = this.db.prepare(`SELECT timestamp, iaq_rh FROM sensor_readings
         WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp ASC`);
            sstmt.bind([sId, fromTimestamp, toTimestamp]);
            while (sstmt.step()) {
                const row = sstmt.getAsObject();
                iaqMap.set(row.timestamp, row.iaq_rh);
            }
            sstmt.free();
            sensorIaq.set(sId, iaqMap);
        }
        // For each flow point, find which sensor has the lowest IaqRh (= most demand)
        const results = [];
        for (const fp of flowData) {
            let lowestIaq = Infinity;
            let driver = sensorNodes[0];
            for (const sId of sensorNodes) {
                const iaqMap = sensorIaq.get(sId);
                const iaq = iaqMap.get(fp.timestamp) ?? Infinity;
                if (iaq < lowestIaq) {
                    lowestIaq = iaq;
                    driver = sId;
                }
            }
            results.push({ timestamp: fp.timestamp, flow: fp.flow, driver });
        }
        return results;
    }
    async getLatestSystemTemps() {
        await this.ready;
        if (!this.db)
            return null;
        const stmt = this.db.prepare(`SELECT temp_oda as tempOda, temp_sup as tempSup, temp_eta as tempEta,
              temp_eha as tempEha, filter_days_remain as filterDaysRemain
       FROM system_temps ORDER BY timestamp DESC LIMIT 1`);
        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();
        return result;
    }
    async cleanup() {
        await this.ready;
        if (!this.db)
            return;
        const cutoff = Math.floor(Date.now() / 1000) - this.retentionDays * 86400;
        this.db.run('DELETE FROM sensor_readings WHERE timestamp < ?', [cutoff]);
        this.db.run('DELETE FROM system_temps WHERE timestamp < ?', [cutoff]);
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
