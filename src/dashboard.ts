import express, { Request, Response } from 'express';
import { Server } from 'http';
import { DataLogger } from './dataLogger';
import { Logger } from 'homebridge';

export class DashboardServer {
  private app: express.Application;
  private server: Server | null = null;
  private dataLogger: DataLogger;
  private log: Logger;
  private port: number;

  constructor(dataLogger: DataLogger, log: Logger, port: number) {
    this.dataLogger = dataLogger;
    this.log = log;
    this.port = port;
    this.app = express();

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // API: get known nodes
    this.app.get('/api/nodes', async (_req: Request, res: Response) => {
      try {
        const nodes = await this.dataLogger.getKnownNodes();
        res.json(nodes);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch nodes' });
      }
    });

    // API: get latest readings
    this.app.get('/api/latest', async (_req: Request, res: Response) => {
      try {
        const readings = await this.dataLogger.getLatestReadings();
        res.json(readings);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch latest readings' });
      }
    });

    // API: get chart data
    this.app.get('/api/chart/:nodeId/:field', async (req: Request, res: Response) => {
      try {
        const nodeId = parseInt(req.params.nodeId, 10);
        const field = req.params.field;
        const range = (req.query.range as string) || '24h';

        const now = Math.floor(Date.now() / 1000);
        let from: number;

        switch (range) {
          case '1h': from = now - 3600; break;
          case '6h': from = now - 21600; break;
          case '24h': from = now - 86400; break;
          case '7d': from = now - 604800; break;
          case '30d': from = now - 2592000; break;
          default: from = now - 86400;
        }

        const data = await this.dataLogger.getChartData(nodeId, field, from, now);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch chart data' });
      }
    });

    // API: ventilation timeline
    this.app.get('/api/timeline/:nodeId', async (req: Request, res: Response) => {
      try {
        const nodeId = parseInt(req.params.nodeId, 10);
        const range = (req.query.range as string) || '24h';

        const now = Math.floor(Date.now() / 1000);
        let from: number;

        switch (range) {
          case '1h': from = now - 3600; break;
          case '6h': from = now - 21600; break;
          case '24h': from = now - 86400; break;
          case '7d': from = now - 604800; break;
          case '30d': from = now - 2592000; break;
          default: from = now - 86400;
        }

        const data = await this.dataLogger.getVentilationTimeline(nodeId, from, now);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch timeline' });
      }
    });

    // Dashboard HTML
    this.app.get('/', (_req: Request, res: Response) => {
      res.send(this.getDashboardHtml());
    });
  }

  start(): void {
    this.server = this.app.listen(this.port, '0.0.0.0', () => {
      this.log.info(`Duco Energy Dashboard running at http://localhost:${this.port}`);
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
  <title>Duco Energy Dashboard</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      padding: 20px;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #58a6ff;
    }
    .subtitle { color: #8b949e; margin-bottom: 24px; font-size: 14px; }
    .controls {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .controls button {
      padding: 6px 16px;
      border: 1px solid #30363d;
      background: #21262d;
      color: #c9d1d9;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    .controls button:hover { background: #30363d; }
    .controls button.active {
      background: #1f6feb;
      border-color: #1f6feb;
      color: #fff;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .card {
      background: #161b22;
      border: 2px solid #30363d;
      border-radius: 10px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }
    .card:hover { border-color: #58a6ff; background: #1c2333; }
    .card.selected {
      border-color: #58a6ff;
      background: #1c2333;
      box-shadow: 0 0 0 1px #58a6ff, 0 0 20px rgba(88,166,255,0.15);
    }
    .card .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .card .card-name {
      font-size: 15px;
      font-weight: 600;
      color: #e6edf3;
    }
    .card .card-type {
      font-size: 11px;
      color: #8b949e;
      background: #21262d;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .card .state {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .state-auto { background: #238636; color: #fff; }
    .state-man1 { background: #1f6feb; color: #fff; }
    .state-man2 { background: #d29922; color: #000; }
    .state-man3 { background: #f85149; color: #fff; }
    .card .sensor-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }
    .card .sensor-item {
      text-align: center;
    }
    .card .sensor-label {
      font-size: 10px;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .card .sensor-val {
      font-size: 22px;
      font-weight: 700;
      color: #e6edf3;
      line-height: 1.2;
    }
    .card .sensor-val .unit {
      font-size: 12px;
      font-weight: 400;
      color: #8b949e;
    }
    .card .selected-indicator {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #58a6ff;
      display: none;
    }
    .card.selected .selected-indicator { display: block; }
    .chart-container {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .chart-container h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .chart-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 768px) {
      .chart-row { grid-template-columns: 1fr; }
    }
    .loading { text-align: center; color: #8b949e; padding: 40px; }
  </style>
</head>
<body>
  <h1>🌬️ Duco Energy Dashboard</h1>
  <p class="subtitle">Real-time ventilation monitoring &amp; sensor data</p>

  <div class="controls" id="rangeControls">
    <button onclick="setRange('1h')">1 Hour</button>
    <button onclick="setRange('6h')">6 Hours</button>
    <button onclick="setRange('24h')" class="active">24 Hours</button>
    <button onclick="setRange('7d')">7 Days</button>
    <button onclick="setRange('30d')">30 Days</button>
  </div>

  <div class="cards" id="liveCards">
    <div class="loading">Loading sensor data...</div>
  </div>

  <div class="chart-row">
    <div class="chart-container">
      <h2>Relative Humidity (%)</h2>
      <canvas id="chartRh"></canvas>
    </div>
    <div class="chart-container">
      <h2>IAQ Humidity Index</h2>
      <canvas id="chartIaqRh"></canvas>
    </div>
  </div>

  <div class="chart-row">
    <div class="chart-container">
      <h2>CO₂ (ppm)</h2>
      <canvas id="chartCo2"></canvas>
    </div>
    <div class="chart-container">
      <h2>IAQ CO₂ Index</h2>
      <canvas id="chartIaqCo2"></canvas>
    </div>
  </div>

  <div class="chart-container">
    <h2>Ventilation State Timeline</h2>
    <canvas id="chartTimeline"></canvas>
  </div>

  <div class="chart-container">
    <h2>Target Flow Level</h2>
    <canvas id="chartFlow"></canvas>
  </div>

  <script>
    let currentRange = '24h';
    let selectedNodeId = null;
    let charts = {};
    let refreshTimer = null;

    const chartColors = {
      rh: '#58a6ff',
      iaq_rh: '#3fb950',
      co2: '#d29922',
      iaq_co2: '#f0883e',
      flow: '#bc8cff',
    };

    function createChart(canvasId, label, color) {
      const ctx = document.getElementById(canvasId).getContext('2d');
      return new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: label,
            data: [],
            borderColor: color,
            backgroundColor: color + '20',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.5,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              type: 'linear',
              ticks: {
                color: '#8b949e',
                callback: (val) => {
                  const d = new Date(val * 1000);
                  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                },
                maxTicksLimit: 8,
              },
              grid: { color: '#21262d' },
            },
            y: {
              ticks: { color: '#8b949e' },
              grid: { color: '#21262d' },
            }
          },
          interaction: {
            intersect: false,
            mode: 'index',
          },
        }
      });
    }

    function createTimelineChart(canvasId) {
      const ctx = document.getElementById(canvasId).getContext('2d');
      const stateMap = { 'AUTO': 0, 'MAN1': 1, 'MAN2': 2, 'MAN3': 3, 'AWAY': -1 };
      return new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Ventilation State',
            data: [],
            borderColor: '#f85149',
            backgroundColor: '#f8514920',
            fill: true,
            stepped: true,
            pointRadius: 0,
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 3,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              type: 'linear',
              ticks: {
                color: '#8b949e',
                callback: (val) => {
                  const d = new Date(val * 1000);
                  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                },
                maxTicksLimit: 8,
              },
              grid: { color: '#21262d' },
            },
            y: {
              ticks: {
                color: '#8b949e',
                callback: (val) => {
                  const labels = { '-1': 'AWAY', '0': 'AUTO', '1': 'MAN1', '2': 'MAN2', '3': 'MAN3' };
                  return labels[String(val)] || val;
                },
                stepSize: 1,
              },
              min: -1,
              max: 3,
              grid: { color: '#21262d' },
            }
          },
        }
      });
    }

    function initCharts() {
      charts.rh = createChart('chartRh', 'Humidity %', chartColors.rh);
      charts.iaqRh = createChart('chartIaqRh', 'IAQ RH', chartColors.iaq_rh);
      charts.co2 = createChart('chartCo2', 'CO₂ ppm', chartColors.co2);
      charts.iaqCo2 = createChart('chartIaqCo2', 'IAQ CO₂', chartColors.iaq_co2);
      charts.timeline = createTimelineChart('chartTimeline');
      charts.flow = createChart('chartFlow', 'Flow Target', chartColors.flow);
    }

    async function updateChart(chart, nodeId, field) {
      try {
        const resp = await fetch('/api/chart/' + nodeId + '/' + field + '?range=' + currentRange);
        const data = await resp.json();
        chart.data.labels = data.map(d => d.timestamp);
        chart.data.datasets[0].data = data.map(d => ({ x: d.timestamp, y: d.value }));
        chart.update('none');
      } catch (err) {
        console.error('Failed to update chart:', field, err);
      }
    }

    async function updateTimeline(nodeId) {
      try {
        const resp = await fetch('/api/timeline/' + nodeId + '?range=' + currentRange);
        const data = await resp.json();
        const stateMap = { 'AUTO': 0, 'MAN1': 1, 'MAN2': 2, 'MAN3': 3, 'AWAY': -1 };
        charts.timeline.data.labels = data.map(d => d.timestamp);
        charts.timeline.data.datasets[0].data = data.map(d => ({
          x: d.timestamp,
          y: stateMap[d.state] ?? 0
        }));
        charts.timeline.update('none');
      } catch (err) {
        console.error('Failed to update timeline:', err);
      }
    }

    async function loadLiveData() {
      try {
        const resp = await fetch('/api/latest');
        const readings = await resp.json();
        const container = document.getElementById('liveCards');

        if (readings.length === 0) {
          container.innerHTML = '<div class="loading">No data yet. Waiting for sensor readings...</div>';
          return;
        }

        if (!selectedNodeId && readings.length > 0) {
          selectedNodeId = readings[0].nodeId;
        }

        container.innerHTML = readings.map(r => {
          const stateClass = 'state-' + (r.ventilationState || 'auto').toLowerCase();
          const selected = r.nodeId === selectedNodeId ? ' selected' : '';
          return '<div class="card' + selected + '" onclick="selectNode(' + r.nodeId + ')">' +
            '<div class="selected-indicator"></div>' +
            '<div class="card-header">' +
              '<span class="card-name">' + (r.nodeName || 'Node ' + r.nodeId) + '</span>' +
              '<span class="card-type">' + (r.nodeType || '?') + '</span>' +
            '</div>' +
            '<div><span class="state ' + stateClass + '">' + (r.ventilationState || 'N/A') + '</span></div>' +
            '<div class="sensor-grid">' +
              '<div class="sensor-item">' +
                '<div class="sensor-label">Humidity</div>' +
                '<div class="sensor-val">' + (r.rh || 0).toFixed(1) + '<span class="unit">%</span></div>' +
              '</div>' +
              '<div class="sensor-item">' +
                '<div class="sensor-label">CO₂</div>' +
                '<div class="sensor-val">' + (r.co2 || 0) + '<span class="unit">ppm</span></div>' +
              '</div>' +
              '<div class="sensor-item">' +
                '<div class="sensor-label">Flow</div>' +
                '<div class="sensor-val">' + (r.flowLvlTgt || 0) + '<span class="unit">%</span></div>' +
              '</div>' +
              '<div class="sensor-item">' +
                '<div class="sensor-label">IAQ RH</div>' +
                '<div class="sensor-val">' + (r.iaqRh || 0) + '</div>' +
              '</div>' +
              '<div class="sensor-item">' +
                '<div class="sensor-label">IAQ CO₂</div>' +
                '<div class="sensor-val">' + (r.iaqCo2 || 0) + '</div>' +
              '</div>' +
              '<div class="sensor-item">' +
                '<div class="sensor-label">Timer</div>' +
                '<div class="sensor-val">' + formatTimer(r.timeStateRemain || 0) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('');

      } catch (err) {
        console.error('Failed to load live data:', err);
      }
    }

    function formatTimer(seconds) {
      if (!seconds || seconds <= 0) return '--';
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return m + '<span class="unit">m</span>' + (s > 0 ? s + '<span class="unit">s</span>' : '');
    }

    function selectNode(nodeId) {
      selectedNodeId = nodeId;
      document.querySelectorAll('.card').forEach(card => {
        const onclick = card.getAttribute('onclick') || '';
        const match = onclick.match(/\\d+/);
        if (match) {
          card.classList.toggle('selected', parseInt(match[0]) === nodeId);
        }
      });
      refreshCharts();
    }

    async function refreshCharts() {
      if (!selectedNodeId) return;
      await Promise.all([
        updateChart(charts.rh, selectedNodeId, 'rh'),
        updateChart(charts.iaqRh, selectedNodeId, 'iaq_rh'),
        updateChart(charts.co2, selectedNodeId, 'co2'),
        updateChart(charts.iaqCo2, selectedNodeId, 'iaq_co2'),
        updateChart(charts.flow, selectedNodeId, 'flow_lvl_tgt'),
        updateTimeline(selectedNodeId),
      ]);
    }

    function setRange(range) {
      currentRange = range;
      document.querySelectorAll('#rangeControls button').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().replace(' ', '') === range);
      });
      refreshCharts();
    }

    async function init() {
      initCharts();
      await loadLiveData();
      await refreshCharts();

      // Auto-refresh every 30 seconds
      refreshTimer = setInterval(async () => {
        await loadLiveData();
        await refreshCharts();
      }, 30000);
    }

    init();
  </script>
</body>
</html>`;
  }
}
