"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataLogger = void 0;
const sql_js_1 = __importDefault(require("sql.js"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class DataLogger {
    constructor(storagePath, retentionDays = 30) {
        this.db = null;
        this.saveTimer = null;
        this.dirty = false;
        this.retentionDays = retentionDays;
        this.dbPath = path_1.default.join(storagePath, 'duco-history.db');
        this.ready = this.init();
    }
    async init() {
        const SQL = await (0, sql_js_1.default)();
        if (fs_1.default.existsSync(this.dbPath)) {
            const fileBuffer = fs_1.default.readFileSync(this.dbPath);
            this.db = new SQL.Database(fileBuffer);
        }
        else {
            this.db = new SQL.Database();
        }
        this.db.run(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        node_id INTEGER NOT NULL,
        node_type TEXT NOT NULL,
        node_name TEXT NOT NULL DEFAULT '',
        humidity REAL,
        temperature REAL,
        co2 REAL,
        ventilation_mode TEXT,
        ventilation_state TEXT,
        fan_speed_supply REAL,
        fan_speed_exhaust REAL,
        flow_rate_supply REAL,
        flow_rate_exhaust REAL,
        time_state_remain REAL
      )
    `);
        this.db.run('CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON sensor_readings(timestamp)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_readings_node ON sensor_readings(node_id, timestamp)');
        this.saveTimer = setInterval(() => this.saveToDisk(), 60000);
    }
    saveToDisk() {
        if (this.db && this.dirty) {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs_1.default.writeFileSync(this.dbPath, buffer);
            this.dirty = false;
        }
    }
    async logNodes(nodes) {
        await this.ready;
        if (!this.db)
            return;
        const timestamp = Date.now();
        for (const node of nodes) {
            const nodeType = node.General?.Type || 'UNKNOWN';
            const nodeName = node.General?.Ident || `Node ${node.Node}`;
            let temperature = null;
            if (node.Sensor?.Temp != null) {
                temperature = node.Sensor.Temp > 100 ? node.Sensor.Temp / 10 : node.Sensor.Temp;
            }
            else if (node.HeatRecovery?.Temp_Eta != null) {
                const t = node.HeatRecovery.Temp_Eta;
                temperature = t > 100 ? t / 10 : t;
            }
            this.db.run(`INSERT INTO sensor_readings (
          timestamp, node_id, node_type, node_name, humidity, temperature, co2,
          ventilation_mode, ventilation_state, fan_speed_supply, fan_speed_exhaust,
          flow_rate_supply, flow_rate_exhaust, time_state_remain
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [timestamp, node.Node, nodeType, nodeName,
                node.Sensor?.RH ?? null, temperature, node.Sensor?.CO2 ?? null,
                node.Ventilation?.Mode ?? null, node.Ventilation?.State ?? null,
                node.Fan?.SpeedRpm_Sup ?? null, node.Fan?.SpeedRpm_Eha ?? null,
                node.Fan?.FlowRate_Sup ?? null, node.Fan?.FlowRate_Eha ?? null,
                node.Ventilation?.TimeStateRemain ?? null]);
        }
        this.dirty = true;
    }
    async getReadings(nodeId, fromTimestamp, toTimestamp) {
        await this.ready;
        if (!this.db)
            return [];
        const stmt = this.db.prepare('SELECT * FROM sensor_readings WHERE node_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC');
        stmt.bind([nodeId, fromTimestamp, toTimestamp]);
        const results = [];
        while (stmt.step())
            results.push(this.rowToReading(stmt.getAsObject()));
        stmt.free();
        return results;
    }
    async getLatestReadings() {
        await this.ready;
        if (!this.db)
            return [];
        const stmt = this.db.prepare(`SELECT sr.* FROM sensor_readings sr INNER JOIN (
        SELECT node_id, MAX(timestamp) as max_ts FROM sensor_readings GROUP BY node_id
      ) latest ON sr.node_id = latest.node_id AND sr.timestamp = latest.max_ts ORDER BY sr.node_id ASC`);
        const results = [];
        while (stmt.step())
            results.push(this.rowToReading(stmt.getAsObject()));
        stmt.free();
        return results;
    }
    async getKnownNodes() {
        await this.ready;
        if (!this.db)
            return [];
        const stmt = this.db.prepare('SELECT DISTINCT node_id as nodeId, node_type as nodeType, node_name as nodeName FROM sensor_readings ORDER BY node_id ASC');
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push({ nodeId: row.nodeId, nodeType: row.nodeType, nodeName: row.nodeName });
        }
        stmt.free();
        return results;
    }
    async getChartData(nodeId, fromTimestamp, toTimestamp, maxPoints = 500) {
        await this.ready;
        if (!this.db)
            return [];
        const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM sensor_readings WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?');
        countStmt.bind([nodeId, fromTimestamp, toTimestamp]);
        countStmt.step();
        const cnt = countStmt.getAsObject().cnt;
        countStmt.free();
        if (cnt <= maxPoints)
            return this.getReadings(nodeId, fromTimestamp, toTimestamp);
        const bucketSize = Math.ceil((toTimestamp - fromTimestamp) / maxPoints);
        const stmt = this.db.prepare(`SELECT (timestamp / ? * ?) as timestamp, node_id, node_type, node_name,
        AVG(humidity) as humidity, AVG(temperature) as temperature, AVG(co2) as co2,
        ventilation_mode, ventilation_state,
        AVG(fan_speed_supply) as fan_speed_supply, AVG(fan_speed_exhaust) as fan_speed_exhaust,
        AVG(flow_rate_supply) as flow_rate_supply, AVG(flow_rate_exhaust) as flow_rate_exhaust,
        AVG(time_state_remain) as time_state_remain
      FROM sensor_readings WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
      GROUP BY timestamp / ? ORDER BY timestamp ASC`);
        stmt.bind([bucketSize, bucketSize, nodeId, fromTimestamp, toTimestamp, bucketSize]);
        const results = [];
        while (stmt.step())
            results.push(this.rowToReading(stmt.getAsObject()));
        stmt.free();
        return results;
    }
    async purgeOldData() {
        await this.ready;
        if (!this.db)
            return 0;
        const cutoff = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
        this.db.run('DELETE FROM sensor_readings WHERE timestamp < ?', [cutoff]);
        const changes = this.db.getRowsModified();
        if (changes > 0)
            this.dirty = true;
        return changes;
    }
    rowToReading(row) {
        return {
            timestamp: row.timestamp,
            nodeId: (row.node_id ?? row.nodeId),
            nodeType: (row.node_type ?? row.nodeType),
            nodeName: (row.node_name ?? row.nodeName),
            humidity: row.humidity,
            temperature: row.temperature,
            co2: row.co2,
            ventilationMode: (row.ventilation_mode ?? row.ventilationMode),
            ventilationState: (row.ventilation_state ?? row.ventilationState),
            fanSpeedSupply: (row.fan_speed_supply ?? row.fanSpeedSupply),
            fanSpeedExhaust: (row.fan_speed_exhaust ?? row.fanSpeedExhaust),
            flowRateSupply: (row.flow_rate_supply ?? row.flowRateSupply),
            flowRateExhaust: (row.flow_rate_exhaust ?? row.flowRateExhaust),
            timeStateRemain: (row.time_state_remain ?? row.timeStateRemain),
        };
    }
    close() {
        this.saveToDisk();
        if (this.saveTimer)
            clearInterval(this.saveTimer);
        if (this.db)
            this.db.close();
    }
}
exports.DataLogger = DataLogger;
