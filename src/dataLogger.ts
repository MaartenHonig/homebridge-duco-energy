import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
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

export class DataLogger {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private retentionDays: number;
  private ready: Promise<void>;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(storagePath: string, retentionDays: number = 30) {
    this.retentionDays = retentionDays;
    this.dbPath = path.join(storagePath, 'duco-history.db');
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
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

  private saveToDisk(): void {
    if (this.db && this.dirty) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      this.dirty = false;
    }
  }

  async logNodes(nodes: DucoNode[]): Promise<void> {
    await this.ready;
    if (!this.db) return;

    const timestamp = Date.now();
    for (const node of nodes) {
      const nodeType = node.General?.Type || 'UNKNOWN';
      const nodeName = node.General?.Ident || `Node ${node.Node}`;

      let temperature: number | null = null;
      if (node.Sensor?.Temp != null) {
        temperature = node.Sensor.Temp > 100 ? node.Sensor.Temp / 10 : node.Sensor.Temp;
      } else if (node.HeatRecovery?.Temp_Eta != null) {
        const t = node.HeatRecovery.Temp_Eta;
        temperature = t > 100 ? t / 10 : t;
      }

      this.db.run(
        `INSERT INTO sensor_readings (
          timestamp, node_id, node_type, node_name, humidity, temperature, co2,
          ventilation_mode, ventilation_state, fan_speed_supply, fan_speed_exhaust,
          flow_rate_supply, flow_rate_exhaust, time_state_remain
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [timestamp, node.Node, nodeType, nodeName,
         node.Sensor?.RH ?? null, temperature, node.Sensor?.CO2 ?? null,
         node.Ventilation?.Mode ?? null, node.Ventilation?.State ?? null,
         node.Fan?.SpeedRpm_Sup ?? null, node.Fan?.SpeedRpm_Eha ?? null,
         node.Fan?.FlowRate_Sup ?? null, node.Fan?.FlowRate_Eha ?? null,
         node.Ventilation?.TimeStateRemain ?? null],
      );
    }
    this.dirty = true;
  }

  async getReadings(nodeId: number, fromTimestamp: number, toTimestamp: number): Promise<SensorReading[]> {
    await this.ready;
    if (!this.db) return [];
    const stmt = this.db.prepare(
      'SELECT * FROM sensor_readings WHERE node_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC');
    stmt.bind([nodeId, fromTimestamp, toTimestamp]);
    const results: SensorReading[] = [];
    while (stmt.step()) results.push(this.rowToReading(stmt.getAsObject()));
    stmt.free();
    return results;
  }

  async getLatestReadings(): Promise<SensorReading[]> {
    await this.ready;
    if (!this.db) return [];
    const stmt = this.db.prepare(
      `SELECT sr.* FROM sensor_readings sr INNER JOIN (
        SELECT node_id, MAX(timestamp) as max_ts FROM sensor_readings GROUP BY node_id
      ) latest ON sr.node_id = latest.node_id AND sr.timestamp = latest.max_ts ORDER BY sr.node_id ASC`);
    const results: SensorReading[] = [];
    while (stmt.step()) results.push(this.rowToReading(stmt.getAsObject()));
    stmt.free();
    return results;
  }

  async getKnownNodes(): Promise<Array<{ nodeId: number; nodeType: string; nodeName: string }>> {
    await this.ready;
    if (!this.db) return [];
    const stmt = this.db.prepare(
      'SELECT DISTINCT node_id as nodeId, node_type as nodeType, node_name as nodeName FROM sensor_readings ORDER BY node_id ASC');
    const results: Array<{ nodeId: number; nodeType: string; nodeName: string }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      results.push({ nodeId: row.nodeId as number, nodeType: row.nodeType as string, nodeName: row.nodeName as string });
    }
    stmt.free();
    return results;
  }

  async getChartData(nodeId: number, fromTimestamp: number, toTimestamp: number, maxPoints: number = 500): Promise<SensorReading[]> {
    await this.ready;
    if (!this.db) return [];
    const countStmt = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM sensor_readings WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?');
    countStmt.bind([nodeId, fromTimestamp, toTimestamp]);
    countStmt.step();
    const cnt = (countStmt.getAsObject() as Record<string, unknown>).cnt as number;
    countStmt.free();

    if (cnt <= maxPoints) return this.getReadings(nodeId, fromTimestamp, toTimestamp);

    const bucketSize = Math.ceil((toTimestamp - fromTimestamp) / maxPoints);
    const stmt = this.db.prepare(
      `SELECT (timestamp / ? * ?) as timestamp, node_id, node_type, node_name,
        AVG(humidity) as humidity, AVG(temperature) as temperature, AVG(co2) as co2,
        ventilation_mode, ventilation_state,
        AVG(fan_speed_supply) as fan_speed_supply, AVG(fan_speed_exhaust) as fan_speed_exhaust,
        AVG(flow_rate_supply) as flow_rate_supply, AVG(flow_rate_exhaust) as flow_rate_exhaust,
        AVG(time_state_remain) as time_state_remain
      FROM sensor_readings WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
      GROUP BY timestamp / ? ORDER BY timestamp ASC`);
    stmt.bind([bucketSize, bucketSize, nodeId, fromTimestamp, toTimestamp, bucketSize]);
    const results: SensorReading[] = [];
    while (stmt.step()) results.push(this.rowToReading(stmt.getAsObject()));
    stmt.free();
    return results;
  }

  async purgeOldData(): Promise<number> {
    await this.ready;
    if (!this.db) return 0;
    const cutoff = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    this.db.run('DELETE FROM sensor_readings WHERE timestamp < ?', [cutoff]);
    const changes = this.db.getRowsModified();
    if (changes > 0) this.dirty = true;
    return changes;
  }

  private rowToReading(row: Record<string, unknown>): SensorReading {
    return {
      timestamp: row.timestamp as number,
      nodeId: (row.node_id ?? row.nodeId) as number,
      nodeType: (row.node_type ?? row.nodeType) as string,
      nodeName: (row.node_name ?? row.nodeName) as string,
      humidity: row.humidity as number | null,
      temperature: row.temperature as number | null,
      co2: row.co2 as number | null,
      ventilationMode: (row.ventilation_mode ?? row.ventilationMode) as string | null,
      ventilationState: (row.ventilation_state ?? row.ventilationState) as string | null,
      fanSpeedSupply: (row.fan_speed_supply ?? row.fanSpeedSupply) as number | null,
      fanSpeedExhaust: (row.fan_speed_exhaust ?? row.fanSpeedExhaust) as number | null,
      flowRateSupply: (row.flow_rate_supply ?? row.flowRateSupply) as number | null,
      flowRateExhaust: (row.flow_rate_exhaust ?? row.flowRateExhaust) as number | null,
      timeStateRemain: (row.time_state_remain ?? row.timeStateRemain) as number | null,
    };
  }

  close(): void {
    this.saveToDisk();
    if (this.saveTimer) clearInterval(this.saveTimer);
    if (this.db) this.db.close();
  }
}
