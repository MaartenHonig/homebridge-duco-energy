# homebridge-duco

Homebridge plugin for **Duco ventilation systems** (DucoBox Energy, Focus, Silent) via the **Connectivity Board 2.0** local REST API.

## Features

- **Fan control** in Apple Home — set ventilation to Auto, Low (1), Medium (2), or High (3)
- **Boost switch** — one tap activates medium speed for 45 minutes (configurable), then returns to Auto
- **Auto mode switch** — toggle between automatic (demand-controlled) and manual mode
- **Humidity sensors** — each bathroom controller appears as a HomeKit humidity sensor
- **Temperature sensors** — all temperature data exposed in HomeKit
- **CO₂ sensors** — air quality with CO₂ levels (if your system has CO₂ sensors)
- **Filter maintenance** — HomeKit alerts when filters need changing
- **Sensor dashboard** — web-based graphs showing humidity, temperature, fan speed over time
- **History logging** — SQLite database stores 30 days of sensor data for troubleshooting

## Requirements

- Duco ventilation system (DucoBox Energy, Focus, or Silent)
- **Duco Connectivity Board 2.0** installed and connected to your network
- Homebridge 1.6+ running on your network (e.g. Raspberry Pi)

## Installation

### Via Homebridge UI (recommended)

Search for `homebridge-duco` in the Homebridge plugin tab and install.

### Via npm

```bash
npm install -g homebridge-duco
```

## Configuration

### Via Homebridge UI

After installation, go to the plugin settings and enter your Duco Connectivity Board's IP address. All other settings have sensible defaults.

### Manual config.json

```json
{
  "platforms": [
    {
      "platform": "DucoPlatform",
      "name": "Duco Ventilation",
      "host": "192.168.1.100",
      "port": 80,
      "pollingInterval": 30,
      "dashboardPort": 8581,
      "boostDurationMinutes": 45,
      "dataRetentionDays": 30
    }
  ]
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `host` | *(required)* | IP address of your Duco Connectivity Board |
| `port` | `80` | HTTP port |
| `pollingInterval` | `30` | Seconds between sensor polls |
| `dashboardPort` | `8581` | Port for the web dashboard |
| `boostDurationMinutes` | `45` | How long Boost keeps medium speed (3×15 min) |
| `dataRetentionDays` | `30` | Days of history to keep |

## What appears in Apple Home

After setup, you'll see these accessories:

### DucoBox (main unit)
- **Ventilation Fan** — swipe to set speed: 0% = Auto, 33% = Low, 66% = Medium, 100% = High
- **Auto Mode** switch — toggles automatic (demand-controlled) ventilation
- **Boost** switch — activates medium speed for 45 minutes, then auto-returns to Auto
- **Filter Maintenance** — alerts when filter replacement is due

### Bathroom sensors (one per BSRH controller)
- **Humidity** — current relative humidity %
- **Temperature** — current temperature °C

### CO₂ sensors (if present)
- **Air Quality** — Excellent/Good/Fair/Inferior/Poor based on CO₂
- **CO₂ Level** — exact ppm reading

## Dashboard

Access the sensor dashboard at:

```
http://<homebridge-ip>:8581
```

The dashboard shows:
- Real-time humidity, temperature, and fan speed values
- Interactive time-series graphs (1h, 3h, 6h, 24h, 3d, 7d)
- All sensor nodes on one page
- Auto-refreshes every 30 seconds

This is especially useful for diagnosing why a bathroom sensor keeps triggering the ventilation at unexpected times.

## How the Boost works

The Boost switch mimics pressing button 2 three times on your physical Duco controller:

1. Tap Boost → ventilation goes to Medium (mode 2)
2. Timer starts counting down (default 45 minutes)
3. When timer expires → automatically returns to Auto mode

You can configure the duration in settings. Tap Boost again to cancel early.

## Troubleshooting

### Plugin can't connect
- Make sure your Duco Connectivity Board is connected to the same network
- Try accessing `http://<duco-ip>/info` in a browser — you should see JSON data
- Check that port 80 is not blocked by a firewall

### Sensors show 0 or no data
- Wait a few polling cycles (30 seconds each) for data to populate
- Check the Homebridge log for error messages
- The exact API response format may vary by firmware — open an issue with your log output

### Dashboard shows no graphs
- Data accumulates over time — graphs need at least a few minutes of data
- Check that the dashboard port (default 8581) is accessible

## Development

```bash
git clone https://github.com/your-username/homebridge-duco.git
cd homebridge-duco
npm install
npm run build
```

## License

MIT

## Credits

- API structure informed by [ducopy](https://github.com/Sikerdebaard/ducopy) and [hacs-ducobox-connector](https://github.com/Sikerdebaard/hacs-ducobox-connector)
- Built for the Duco Connectivity Board 2.0 local REST API
