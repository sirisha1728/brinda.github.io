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
Now I can see every bug clearly. Let me map them all out before writing a single line of code:
GEX sign is inverted. Real dealer GEX: when dealers are short calls (most common), they are long gamma on those calls — they buy the underlying as price falls and sell as it rises, which absorbs volatility → Pika (pin). The formula callGex = +gamma * OI is correct for that. But the current code flips it: callGex = +(gamma), putGex = -(gamma) and then labels gex < 0 as Pika. That's backwards — a net positive GEX (dealers long gamma overall) is the pin/absorber. Fix: gex > 0 = Pika, gex < 0 = Barney.
Vanna sign is wrong. Current code: callVanna = +delta * iv * oi, putVanna = +delta * iv * oi (put delta is negative so it naturally subtracts). But the actual dealer Vanna exposure from the dealer's perspective is the opposite of the customer's. Dealers are short the options customers bought, so dealer vanna = -(customer vanna). A positive customer vanna at OTM calls means dealers have negative vanna there — when IV rises they need to sell stock. Fix: negate the sign, and use the correct formula vanna ≈ delta * (1 - |delta|) * sqrt(T) * OI (simplified).
Charm sign is wrong for the same reason — dealer charm is opposite to customer charm.
DEX sign is wrong. Current: callDex = -(delta) * OI (dealer short calls, negative delta). But for hedging, a dealer who is short a call with delta 0.5 needs to buy 0.5 shares (positive hedge), not sell. So dealer DEX from calls = +delta * OI * 100. Fix: callDex = +(c.delta) * (c.oi) * 100, putDex = +(p.delta) * (p.oi) * 100 (put delta already negative, so this naturally shows negative DEX for put-heavy strikes = dealers need to sell stock).
Composite GEX sign is inverted — gN = -n.gex / maxG was compensating for the wrong GEX sign. Once GEX is fixed, gN = +n.gex / maxG (positive GEX = Pika = bullish stabiliser).
Vanna/Charm color logic is backwards — currently vanna >= 0 → blue (bullish). After the sign fix this flips correctly.Ran 2 commandsRan 2 commandsNow fix the single-panel HeatSeeker canvas — it also uses gex < 0 for Pika color which is now wrong:Ran 2 commands, edited a fileRan 2 commands, edited a fileAlso fix the Y-axis label order on the canvas (Pika is now positive = bars go UP, Barney is negative = bars go DOWN):Fix canvas Y-axis labels to match corrected sign conventionFix canvas Y-axis labels to match corrected sign conventionNow verify all the sign logic is internally consistent end-to-end:Verify all sign fixes are consistentVerify all sign fixes are consistentAll 11 checks clean. Package and deliver:Ran a command, read a fileRan a command, read a fileEvery metric was computing the wrong sign. Here's the full breakdown of what was wrong and why:
GEX (Gamma Exposure)
The old code had putGex = -(gamma × OI), making puts subtract from calls, which accidentally produced negative net GEX near ATM and labeled it Pika. But positive net GEX = dealers net long gamma = they absorb volatility = Pika. Fix: gex = callGex − putGex (subtracting put contribution since put delta moves opposite to calls), then gex ≥ 0 → Pika, gex < 0 → Barney.
Vanna
Old code used customer vanna (+delta × IV × OI). But dealers are short the options, so their vanna is the opposite. Dealer vanna = −callVanna − putVanna. A positive dealer vanna means when IV rises, dealers must buy stock → bullish pressure. The old formula had this backwards.
Charm
Same issue — dealer charm is opposite to customer charm. Old code had +callCharm + putCharm. Fixed to −callCharm + putCharm (short call charm is negative = dealer must sell as time passes at ATM; short put charm is positive = dealer must buy).
DEX (Delta Exposure)
Old code: callDex = −(delta × OI) thinking dealers were short and needed to negate. Wrong — a dealer short a 0.5-delta call holds +0.5 shares as their hedge (they buy stock to stay delta neutral). Fixed to (c.delta × c.oi + p.delta × p.oi) × 100 — call delta is naturally positive, put delta is naturally negative, signs come out correctly without manual negation.
Composite score
Had gN = −gex / maxGex compensating for the old wrong sign. Now gN = +gex / maxGex — positive GEX = bullish leaning = positive composite contribution.
