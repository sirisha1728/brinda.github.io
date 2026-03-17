# Apex Terminal — Options Intelligence Platform

A Skylit.ai-inspired options trading terminal with real-time data via Polygon.io.

## Features

- **FlowChain** — Full options chain with calls/puts, greeks (IV, delta, gamma), OI, volume, bid/ask. ITM/ATM highlighting, expiration switcher, DTE countdown.
- **FlowSeeker** — Live unusual options flow feed. Sweep/block/unusual badges, bull/bear sentiment, 8 filter chips. New alerts flash in real-time.
- **HeatSeeker** — GEX visualization showing Pika (yellow, pin/absorber) and Barney (purple, amplifier/explosion) nodes. King Node marks the strongest EOD magnet.
  - **⟁ Trinity Mode** — Full data table across 4 signal layers (GEX, Vanna/Charm, Delta Exposure, Net Flow) with composite score per strike.
- **Nexus AI** — Per-ticker signal cards with score, GEX bias bar, P/C ratio, IV rank, key levels.

## Quick Start

```bash
# Option 1: Open directly in browser (works for most features)
open index.html

# Option 2: Serve locally (recommended — avoids CORS on some browsers)
npx serve .
# or
python3 -m http.server 8080
# then open http://localhost:8080
```

## Connecting Live Data (Polygon.io)

1. Sign up free at [polygon.io/dashboard/signup](https://polygon.io/dashboard/signup)
2. Copy your API key from the dashboard
3. Paste it into the **API key** input in the top-right header
4. Click **Connect**

### What's Live vs Simulated

| Feature            | Free Tier (15-min delay) | Paid ($29/mo real-time) |
|--------------------|--------------------------|-------------------------|
| Options chain      | ✅ Live                  | ✅ Real-time             |
| Price / ticker bar | ✅ Live                  | ✅ Real-time             |
| Heatmap prices     | ✅ Live (snapshot)       | ✅ Real-time             |
| Flow scanner       | 🟡 Simulated             | Needs Unusual Activity endpoint |
| Nexus signals      | ✅ Score from live price | ✅ Score from live price |

Flow scanner shows simulated data on the free tier. For real unusual flow data, see [Unusual Whales API](https://unusualwhales.com/api) or Polygon's premium flow feed.

## File Structure

```
apex-terminal/
├── index.html          # Main entry point
├── README.md
├── css/
│   └── styles.css      # All styles, CSS variables, dark theme
└── js/
    ├── state.js        # App state, constants, MOCK_PRICES
    ├── utils.js        # Helper functions (fK, fM, toast, etc.)
    ├── mockData.js     # Mock chain, flow, heatmap, nexus data
    ├── api.js          # Polygon.io API fetchers + connectAPI()
    ├── chain.js        # FlowChain panel: prices, expirations, chain render
    ├── flow.js         # FlowSeeker panel: flow list, filters, tick
    ├── heatseeker.js   # HeatSeeker + Trinity Mode table render
    ├── nexus.js        # Nexus AI panel: signals, sidebar, detail cards
    └── app.js          # Panel switching, refreshAll(), init()
```

## Extending

### Add a new ticker to the bar
In `js/state.js`, add to `TICKERS` array. Then add a `.ticker-btn` in `index.html`.

### Add a real flow data source
In `js/flow.js`, replace `buildMockFlow()` with a fetch to your provider inside `renderFlow()` when `isLive === true`.

### Add a new HeatSeeker metric
In `js/heatseeker.js`, extend `buildTrinityData()` to compute your new field per node, then add a column group in `renderTrinity()`.

### Deploy
Drop the entire folder on any static host — Netlify, Vercel, GitHub Pages, Cloudflare Pages. No build step needed.

```bash
# Netlify drag-and-drop, or:
netlify deploy --dir . --prod
```

## Tech Stack

- Vanilla HTML/CSS/JS — no framework, no bundler
- IBM Plex Mono + IBM Plex Sans (Google Fonts)
- Polygon.io REST API for live options data
- Canvas API for HeatSeeker single-mode charts
- All data via `fetch()` — no dependencies

## License

MIT — use freely, attribution appreciated.
