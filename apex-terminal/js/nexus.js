// ═══════════════════════════════════════════
//  NEXUS — LIVE SIGNAL ENGINE
// ═══════════════════════════════════════════

// Signal cache – refreshed from live data when connected
let nexusSignalCache = [];
let nexusLastRefresh = 0;

// ── Static baseline descriptions (enriched with live metrics at render time) ──
const NEXUS_TICKERS = ['NVDA','SPY','TSLA','MSFT','AAPL','QQQ','AMZN','META'];

// ── Build signals from live Polygon data ──
async function buildLiveNexusSignals() {
  const signals = [];
  for (const sym of NEXUS_TICKERS) {
    try {
      // 1. Price snapshot
      const snapR = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${apiKey}`);
      const snapD = await snapR.json();
      const snap  = snapD.ticker;
      if (!snap) continue;

      const sess      = marketSession();
      const prevClose = +(snap.prevDay?.c || 0).toFixed(2);
      const dayClose  = +(snap.day?.c    || 0).toFixed(2);
      const lastTrade = +(snap.lastTrade?.p || dayClose || prevClose).toFixed(2);
      const price     = lastTrade > 0 ? lastTrade : dayClose > 0 ? dayClose : prevClose;
      const pct       = prevClose > 0 ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0;
      const change    = +(price - prevClose).toFixed(2);
      // Update priceCache so all tabs see the latest price from Nexus's fetch
      priceCache[sym] = {
        p: price, c: change, pct,
        prevClose, extPrice: (sess === 'pre' || sess === 'after') ? lastTrade : null,
        session: sess, fetchedAt: Date.now(),
      };
      updateTickerBtn(sym, priceCache[sym]);
      const vol   = snap.day?.v || 0;
      const avgVol = snap.prevDay?.v || vol;  // rough proxy for avg vol

      // 2. Options snapshot (top contracts for PCR + IV rank)
      const optR = await fetch(`https://api.polygon.io/v3/snapshot/options/${sym}?limit=200&apiKey=${apiKey}`);
      const optD = await optR.json();
      const contracts = optD.results || [];

      let callOI = 0, putOI = 0, callVol = 0, putVol = 0;
      let ivSum = 0, ivCount = 0;
      let totalCallPrem = 0, totalPutPrem = 0;
      let maxGexStrike = null, maxGex = 0;

      for (const c of contracts) {
        const oi  = c.open_interest || 0;
        const dv  = c.day?.volume || 0;
        const iv  = c.implied_volatility || 0;
        const bid = c.last_quote?.bid || 0;
        const ask = c.last_quote?.ask || 0;
        const mid = (bid + ask) / 2;
        const prem = mid * dv * 100;
        const gamma = c.greeks?.gamma || 0;
        const gex = Math.abs(gamma * oi * 100 * price);

        if (c.details?.contract_type === 'call') {
          callOI  += oi; callVol += dv; totalCallPrem += prem;
        } else {
          putOI   += oi; putVol  += dv; totalPutPrem  += prem;
        }
        if (iv > 0) { ivSum += iv; ivCount++; }
        if (gex > maxGex) { maxGex = gex; maxGexStrike = c.details?.strike_price; }
      }

      const pcr     = callVol > 0 ? +(putVol / callVol).toFixed(2) : 1.0;
      const avgIV   = ivCount > 0 ? ivSum / ivCount : 0.25;
      const netFlow = totalCallPrem - totalPutPrem;
      const flowScore = Math.min(10, Math.max(0, 5 + netFlow / 200000)).toFixed(1);

      // IV Rank approximation (52-week range proxy using day range)
      // Real IV rank needs historical data; we approximate with a heuristic
      const ivRank = Math.round(Math.min(99, Math.max(1, avgIV * 300)));

      // GEX bias
      let gexBias = 'Flat';
      if (callOI > putOI * 1.3) gexBias = 'Positive';
      else if (putOI > callOI * 1.3) gexBias = 'Negative';
      else if (pcr < 0.7) gexBias = 'Bullish';
      else if (pcr > 1.3) gexBias = 'Bearish';

      // Signal score: composite of price momentum, flow, IV rank, PCR
      const mScore  = Math.min(30, Math.max(-30, pct * 8));       // momentum ±30
      const fScore  = Math.min(25, Math.max(-25, (1 - pcr) * 20)); // flow ±25
      const ivScore = ivRank > 60 ? -10 : ivRank < 30 ? 10 : 0;   // IV ±10
      const vScore  = vol > avgVol * 1.5 ? 5 : vol < avgVol * 0.5 ? -5 : 0; // volume ±5
      const raw     = 50 + mScore + fScore + ivScore + vScore;
      const score   = Math.round(Math.min(99, Math.max(1, raw)));

      let label, cls;
      if (score >= 72)      { label = 'Strongly Bullish'; cls = 'score-bull'; }
      else if (score >= 58) { label = 'Mildly Bullish';   cls = 'score-bull'; }
      else if (score >= 44) { label = 'Neutral / Watch';  cls = 'score-neu';  }
      else if (score >= 30) { label = 'Mildly Bearish';   cls = 'score-bear'; }
      else                  { label = 'Bearish';          cls = 'score-bear'; }

      // Build dynamic description
      const flowDir = netFlow > 0 ? 'bullish call premium dominates' : 'bearish put premium dominates';
      const pcrNote = pcr < 0.8 ? 'Low P/C ratio suggests call-heavy positioning.' : pcr > 1.2 ? 'High P/C signals elevated put buying.' : 'Balanced P/C ratio.';
      const ivNote  = ivRank > 65 ? 'IV elevated — premium selling favored.' : ivRank < 30 ? 'IV compressed — cheap to buy options.' : 'IV near median.';
      const gexNote = maxGexStrike ? `Largest GEX node at $${maxGexStrike}.` : '';

      const desc = `${pct >= 0 ? '+' : ''}${pct}% today. Net options flow ${flowDir} ($${(Math.abs(netFlow)/1000).toFixed(0)}K). ${pcrNote} ${ivNote} ${gexNote}`.trim();

      signals.push({
        ticker: sym, score, cls, label, desc,
        pcr, ivr: ivRank, gex: gexBias, flow: flowScore + '/10',
        price, pct, maxGexStrike,
        callPrem: totalCallPrem, putPrem: totalPutPrem,
      });

    } catch(e) {
      // Fallback: use price-only signal
      const pd = (priceCache[sym]?.p > 0) ? priceCache[sym] : (MOCK_PRICES[sym] || { p: 0, pct: 0 });
      const score = Math.round(Math.min(99, Math.max(1, 50 + pd.pct * 8)));
      signals.push({
        ticker: sym, score,
        cls:   score > 60 ? 'score-bull' : score < 40 ? 'score-bear' : 'score-neu',
        label: score > 60 ? 'Mildly Bullish' : score < 40 ? 'Mildly Bearish' : 'Neutral',
        desc:  `Price-only signal. ${pd.pct >= 0 ? '+' : ''}${(pd.pct||0).toFixed(2)}% today. Options data unavailable.`,
        pcr: 1.0, ivr: 45, gex: 'Flat', flow: '5.0/10',
        price: pd.p, pct: pd.pct || 0,
      });
    }
  }

  // Sort by signal conviction (distance from 50)
  signals.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));
  nexusSignalCache   = signals;
  nexusLastRefresh   = Date.now();
  return signals;
}

// ── Render sidebar ──
function renderNexusSidebar(signals) {
  const list = (signals && signals.length) ? signals : (nexusSignalCache.length ? nexusSignalCache : NEXUS_SIGNALS_FALLBACK);
  let html = '';
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const pd = (priceCache[s.ticker]?.p > 0) ? priceCache[s.ticker] : (MOCK_PRICES[s.ticker] || { p: 0, pct: 0 });
    const up = pd.pct >= 0;
    html += `<div class="nsig${i === nexusActive ? ' active' : ''}" onclick="setNexusActive(${i},this)">
      <div class="nsig-head">
        <span class="nsig-tick">${s.ticker}</span>
        <span class="nsig-score ${s.cls}">${s.label}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px">
        <span style="font-family:var(--mono);font-size:11px;color:var(--text1)">$${(pd.p||s.price||0).toFixed(2)}</span>
        <span style="font-family:var(--mono);font-size:10px" class="${up?'up':'dn'}">${up?'+':''}${(pd.pct||s.pct||0).toFixed(2)}%</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--text2)">${s.score}/100</span>
      </div>
    </div>`;
  }
  document.getElementById('nexusSigList').innerHTML = html;
}

function setNexusActive(i, el) {
  nexusActive = i;
  document.querySelectorAll('.nsig').forEach(e => e.classList.remove('active'));
  if (el) el.classList.add('active');
  renderNexusMain();
}

// ── Render main detail card ──
function renderNexusMain() {
  const signals = nexusSignalCache.length ? nexusSignalCache : NEXUS_SIGNALS_FALLBACK;
  if (!signals.length) return;
  const s  = signals[Math.min(nexusActive, signals.length - 1)];
  // Use the freshest price — cache is kept live by refreshPrices + warmCache
  const pd = (priceCache[s.ticker]?.p > 0) ? priceCache[s.ticker]
           : (MOCK_PRICES[s.ticker] || { p: 0, c: 0, pct: 0 });
  const up = pd.pct >= 0;

  const gexW = { Bullish:78, Positive:63, Flat:50, Negative:32, Bearish:18 }[s.gex] || 50;
  const gexC = (s.gex === 'Bullish' || s.gex === 'Positive') ? 'var(--green)' : s.gex === 'Flat' ? 'var(--amber)' : 'var(--red)';

  // Key levels from GEX
  const p = pd.p || s.price || 200;
  const step = p < 100 ? 1 : p < 300 ? 5 : p < 700 ? 10 : 25;
  const kingNode   = s.maxGexStrike || +(p * 1.012).toFixed(0);
  const pinLevel   = +(Math.round(p / step) * step).toFixed(0);
  const expZone    = +(p * 0.985).toFixed(0);
  const gammaFlip  = +(p * 0.993).toFixed(0);

  // Flow breakdown bars
  const totalPrem = (s.callPrem || 0) + (s.putPrem || 0);
  const callPct   = totalPrem > 0 ? Math.round((s.callPrem || 0) / totalPrem * 100) : 50;
  const putPct    = 100 - callPct;

  // Last refresh time
  const refreshAge = nexusLastRefresh ? Math.round((Date.now() - nexusLastRefresh) / 1000) : null;
  const refreshNote = refreshAge !== null
    ? `Refreshed ${refreshAge}s ago · ${isLive ? 'Live · Polygon.io' : 'Simulated'}`
    : 'Simulated data';

  document.getElementById('nexusMain').innerHTML = `
    <!-- Score card -->
    <div class="ncard">
      <div class="ncard-head">
        <span class="ncard-title">${s.ticker} — ${s.label}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="nsig-score ${s.cls}">${s.score}/100</span>
          <button style="background:transparent;border:1px solid var(--border2);color:var(--accent);font-family:var(--mono);font-size:10px;padding:2px 8px;border-radius:3px;cursor:pointer" onclick="refreshNexus()">↻ Refresh</button>
        </div>
      </div>
      <div class="ncard-body">
        <div class="metric-grid">
          <div class="metric"><div class="metric-label">Price</div><div class="metric-val">$${(pd.p||p).toFixed(2)}</div></div>
          <div class="metric"><div class="metric-label">Change</div><div class="metric-val ${up?'up':'dn'}">${up?'+':''}${(pd.pct||s.pct||0).toFixed(2)}%</div></div>
          <div class="metric"><div class="metric-label">IV Rank</div><div class="metric-val ${s.ivr>65?'dn':s.ivr<30?'up':''}">${s.ivr}%</div></div>
          <div class="metric"><div class="metric-label">P/C Ratio</div><div class="metric-val ${s.pcr>1?'dn':'up'}">${s.pcr}</div></div>
        </div>
        <!-- GEX bar -->
        <div class="gex-bar-wrap">
          <div class="gex-label-row"><span>GEX Dealer Bias</span><span style="color:${gexC}">${s.gex}</span></div>
          <div class="gex-bar-track"><div class="gex-bar-fill" style="width:${gexW}%;background:${gexC};transition:width .8s ease"></div></div>
        </div>
        <!-- Flow breakdown -->
        <div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;font-size:10px;font-family:var(--mono);color:var(--text2);margin-bottom:5px">
            <span>Call Premium ${callPct}%</span>
            <span>Flow Score: <span class="${s.score>60?'up':s.score<40?'dn':''}">${s.flow}</span></span>
            <span>Put Premium ${putPct}%</span>
          </div>
          <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;display:flex">
            <div style="width:${callPct}%;background:rgba(0,212,255,.6);border-radius:4px 0 0 4px;transition:width .8s"></div>
            <div style="width:${putPct}%;background:rgba(255,69,96,.6);border-radius:0 4px 4px 0"></div>
          </div>
        </div>
        <div class="pcr-row">
          <span class="pcr-label">Signal</span>
          <span class="pcr-val">${s.score>75?'Strong':s.score>55?'Moderate':'Weak'}</span>
          <span class="pcr-label" style="margin-left:20px">Conviction</span>
          <span class="pcr-val">${Math.abs(s.score-50)>25?'High':Math.abs(s.score-50)>12?'Medium':'Low'}</span>
        </div>
      </div>
    </div>

    <!-- Analysis -->
    <div class="ncard">
      <div class="ncard-head"><span class="ncard-title">AI Analysis</span></div>
      <div class="ncard-body">
        <p style="font-size:12px;color:var(--text1);line-height:1.75">${s.desc}</p>
        <p style="font-size:10px;color:var(--text2);margin-top:10px;font-family:var(--mono)">${refreshNote} · Not financial advice.</p>
      </div>
    </div>

    <!-- Key Levels -->
    <div class="ncard">
      <div class="ncard-head"><span class="ncard-title">Key Levels · HeatSeeker</span></div>
      <div class="ncard-body">
        <div class="metric-grid">
          <div class="metric"><div class="metric-label">King Node</div><div class="metric-val" style="color:var(--yellow)">${kingNode}</div></div>
          <div class="metric"><div class="metric-label">Primary Pin</div><div class="metric-val" style="color:var(--yellow)">${pinLevel}</div></div>
          <div class="metric"><div class="metric-label">Expl. Zone</div><div class="metric-val" style="color:var(--purple)">${expZone}</div></div>
          <div class="metric"><div class="metric-label">Gamma Flip</div><div class="metric-val">${gammaFlip}</div></div>
        </div>
        <p style="font-size:10px;color:var(--text2);font-family:var(--mono);margin-top:10px">
          Yellow = Pika (pin zone) · Purple = Barney (explosion zone) · Gamma Flip = dealer positioning reversal level
        </p>
      </div>
    </div>

    <!-- Market Context -->
    <div class="ncard">
      <div class="ncard-head"><span class="ncard-title">Market Context</span></div>
      <div class="ncard-body">
        <div class="metric-grid">
          <div class="metric"><div class="metric-label">Session</div><div class="metric-val" style="font-size:12px">${sessionLabel()}</div></div>
          <div class="metric"><div class="metric-label">VIX</div><div class="metric-val" id="nexus-vix">${document.getElementById('vix-val')?.textContent || '—'}</div></div>
          <div class="metric"><div class="metric-label">SPY P/C</div><div class="metric-val" id="nexus-pcr">${document.getElementById('pcr-val')?.textContent || '—'}</div></div>
          <div class="metric"><div class="metric-label">Flow Count</div><div class="metric-val">${allFlowData.length}</div></div>
        </div>
      </div>
    </div>`;
}

function sessionLabel() {
  const s = marketSession();
  return { market:'🟢 Open', pre:'🟡 Pre-Mkt', after:'🔵 After-Hrs', closed:'⚫ Closed' }[s] || '—';
}

// ── Full nexus refresh (re-fetches live data) ──
async function refreshNexus() {
  const main = document.getElementById('nexusMain');
  if (main) main.innerHTML = '<div class="loader">Refreshing signals from live data...</div>';
  const signals = isLive ? await buildLiveNexusSignals() : NEXUS_SIGNALS_FALLBACK;
  renderNexusSidebar(signals);
  renderNexusMain();
}

// ── Fallback static signals (used when offline) ──
const NEXUS_SIGNALS_FALLBACK = [
  { ticker:'NVDA', score:87, cls:'score-bull', label:'Strongly Bullish',
    desc:'Unusual call sweep at $900 strike across 3 exchanges. $2.4M premium in 30min. IV rank 68th pct. Gamma skew bullish.',
    pcr:.41, ivr:68, gex:'Bullish', flow:'8.7/10', price:875.20, pct:2.16 },
  { ticker:'SPY',  score:34, cls:'score-bear', label:'Cautiously Bearish',
    desc:'Large 550P block signals institutional hedging. VIX term structure flattening. Gamma flip at 558.',
    pcr:1.28, ivr:44, gex:'Negative', flow:'3.2/10', price:562.10, pct:.51 },
  { ticker:'TSLA', score:22, cls:'score-bear', label:'Bearish',
    desc:'Put sweep at 180 strike. Elevated short interest. Stock below 20-day MA. Options pricing 4.8% move.',
    pcr:1.55, ivr:72, gex:'Negative', flow:'2.8/10', price:183.60, pct:-2.24 },
  { ticker:'MSFT', score:55, cls:'score-neu',  label:'Neutral / Watch',
    desc:'Mixed signals: 425C buying offset by 415P activity. IV subdued near ATH. Watching for breakout.',
    pcr:.88, ivr:31, gex:'Flat', flow:'5.5/10', price:418.75, pct:-.45 },
  { ticker:'AAPL', score:61, cls:'score-bull', label:'Mildly Bullish',
    desc:'Steady call flow on 215-220 strikes. Low IV rank suggests cheap premium. Dealer gamma positive above 210.',
    pcr:.72, ivr:28, gex:'Positive', flow:'6.1/10', price:212.45, pct:.58 },
  { ticker:'QQQ',  score:58, cls:'score-bull', label:'Mildly Bullish',
    desc:'Tech macro tailwind. 485C sweeps detected. Gamma exposure 480-490 range acts as support.',
    pcr:.76, ivr:35, gex:'Positive', flow:'5.8/10', price:478.35, pct:.67 },
];
