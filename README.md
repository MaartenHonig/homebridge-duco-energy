# homebridge-duco-energy

Homebridge plugin for **Duco Energy** ventilation systems with **Connectivity Board 2.0**.

Control your DucoBox Energy from Apple Home and monitor bathroom humidity sensors with a built-in dashboard.

## Features

### Apple Home / HomeKit
- **Fan control** — Set ventilation to Auto, Speed 1 (low), Speed 2 (medium), or Speed 3 (high)
- **Humidity sensors** — Real-time humidity readings from BSRH bathroom controllers
- **Air quality** — CO₂ and IAQ index exposed as Air Quality sensors
- **Override indicator** — Motion sensor that triggers when ventilation is in manual override (helps you spot when bathroom sensors activate)

### Built-in Dashboard
- Real-time sensor data with live-updating cards
- Historical graphs: humidity, CO₂, IAQ indices, flow targets
- Ventilation state timeline (see exactly when and why the system activated)
- Time ranges: 1 hour, 6 hours, 24 hours, 7 days, 30 days
- Per-node filtering

## Requirements

- **DucoBox Energy** (tested with Energy 450)
- **Duco Connectivity Board 2.0** — connected to your local network via Ethernet or Wi-Fi
- **Homebridge** >= 1.6.0
- **Node.js** >= 18

## Installation

### Via Homebridge Config UI X
Search for `homebridge-duco-energy` in the Homebridge plugin search and install.

### Manual
```bash
npm install -g homebridge-duco-energy
```

## Configuration

Add to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "DucoEnergy",
      "name": "Duco Energy",
      "host": "192.168.1.100",
      "pollingInterval": 30,
      "overrideDurationMinutes": 15,
      "enableDashboard": true,
      "dashboardPort": 9100,
      "dataRetentionDays": 30
    }
  ]
}
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `host` | (required) | IP address of your Duco Connectivity Board |
| `pollingInterval` | `30` | Seconds between API polls |
| `overrideDurationMinutes` | `15` | Minutes per manual speed override |
| `enableDashboard` | `true` | Enable the web dashboard |
| `dashboardPort` | `9100` | Port for the dashboard |
| `dataRetentionDays` | `30` | Days of history to keep |

## Dashboard

Once running, access the dashboard at:
```
http://<your-homebridge-ip>:9100
```

The dashboard shows:
- Live sensor values for each node (humidity, CO₂, IAQ, flow target, ventilation state)
- Graphs over time with selectable ranges
- Ventilation state timeline to see when manual overrides and sensor triggers happened

## HomeKit Speed Mapping

| HomeKit | Duco State | Description |
|---------|-----------|-------------|
| 0% / Auto | AUTO | Automatic (demand-controlled) |
| 33% | MAN1 | Low speed |
| 67% | MAN2 | Medium speed |
| 100% | MAN3 | High speed |

## API

This plugin uses the **local REST API** on the Connectivity Board. No cloud account or API key needed. All communication stays on your local network.

## Supported Node Types

| Type | Description | HomeKit Exposure |
|------|-------------|-----------------|
| BOX | Main DucoBox unit | Fan (speed control) |
| BSRH | Bathroom humidity sensor | Humidity + Air Quality + Motion |
| UCCO2 | CO₂ sensor | Humidity + Air Quality + Motion |
| UCRH | Humidity sensor | Humidity + Air Quality + Motion |

## Development

```bash
git clone https://github.com/your-username/homebridge-duco-energy.git
cd homebridge-duco-energy
npm install
npm run build
```

## License

MIT
