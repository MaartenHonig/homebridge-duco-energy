"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardServer = void 0;
const express_1 = __importDefault(require("express"));
class DashboardServer {
    constructor(dataLogger, log, port) {
        this.server = null;
        this.dataLogger = dataLogger;
        this.log = log;
        this.port = port;
        this.app = (0, express_1.default)();
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
        this.app.get('/api/chart/:nodeId/:field', async (req, res) => {
            try {
                const nodeId = parseInt(req.params.nodeId, 10);
                const field = req.params.field;
                const range = req.query.range || '24h';
                const now = Math.floor(Date.now() / 1000);
                let from;
                switch (range) {
                    case '1h':
                        from = now - 3600;
                        break;
                    case '6h':
                        from = now - 21600;
                        break;
                    case '24h':
                        from = now - 86400;
                        break;
                    case '7d':
                        from = now - 604800;
                        break;
                    case '30d':
                        from = now - 2592000;
                        break;
                    default: from = now - 86400;
                }
                res.json(await this.dataLogger.getChartData(nodeId, field, from, now));
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
                let from;
                switch (range) {
                    case '1h':
                        from = now - 3600;
                        break;
                    case '6h':
                        from = now - 21600;
                        break;
                    case '24h':
                        from = now - 86400;
                        break;
                    case '7d':
                        from = now - 604800;
                        break;
                    case '30d':
                        from = now - 2592000;
                        break;
                    default: from = now - 86400;
                }
                res.json(await this.dataLogger.getVentilationTimeline(nodeId, from, now));
            }
            catch {
                res.status(500).json({ error: 'Failed' });
            }
        });
        this.app.get('/', (_req, res) => {
            res.send(this.getDashboardHtml());
        });
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
    getDashboardHtml() {
        return [
            '<!DOCTYPE html><html lang="en"><head>',
            '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '<title>Duco Energy Dashboard</title>',
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>',
            '<style>',
            '* { margin: 0; padding: 0; box-sizing: border-box; }',
            'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #e6edf3; padding: 20px; }',
            'h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; color: #58a6ff; }',
            '.subtitle { color: #8b949e; margin-bottom: 24px; font-size: 14px; }',
            '.controls { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }',
            '.controls button { padding: 6px 16px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.15s; }',
            '.controls button:hover { background: #30363d; }',
            '.controls button.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }',
            '.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; margin-bottom: 24px; }',
            '.card { background: #161b22; border: 2px solid #30363d; border-radius: 10px; padding: 16px; cursor: pointer; transition: all 0.2s; position: relative; }',
            '.card:hover { border-color: #58a6ff; background: #1c2333; }',
            '.card.selected { border-color: #58a6ff; background: #1c2333; box-shadow: 0 0 0 1px #58a6ff, 0 0 20px rgba(88,166,255,0.15); }',
            '.card .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }',
            '.card .card-name { font-size: 15px; font-weight: 600; color: #e6edf3; }',
            '.card .card-type { font-size: 11px; color: #8b949e; background: #21262d; padding: 2px 8px; border-radius: 4px; }',
            '.card .state { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }',
            '.state-auto { background: #238636; color: #fff; }',
            '.state-man1 { background: #1f6feb; color: #fff; }',
            '.state-man2 { background: #d29922; color: #000; }',
            '.state-man3 { background: #f85149; color: #fff; }',
            '.card .sensor-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-top: 10px; }',
            '.card .sensor-item { text-align: center; }',
            '.card .sensor-label { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }',
            '.card .sensor-val { font-size: 20px; font-weight: 700; color: #e6edf3; line-height: 1.2; }',
            '.card .sensor-val .unit { font-size: 11px; font-weight: 400; color: #8b949e; }',
            '.card .selected-indicator { position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; border-radius: 50%; background: #58a6ff; display: none; }',
            '.card.selected .selected-indicator { display: block; }',
            '.chart-container { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 16px; }',
            '.chart-container h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }',
            '.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }',
            '@media (max-width: 768px) { .chart-row { grid-template-columns: 1fr; } }',
            '.loading { text-align: center; color: #8b949e; padding: 40px; }',
            '</style></head><body>',
            '<h1>\uD83C\uDF2C\uFE0F Duco Energy Dashboard</h1>',
            '<p class="subtitle">Real-time ventilation monitoring &amp; sensor data</p>',
            '<div class="cards" id="liveCards"><div class="loading">Loading sensor data...</div></div>',
            '<div class="controls" id="rangeControls">',
            '<button onclick="setRange(\'1h\')">1 Hour</button>',
            '<button onclick="setRange(\'6h\')">6 Hours</button>',
            '<button onclick="setRange(\'24h\')" class="active">24 Hours</button>',
            '<button onclick="setRange(\'7d\')">7 Days</button>',
            '<button onclick="setRange(\'30d\')">30 Days</button>',
            '</div>',
            '<div class="chart-container"><h2>\uD83D\uDD0D Pattern Overview (all values 0-100)</h2><canvas id="chartOverlay"></canvas></div>',
            '<div class="chart-row">',
            '<div class="chart-container"><h2>Relative Humidity (%)</h2><canvas id="chartRh"></canvas></div>',
            '<div class="chart-container"><h2>IAQ Humidity Index</h2><canvas id="chartIaqRh"></canvas></div>',
            '</div>',
            '<div class="chart-row">',
            '<div class="chart-container"><h2>Target Flow Level (%)</h2><canvas id="chartFlow"></canvas></div>',
            '<div class="chart-container"><h2>Ventilation State Timeline</h2><canvas id="chartTimeline"></canvas></div>',
            '</div>',
            '<script>',
            'var currentRange = "24h";',
            'var selectedNodeId = null;',
            'var charts = {};',
            'var refreshTimer = null;',
            'var chartColors = { rh: "#58a6ff", iaq_rh: "#3fb950", flow: "#bc8cff", state: "#f85149" };',
            '',
            'var tooltipTitle = function(items) {',
            '  if (!items.length) return "";',
            '  var d = new Date(items[0].parsed.x * 1000);',
            '  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });',
            '};',
            '',
            'var xScale = {',
            '  type: "linear",',
            '  ticks: { color: "#8b949e", callback: function(val) { var d = new Date(val * 1000); return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }, maxTicksLimit: 8 },',
            '  grid: { color: "#21262d" }',
            '};',
            '',
            'function createChart(canvasId, label, color) {',
            '  var ctx = document.getElementById(canvasId).getContext("2d");',
            '  return new Chart(ctx, {',
            '    type: "line",',
            '    data: { labels: [], datasets: [{ label: label, data: [], borderColor: color, backgroundColor: color + "20", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }] },',
            '    options: {',
            '      responsive: true, maintainAspectRatio: true, aspectRatio: 2.5,',
            '      plugins: { legend: { display: false }, tooltip: { callbacks: { title: tooltipTitle } } },',
            '      scales: { x: xScale, y: { ticks: { color: "#8b949e" }, grid: { color: "#21262d" } } },',
            '      interaction: { intersect: false, mode: "index" }',
            '    }',
            '  });',
            '}',
            '',
            'function createOverlayChart(canvasId) {',
            '  var ctx = document.getElementById(canvasId).getContext("2d");',
            '  return new Chart(ctx, {',
            '    type: "line",',
            '    data: { labels: [], datasets: [',
            '      { label: "Humidity %", data: [], borderColor: chartColors.rh, backgroundColor: "transparent", tension: 0.3, pointRadius: 0, borderWidth: 2 },',
            '      { label: "IAQ RH", data: [], borderColor: chartColors.iaq_rh, backgroundColor: "transparent", tension: 0.3, pointRadius: 0, borderWidth: 2 },',
            '      { label: "Flow %", data: [], borderColor: chartColors.flow, backgroundColor: "transparent", tension: 0.3, pointRadius: 0, borderWidth: 2 },',
            '      { label: "Vent State", data: [], borderColor: chartColors.state, backgroundColor: chartColors.state + "15", stepped: true, fill: true, pointRadius: 0, borderWidth: 1, borderDash: [4, 4] }',
            '    ] },',
            '    options: {',
            '      responsive: true, maintainAspectRatio: true, aspectRatio: 2.5,',
            '      plugins: {',
            '        legend: { display: true, position: "top", labels: { color: "#c9d1d9", usePointStyle: true, pointStyle: "line", padding: 16, font: { size: 12 } } },',
            '        tooltip: { callbacks: { title: tooltipTitle } }',
            '      },',
            '      scales: { x: xScale, y: { min: 0, max: 100, ticks: { color: "#8b949e" }, grid: { color: "#21262d" } } },',
            '      interaction: { intersect: false, mode: "index" }',
            '    }',
            '  });',
            '}',
            '',
            'function createTimelineChart(canvasId) {',
            '  var ctx = document.getElementById(canvasId).getContext("2d");',
            '  return new Chart(ctx, {',
            '    type: "line",',
            '    data: { labels: [], datasets: [{ label: "State", data: [], borderColor: "#f85149", backgroundColor: "#f8514920", fill: true, stepped: true, pointRadius: 0, borderWidth: 2 }] },',
            '    options: {',
            '      responsive: true, maintainAspectRatio: true, aspectRatio: 2.5,',
            '      plugins: { legend: { display: false }, tooltip: { callbacks: {',
            '        title: tooltipTitle,',
            '        label: function(item) { var l = { "-1": "AWAY", "0": "AUTO", "1": "MAN1", "2": "MAN2", "3": "MAN3" }; return " State: " + (l[String(item.parsed.y)] || item.parsed.y); }',
            '      } } },',
            '      scales: {',
            '        x: xScale,',
            '        y: { ticks: { color: "#8b949e", callback: function(v) { var l = { "-1": "AWAY", "0": "AUTO", "1": "MAN1", "2": "MAN2", "3": "MAN3" }; return l[String(v)] || v; }, stepSize: 1 }, min: -1, max: 3, grid: { color: "#21262d" } }',
            '      }',
            '    }',
            '  });',
            '}',
            '',
            'function initCharts() {',
            '  charts.overlay = createOverlayChart("chartOverlay");',
            '  charts.rh = createChart("chartRh", "Humidity %", chartColors.rh);',
            '  charts.iaqRh = createChart("chartIaqRh", "IAQ RH", chartColors.iaq_rh);',
            '  charts.flow = createChart("chartFlow", "Flow Target", chartColors.flow);',
            '  charts.timeline = createTimelineChart("chartTimeline");',
            '}',
            '',
            'async function updateChart(chart, nodeId, field) {',
            '  try {',
            '    var resp = await fetch("/api/chart/" + nodeId + "/" + field + "?range=" + currentRange);',
            '    var data = await resp.json();',
            '    chart.data.labels = data.map(function(d) { return d.timestamp; });',
            '    chart.data.datasets[0].data = data.map(function(d) { return { x: d.timestamp, y: d.value }; });',
            '    chart.update("none");',
            '  } catch(e) { console.error("Chart update failed:", field, e); }',
            '}',
            '',
            'async function updateOverlay(nodeId) {',
            '  try {',
            '    var results = await Promise.all([',
            '      fetch("/api/chart/" + nodeId + "/rh?range=" + currentRange).then(function(r){return r.json();}),',
            '      fetch("/api/chart/" + nodeId + "/iaq_rh?range=" + currentRange).then(function(r){return r.json();}),',
            '      fetch("/api/chart/" + nodeId + "/flow_lvl_tgt?range=" + currentRange).then(function(r){return r.json();}),',
            '      fetch("/api/timeline/" + nodeId + "?range=" + currentRange).then(function(r){return r.json();})',
            '    ]);',
            '    var stateMap = { "AUTO": 25, "MAN1": 50, "MAN2": 75, "MAN3": 100, "AWAY": 0 };',
            '    charts.overlay.data.datasets[0].data = results[0].map(function(d){ return {x:d.timestamp, y:d.value}; });',
            '    charts.overlay.data.datasets[1].data = results[1].map(function(d){ return {x:d.timestamp, y:d.value}; });',
            '    charts.overlay.data.datasets[2].data = results[2].map(function(d){ return {x:d.timestamp, y:d.value}; });',
            '    charts.overlay.data.datasets[3].data = results[3].map(function(d){ return {x:d.timestamp, y: stateMap[d.state] || 0}; });',
            '    charts.overlay.update("none");',
            '  } catch(e) { console.error("Overlay update failed:", e); }',
            '}',
            '',
            'async function updateTimeline(nodeId) {',
            '  try {',
            '    var resp = await fetch("/api/timeline/" + nodeId + "?range=" + currentRange);',
            '    var data = await resp.json();',
            '    var stateMap = { "AUTO": 0, "MAN1": 1, "MAN2": 2, "MAN3": 3, "AWAY": -1 };',
            '    charts.timeline.data.labels = data.map(function(d){ return d.timestamp; });',
            '    charts.timeline.data.datasets[0].data = data.map(function(d){ return {x:d.timestamp, y: stateMap[d.state] !== undefined ? stateMap[d.state] : 0}; });',
            '    charts.timeline.update("none");',
            '  } catch(e) { console.error("Timeline failed:", e); }',
            '}',
            '',
            'async function loadLiveData() {',
            '  try {',
            '    var resp = await fetch("/api/latest");',
            '    var readings = await resp.json();',
            '    var container = document.getElementById("liveCards");',
            '    if (readings.length === 0) { container.innerHTML = \'<div class="loading">No data yet...</div>\'; return; }',
            '    if (!selectedNodeId) selectedNodeId = readings[0].nodeId;',
            '    container.innerHTML = readings.map(function(r) {',
            '      var sc = "state-" + (r.ventilationState || "auto").toLowerCase();',
            '      var sel = r.nodeId === selectedNodeId ? " selected" : "";',
            '      var timer = r.timeStateRemain > 0 ? Math.floor(r.timeStateRemain/60) + "<span class=\\"unit\\">m</span>" : "--";',
            '      return \'<div class="card\' + sel + \'" onclick="selectNode(\' + r.nodeId + \')">\' +',
            '        \'<div class="selected-indicator"></div>\' +',
            '        \'<div class="card-header"><span class="card-name">\' + (r.nodeName || "Node " + r.nodeId) + \'</span><span class="card-type">\' + (r.nodeType || "?") + \'</span></div>\' +',
            '        \'<div><span class="state \' + sc + \'">\' + (r.ventilationState || "N/A") + \'</span></div>\' +',
            '        \'<div class="sensor-grid">\' +',
            '          \'<div class="sensor-item"><div class="sensor-label">Humidity</div><div class="sensor-val">\' + (r.rh || 0).toFixed(1) + \'<span class="unit">%</span></div></div>\' +',
            '          \'<div class="sensor-item"><div class="sensor-label">IAQ RH</div><div class="sensor-val">\' + (r.iaqRh || 0) + \'</div></div>\' +',
            '          \'<div class="sensor-item"><div class="sensor-label">Flow</div><div class="sensor-val">\' + (r.flowLvlTgt || 0) + \'<span class="unit">%</span></div></div>\' +',
            '          \'<div class="sensor-item"><div class="sensor-label">Timer</div><div class="sensor-val">\' + timer + \'</div></div>\' +',
            '        \'</div></div>\';',
            '    }).join("");',
            '  } catch(e) { console.error("Live data failed:", e); }',
            '}',
            '',
            'function selectNode(nodeId) {',
            '  selectedNodeId = nodeId;',
            '  document.querySelectorAll(".card").forEach(function(card) {',
            '    var m = (card.getAttribute("onclick") || "").match(/\\d+/);',
            '    if (m) card.classList.toggle("selected", parseInt(m[0]) === nodeId);',
            '  });',
            '  refreshCharts();',
            '}',
            '',
            'async function refreshCharts() {',
            '  if (!selectedNodeId) return;',
            '  await Promise.all([',
            '    updateOverlay(selectedNodeId),',
            '    updateChart(charts.rh, selectedNodeId, "rh"),',
            '    updateChart(charts.iaqRh, selectedNodeId, "iaq_rh"),',
            '    updateChart(charts.flow, selectedNodeId, "flow_lvl_tgt"),',
            '    updateTimeline(selectedNodeId)',
            '  ]);',
            '}',
            '',
            'function setRange(range) {',
            '  currentRange = range;',
            '  document.querySelectorAll("#rangeControls button").forEach(function(btn) {',
            '    var m = btn.getAttribute("onclick").match(/\'([^\']+)\'/);',
            '    btn.classList.toggle("active", m && m[1] === range);',
            '  });',
            '  refreshCharts();',
            '}',
            '',
            'async function init() {',
            '  initCharts();',
            '  await loadLiveData();',
            '  await refreshCharts();',
            '  refreshTimer = setInterval(async function() { await loadLiveData(); await refreshCharts(); }, 30000);',
            '}',
            'init();',
            '</script></body></html>',
        ].join('\n');
    }
}
exports.DashboardServer = DashboardServer;
