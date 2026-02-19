import initSqlJs, { Database } from 'sql.js';
type SqlJsDatabase = Database;
import path from 'path';
import fs from 'fs';
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

export interface ChartDataPoint {
  timestamp: number;
  value: number;
}

export class DataLogger {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private retentionDays: number;
  private ready: Promise<void>;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(storagePath: string, retentionDays: number = 30) {
    this.dbPath = storagePath;
    this.retentionDays = retentionDays;
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const SQL = await initSqlJs();

    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
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

  private saveToDisk(): void {
    if (!this.db || !this.dirty) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      this.dirty = false;
    } catch {
      // Will retry next interval
    }
  }

  async logNodes(nodes: DucoNode[]): Promise<void> {
    await this.ready;
    if (!this.db) return;

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

  async getChartData(
    nodeId: number,
    field: string,
    fromTimestamp: number,
    toTimestamp: number,
  ): Promise<ChartDataPoint[]> {
    await this.ready;
    if (!this.db) return [];

    const validFields = [
      'rh', 'co2', 'iaq_co2', 'iaq_rh',
      'flow_lvl_tgt', 'time_state_remain',
    ];
    if (!validFields.includes(field)) {
      throw new Error(`Invalid field: ${field}`);
    }

    const results: ChartDataPoint[] = [];
    const stmt = this.db.prepare(
      `SELECT timestamp, ${field} as value
       FROM sensor_readings
       WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
    );
    stmt.bind([nodeId, fromTimestamp, toTimestamp]);

    while (stmt.step()) {
      const row = stmt.getAsObject() as { timestamp: number; value: number };
      results.push({ timestamp: row.timestamp, value: row.value });
    }
    stmt.free();
    return results;
  }

  async getVentilationTimeline(
    nodeId: number,
    fromTimestamp: number,
    toTimestamp: number,
  ): Promise<{ timestamp: number; state: string; mode: string }[]> {
    await this.ready;
    if (!this.db) return [];

    const results: { timestamp: number; state: string; mode: string }[] = [];
    const stmt = this.db.prepare(
      `SELECT timestamp, ventilation_state as state, ventilation_mode as mode
       FROM sensor_readings
       WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
    );
    stmt.bind([nodeId, fromTimestamp, toTimestamp]);

    while (stmt.step()) {
      const row = stmt.getAsObject() as { timestamp: number; state: string; mode: string };
      results.push(row);
    }
    stmt.free();
    return results;
  }

  async getLatestReadings(): Promise<SensorReading[]> {
    await this.ready;
    if (!this.db) return [];

    const results: SensorReading[] = [];
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
      results.push(stmt.getAsObject() as unknown as SensorReading);
    }
    stmt.free();
    return results;
  }

  async getKnownNodes(): Promise<{ nodeId: number; nodeName: string; nodeType: string }[]> {
    await this.ready;
    if (!this.db) return [];

    const results: { nodeId: number; nodeName: string; nodeType: string }[] = [];
    const stmt = this.db.prepare(`
      SELECT DISTINCT node_id as nodeId, node_name as nodeName, node_type as nodeType
      FROM sensor_readings
      ORDER BY node_id
    `);

    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as { nodeId: number; nodeName: string; nodeType: string });
    }
    stmt.free();
    return results;
  }

  async cleanup(): Promise<void> {
    await this.ready;
    if (!this.db) return;
    const cutoff = Math.floor(Date.now() / 1000) - this.retentionDays * 86400;
    this.db.run('DELETE FROM sensor_readings WHERE timestamp < ?', [cutoff]);
    this.dirty = true;
    this.saveToDisk();
  }

  close(): void {
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.saveToDisk();
    if (this.db) this.db.close();
  }
}
