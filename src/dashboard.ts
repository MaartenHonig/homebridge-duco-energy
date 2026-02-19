import express, { Request, Response } from 'express';
import { Server } from 'http';
import { DataLogger } from './dataLogger';
import { Logger } from 'homebridge';

export class DashboardServer {
  private app: express.Application;
  private server: Server | null = null;
  private port: number;
  private logger: DataLogger;
  private log: Logger;

  constructor(logger: DataLogger, log: Logger, port: number = 8581) {
    this.logger = logger;
    this.log = log;
    this.port = port;
    this.app = express();

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // API routes
    this.app.get('/api/nodes', (_req: Request, res: Response) => {
      try {
        const nodes = this.logger.getKnownNodes();
        res.json(nodes);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    this.app.get('/api/latest', (_req: Request, res: Response) => {
      try {
        const readings = this.logger.getLatestReadings();
        res.json(readings);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    this.app.get('/api/chart/:nodeId', (req: Request, res: Response) => {
      try {
        const nodeId = parseInt(req.params.nodeId, 10);
        const hours = parseInt((req.query.hours as string) || '24', 10);
        const now = Date.now();
        const from = now - (hours * 60 * 60 * 1000);
        const data = this.logger.getChartData(nodeId, from, now);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    this.app.get('/api/readings/:nodeId', (req: Request, res: Response) => {
      try {
        const nodeId = parseInt(req.params.nodeId, 10);
        const from = parseInt((req.query.from as string) || '0', 10);
        const to = parseInt((req.query.to as string) || String(Date.now()), 10);
        const data = this.logger.getReadings(nodeId, from, to);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    // Dashboard HTML
    this.app.get('/', (_req: Request, res: Response) => {
      res.send(this.getDashboardHtml());
    });
  }

  start(): void {
    this.server = this.app.listen(this.port, () => {
      this.log.info(`Duco Dashboard available at http://localhost:${this.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Duco Ventilation Dashboard</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/chartjs-adapter-date-fns/3.0.0/chartjs-adapter-date-fns.bundle.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'Segoe UI', sans-serif;
      background: #0a0a0a; color: #e0e0e0;
      padding: 20px; max-width: 1400px; margin: 0 auto;
    }
    h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; color: #fff; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }

    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px; margin-bottom: 32px;
    }
    .stat-card {
      background: #1a1a1a; border-radius: 12px; padding: 16px;
      border: 1px solid #2a2a2a;
    }
    .stat-card .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-size: 32px; font-weight: 700; color: #fff; margin-top: 4px; }
    .stat-card .unit { font-size: 14px; color: #666; font-weight: 400; }
    .stat-card .node-name { font-size: 11px; color: #555; margin-top: 4px; }
    .stat-card.alert { border-color: #ff6b35; }
    .stat-card.alert .value { color: #ff6b35; }

    .time-controls {
      display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;
    }
    .time-btn {
      background: #1a1a1a; border: 1px solid #333; color: #ccc;
      padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px;
      transition: all 0.2s;
    }
    .time-btn:hover { border-color: #555; color: #fff; }
    .time-btn.active { background: #2563eb; border-color: #2563eb; color: #fff; }

    .chart-container {
      background: #1a1a1a; border-radius: 12px; padding: 20px;
      border: 1px solid #2a2a2a; margin-bottom: 16px;
    }
    .chart-container h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .chart-wrapper { position: relative; height: 250px; }

    .mode-timeline {
      background: #1a1a1a; border-radius: 12px; padding: 20px;
      border: 1px solid #2a2a2a; margin-bottom: 16px;
    }
    .mode-timeline h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .mode-bar { display: flex; height: 32px; border-radius: 6px; overflow: hidden; }
    .mode-segment { display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; }
    .mode-auto { background: #166534; color: #4ade80; }
    .mode-low { background: #1e3a5f; color: #60a5fa; }
    .mode-medium { background: #78350f; color: #fbbf24; }
    .mode-high { background: #7f1d1d; color: #f87171; }

    .loading { text-align: center; padding: 40px; color: #666; }
    .error { background: #2d1b1b; border: 1px solid #5c2626; color: #f87171; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }

    @media (max-width: 768px) {
      body { padding: 12px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .chart-wrapper { height: 200px; }
    }
  </style>
</head>
<body>
  <h1>🌬️ Duco Ventilation</h1>
  <p class="subtitle">DucoBox Energy — Real-time monitoring</p>

  <div id="error-container"></div>
  <div id="stats-grid" class="stats-grid"><div class="loading">Loading...</div></div>

  <div class="time-controls">
    <button class="time-btn" data-hours="1">1h</button>
    <button class="time-btn" data-hours="3">3h</button>
    <button class="time-btn" data-hours="6">6h</button>
    <button class="time-btn active" data-hours="24">24h</button>
    <button class="time-btn" data-hours="72">3d</button>
    <button class="time-btn" data-hours="168">7d</button>
  </div>

  <div id="charts-container"></div>

  <script>
    let currentHours = 24;
    let charts = {};
    let refreshInterval;

    const COLORS = {
      humidity: { line: '#3b82f6', fill: 'rgba(59,130,246,0.1)' },
      temperature: { line: '#f59e0b', fill: 'rgba(245,158,11,0.1)' },
      co2: { line: '#8b5cf6', fill: 'rgba(139,92,246,0.1)' },
      fanSupply: { line: '#10b981', fill: 'rgba(16,185,129,0.1)' },
      fanExhaust: { line: '#ef4444', fill: 'rgba(239,68,68,0.1)' },
    };

    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { labels: { color: '#888', boxWidth: 12, padding: 16, font: { size: 12 } } },
        tooltip: { backgroundColor: '#222', titleColor: '#fff', bodyColor: '#ccc', borderColor: '#444', borderWidth: 1 }
      },
      scales: {
        x: {
          type: 'time',
          grid: { color: '#222' },
          ticks: { color: '#666', maxTicksLimit: 8, font: { size: 11 } }
        },
        y: {
          grid: { color: '#222' },
          ticks: { color: '#666', font: { size: 11 } }
        }
      }
    };

    // ── Fetch & render stats cards ───────────────────────────────────────

    async function loadStats() {
      try {
        const resp = await fetch('/api/latest');
        const readings = await resp.json();
        const container = document.getElementById('stats-grid');

        if (!readings.length) {
          container.innerHTML = '<div class="loading">No data yet — waiting for first sensor readings...</div>';
          return;
        }

        let html = '';
        for (const r of readings) {
          if (r.humidity != null) {
            const isHigh = r.humidity > 70;
            html += '<div class="stat-card ' + (isHigh ? 'alert' : '') + '">'
              + '<div class="label">Humidity</div>'
              + '<div class="value">' + r.humidity.toFixed(1) + '<span class="unit">%</span></div>'
              + '<div class="node-name">' + (r.node_name || r.nodeName || 'Node ' + (r.node_id || r.nodeId)) + '</div></div>';
          }
          if (r.temperature != null) {
            html += '<div class="stat-card">'
              + '<div class="label">Temperature</div>'
              + '<div class="value">' + r.temperature.toFixed(1) + '<span class="unit">°C</span></div>'
              + '<div class="node-name">' + (r.node_name || r.nodeName || 'Node ' + (r.node_id || r.nodeId)) + '</div></div>';
          }
          if (r.co2 != null) {
            const isHigh = r.co2 > 1000;
            html += '<div class="stat-card ' + (isHigh ? 'alert' : '') + '">'
              + '<div class="label">CO₂</div>'
              + '<div class="value">' + Math.round(r.co2) + '<span class="unit">ppm</span></div>'
              + '<div class="node-name">' + (r.node_name || r.nodeName || 'Node ' + (r.node_id || r.nodeId)) + '</div></div>';
          }
          if (r.fan_speed_supply != null || r.fanSpeedSupply != null) {
            const speed = r.fan_speed_supply || r.fanSpeedSupply;
            html += '<div class="stat-card">'
              + '<div class="label">Fan Supply</div>'
              + '<div class="value">' + Math.round(speed) + '<span class="unit">rpm</span></div>'
              + '<div class="node-name">' + (r.node_name || r.nodeName || 'Node ' + (r.node_id || r.nodeId)) + '</div></div>';
          }
          if (r.fan_speed_exhaust != null || r.fanSpeedExhaust != null) {
            const speed = r.fan_speed_exhaust || r.fanSpeedExhaust;
            html += '<div class="stat-card">'
              + '<div class="label">Fan Exhaust</div>'
              + '<div class="value">' + Math.round(speed) + '<span class="unit">rpm</span></div>'
              + '<div class="node-name">' + (r.node_name || r.nodeName || 'Node ' + (r.node_id || r.nodeId)) + '</div></div>';
          }
          const mode = r.ventilation_mode || r.ventilationMode;
          if (mode) {
            html += '<div class="stat-card">'
              + '<div class="label">Mode</div>'
              + '<div class="value" style="font-size:22px">' + mode + '</div>'
              + '<div class="node-name">' + (r.node_name || r.nodeName || 'Node ' + (r.node_id || r.nodeId)) + '</div></div>';
          }
        }
        container.innerHTML = html || '<div class="loading">No sensor data found</div>';
      } catch (err) {
        document.getElementById('error-container').innerHTML =
          '<div class="error">Failed to load data: ' + err.message + '</div>';
      }
    }

    // ── Fetch & render charts ────────────────────────────────────────────

    async function loadCharts() {
      try {
        const nodesResp = await fetch('/api/nodes');
        const nodes = await nodesResp.json();
        const container = document.getElementById('charts-container');

        // Destroy existing charts
        Object.values(charts).forEach(c => c.destroy());
        charts = {};
        container.innerHTML = '';

        // Create humidity chart (all humidity sensors on one chart)
        const humidityNodes = [];
        const tempNodes = [];
        const fanNodes = [];

        for (const node of nodes) {
          const resp = await fetch('/api/chart/' + node.nodeId + '?hours=' + currentHours);
          const data = await resp.json();
          if (!data.length) continue;

          const hasHumidity = data.some(d => d.humidity != null);
          const hasTemp = data.some(d => d.temperature != null);
          const hasFan = data.some(d => (d.fan_speed_supply || d.fanSpeedSupply) != null);

          if (hasHumidity) humidityNodes.push({ node, data });
          if (hasTemp) tempNodes.push({ node, data });
          if (hasFan) fanNodes.push({ node, data });
        }

        // Humidity chart
        if (humidityNodes.length) {
          const chartId = 'chart-humidity';
          container.innerHTML += '<div class="chart-container"><h2>💧 Humidity</h2><div class="chart-wrapper"><canvas id="' + chartId + '"></canvas></div></div>';

          requestAnimationFrame(() => {
            const ctx = document.getElementById(chartId);
            if (!ctx) return;
            const hueStep = 360 / humidityNodes.length;
            charts[chartId] = new Chart(ctx, {
              type: 'line',
              data: {
                datasets: humidityNodes.map((h, i) => ({
                  label: h.node.nodeName || 'Node ' + h.node.nodeId,
                  data: h.data.filter(d => d.humidity != null).map(d => ({ x: d.timestamp, y: d.humidity })),
                  borderColor: 'hsl(' + (210 + i * hueStep) + ', 70%, 60%)',
                  backgroundColor: 'hsla(' + (210 + i * hueStep) + ', 70%, 60%, 0.1)',
                  fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
                }))
              },
              options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, title: { display: true, text: 'Humidity %', color: '#666' } } } }
            });
          });
        }

        // Temperature chart
        if (tempNodes.length) {
          const chartId = 'chart-temp';
          container.innerHTML += '<div class="chart-container"><h2>🌡️ Temperature</h2><div class="chart-wrapper"><canvas id="' + chartId + '"></canvas></div></div>';

          requestAnimationFrame(() => {
            const ctx = document.getElementById(chartId);
            if (!ctx) return;
            const hueStep = 360 / tempNodes.length;
            charts[chartId] = new Chart(ctx, {
              type: 'line',
              data: {
                datasets: tempNodes.map((t, i) => ({
                  label: t.node.nodeName || 'Node ' + t.node.nodeId,
                  data: t.data.filter(d => d.temperature != null).map(d => ({ x: d.timestamp, y: d.temperature })),
                  borderColor: 'hsl(' + (30 + i * 40) + ', 80%, 55%)',
                  backgroundColor: 'hsla(' + (30 + i * 40) + ', 80%, 55%, 0.1)',
                  fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
                }))
              },
              options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, title: { display: true, text: 'Temperature °C', color: '#666' } } } }
            });
          });
        }

        // Fan speed chart
        if (fanNodes.length) {
          const chartId = 'chart-fan';
          container.innerHTML += '<div class="chart-container"><h2>🌀 Fan Speed</h2><div class="chart-wrapper"><canvas id="' + chartId + '"></canvas></div></div>';

          requestAnimationFrame(() => {
            const ctx = document.getElementById(chartId);
            if (!ctx) return;
            const datasets = [];
            for (const f of fanNodes) {
              const supData = f.data.filter(d => (d.fan_speed_supply || d.fanSpeedSupply) != null);
              const exhData = f.data.filter(d => (d.fan_speed_exhaust || d.fanSpeedExhaust) != null);
              if (supData.length) datasets.push({
                label: (f.node.nodeName || 'Node ' + f.node.nodeId) + ' Supply',
                data: supData.map(d => ({ x: d.timestamp, y: d.fan_speed_supply || d.fanSpeedSupply })),
                borderColor: COLORS.fanSupply.line, backgroundColor: COLORS.fanSupply.fill,
                fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
              });
              if (exhData.length) datasets.push({
                label: (f.node.nodeName || 'Node ' + f.node.nodeId) + ' Exhaust',
                data: exhData.map(d => ({ x: d.timestamp, y: d.fan_speed_exhaust || d.fanSpeedExhaust })),
                borderColor: COLORS.fanExhaust.line, backgroundColor: COLORS.fanExhaust.fill,
                fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
              });
            }
            charts[chartId] = new Chart(ctx, {
              type: 'line',
              data: { datasets },
              options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, title: { display: true, text: 'RPM', color: '#666' } } } }
            });
          });
        }

        if (!humidityNodes.length && !tempNodes.length && !fanNodes.length) {
          container.innerHTML = '<div class="loading">No chart data available yet. Data will appear after a few minutes of polling.</div>';
        }

      } catch (err) {
        document.getElementById('error-container').innerHTML =
          '<div class="error">Failed to load charts: ' + err.message + '</div>';
      }
    }

    // ── Time controls ────────────────────────────────────────────────────

    document.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentHours = parseInt(btn.dataset.hours);
        loadCharts();
      });
    });

    // ── Init ─────────────────────────────────────────────────────────────

    loadStats();
    loadCharts();

    // Auto-refresh every 30 seconds
    refreshInterval = setInterval(() => {
      loadStats();
      loadCharts();
    }, 30000);
  </script>
</body>
</html>`;
  }
}
