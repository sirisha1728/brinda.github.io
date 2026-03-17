// ═══════════════════════════════════════════
//  API CONNECT
// ═══════════════════════════════════════════
async function connectAPI() {
  const inputKey = document.getElementById('apiKey').value.trim();
  if (inputKey) apiKey = inputKey; // allow override, else use default from state.js

  toast('Connecting to Polygon.io...');
  try {
    const resp = await fetch(`https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${apiKey}`);
    const d = await resp.json();
    if (d.status === 'OK' || (d.resultsCount > 0)) {
      isLive = true;
      setStatus('live');
      toast('Connected! Loading live data...', 'success');
      document.getElementById('apiKey').value = '';
      document.getElementById('apiKey').placeholder = 'Connected ✓';
      startPriceWS();     // real-time tick stream
      startFlowEngine();  // options flow stream
      await refreshAll();
      await refreshMarketStats();
    } else {
      throw new Error(d.error || 'Auth failed');
    }
  } catch(e) {
    isLive = false;
    setStatus('err');
    toast('Connection failed: ' + e.message, 'error');
  }
}

// Auto-connect on load with pre-set key
async function autoConnect() {
  if (!apiKey) return;
  try {
    const resp = await fetch(`https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${apiKey}`);
    const d = await resp.json();
    if (d.status === 'OK' || d.resultsCount > 0) {
      isLive = true;
      setStatus('live');
      document.getElementById('apiKey').placeholder = 'Connected ✓ (Polygon.io)';
      startPriceWS();
      startFlowEngine();
      await refreshAll();
      await refreshMarketStats();
    }
  } catch(e) {
    // silent fail – mock mode continues
  }
}

// ═══════════════════════════════════════════
//  POLYGON REST FETCHERS
// ═══════════════════════════════════════════
async function polyPrevClose(sym) {
  const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${apiKey}`);
  const d = await r.json();
  if (!d.results?.[0]) throw new Error('no data');
  const res = d.results[0];
  return { p: res.c, c: +(res.c - res.o).toFixed(2), pct: +((res.c - res.o) / res.o * 100).toFixed(2) };
}

async function polySnapshot(sym) {
  const r = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${apiKey}`);
  const d = await r.json();
  const t = d.ticker;
  if (!t) throw new Error('no snapshot');
  return {
    p:   +(t.lastTrade?.p || t.day?.c || t.prevDay?.c || 200).toFixed(2),
    c:   +(t.todaysChange || 0).toFixed(2),
    pct: +(t.todaysChangePerc || 0).toFixed(2),
    extPrice: t.lastTrade?.p || null,
    session: marketSession()
  };
}

async function polySnapshotAll(tickers) {
  const syms = tickers.join(',');
  const r = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${syms}&apiKey=${apiKey}`);
  const d = await r.json();
  const out = {};
  for (const t of d.tickers || []) {
    out[t.ticker] = {
      p:   +(t.lastTrade?.p || t.day?.c || t.prevDay?.c || 200).toFixed(2),
      c:   +(t.todaysChange || 0).toFixed(2),
      pct: +(t.todaysChangePerc || 0).toFixed(2)
    };
  }
  return out;
}

async function polyExpirations(sym) {
  const r = await fetch(`https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${sym}&limit=8&sort=expiration_date&order=asc&apiKey=${apiKey}`);
  const d = await r.json();
  return [...new Set((d.results || []).map(x => x.expiration_date))].slice(0, 7);
}

async function polyChain(sym, exp) {
  const price = (priceCache[sym] || MOCK_PRICES[sym] || { p: 200 }).p;
  const r = await fetch(`https://api.polygon.io/v3/snapshot/options/${sym}?expiration_date=${exp}&limit=250&apiKey=${apiKey}`);
  const d = await r.json();
  if (!d.results?.length) return null;
  const byStrike = {};
  for (const item of d.results) {
    const det = item.details || {}, gr = item.greeks || {}, day = item.day || {};
    const strike = det.strike_price;
    if (!strike) continue;
    if (!byStrike[strike]) byStrike[strike] = {
      strike, itm_c: strike < price, itm_p: strike > price,
      atm: Math.abs(strike - price) < price * 0.005, c: null, p: null
    };
    const side = det.contract_type === 'call' ? 'c' : 'p';
    byStrike[strike][side] = {
      iv:    +(item.implied_volatility || 0.25),
      delta: +(gr.delta || 0),
      gamma: +(gr.gamma || 0),
      oi:    item.open_interest || 0,
      vol:   day.volume || 0,
      bid:   +(item.last_quote?.bid || 0),
      ask:   +(item.last_quote?.ask || 0),
    };
  }
  const rows = Object.values(byStrike).sort((a, b) => a.strike - b.strike);
  rows.forEach(row => {
    if (!row.c) row.c = { iv: .25, delta: .5,  gamma: .01, oi: 0, vol: 0, bid: 0, ask: 0 };
    if (!row.p) row.p = { iv: .27, delta: -.5, gamma: .01, oi: 0, vol: 0, bid: 0, ask: 0 };
  });
  return rows;
}

// ── Fetch recent large options trades via REST (fallback / top-of-day scan) ──
async function polyFetchRecentOptionTrades(underlying, limit = 50) {
  // Get the top options contracts by volume for this underlying
  const snap = await fetch(
    `https://api.polygon.io/v3/snapshot/options/${underlying}?limit=50&sort=volume&order=desc&apiKey=${apiKey}`
  );
  const sd = await snap.json();
  const contracts = sd.results || [];
  const trades = [];

  for (const contract of contracts.slice(0, 10)) {
    const sym = contract.details?.ticker;
    if (!sym) continue;
    try {
      const tr = await fetch(
        `https://api.polygon.io/v3/trades/${sym}?limit=5&order=desc&sort=timestamp&apiKey=${apiKey}`
      );
      const td = await tr.json();
      for (const t of td.results || []) {
        const price    = t.price || 0;
        const size     = t.size  || 0;
        const premium  = price * size * 100;
        if (premium < MIN_PREMIUM) continue;

        const det    = contract.details || {};
        const parsed = parseOptionSymbol(sym);
        trades.push({
          id:      t.id || (sym + t.participant_timestamp),
          sym,
          underlying,
          type:    det.contract_type === 'call' ? 'C' : 'P',
          strike:  det.strike_price?.toString() || parsed.strike,
          exp:     fmtExpLabel(det.expiration_date || parsed.exp),
          price,
          size,
          premium,
          iv:      contract.implied_volatility || 0,
          oi:      contract.open_interest || 0,
          delta:   contract.greeks?.delta || 0,
          ts:      t.participant_timestamp || t.sip_timestamp || Date.now() * 1e6,
          conditions: t.conditions || [],
        });
      }
    } catch(e) { /* skip failed contract */ }
  }
  return trades;
}

// ── Market session helper ──
function marketSession() {
  const now  = new Date();
  const et   = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h    = et.getHours(), m = et.getMinutes();
  const mins = h * 60 + m;
  const day  = et.getDay();
  if (day === 0 || day === 6) return 'closed';
  if (mins >= 570 && mins < 960)  return 'market';   // 9:30–16:00
  if (mins >= 240 && mins < 570)  return 'pre';      // 04:00–9:30
  if (mins >= 960 && mins < 1200) return 'after';    // 16:00–20:00
  return 'closed';
}

// ── Parse OCC option symbol  O:AAPL250321C00210000 ──
function parseOptionSymbol(sym) {
  const clean = sym.replace('O:', '');
  const m = clean.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return { underlying: '', exp: '', type: '', strike: '' };
  return {
    underlying: m[1],
    exp:        `20${m[2]}-${m[3]}-${m[4]}`,
    type:       m[5],
    strike:     (parseInt(m[6]) / 1000).toString()
  };
}
