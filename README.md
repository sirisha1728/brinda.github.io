apex-terminal/
├── index.html          ← open this in browser
├── README.md           ← setup + deploy guide
├── css/
│   └── styles.css      ← all styles, CSS variables, dark theme
└── js/
    ├── state.js        ← app state, constants, MOCK_PRICES
    ├── utils.js        ← helpers (fK, fM, toast, formatters)
    ├── mockData.js     ← mock chain, flow, heatmap, nexus data
    ├── api.js          ← Polygon.io fetchers + connectAPI()
    ├── chain.js        ← FlowChain panel
    ├── flow.js         ← FlowSeeker panel
    ├── heatseeker.js   ← HeatSeeker + Trinity Mode table
    ├── nexus.js        ← Nexus AI panel
    └── app.js          ← panel switching + init loop
To run it:
bash# Simplest — just open in browser:
open index.html

# Or serve locally (avoids CORS issues):
python3 -m http.server 8080
# → http://localhost:8080
To deploy: drag the folder onto Netlify, Vercel, or GitHub Pages — no build step, no dependencies.Apex terminalZIP Open in Archive Utility
