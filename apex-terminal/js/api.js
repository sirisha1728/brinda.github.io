// ═══════════════════════════════════════════
//  API KEY & CONNECTION
// ═══════════════════════════════════════════
async function connectAPI() {
  const inputKey = document.getElementById('apiKey').value.trim();
  if (inputKey) apiKey = inputKey;
  toast('Connecting to Polygon.io...');
  try {
    const resp = await fetch(`https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${apiKey}`);
    const d    = await resp.json();
    if (d.status === 'OK' || d.resultsCount > 0) {
      isLive = true;
      setStatus('live');
      document.getElementById('apiKey').value       = '';
      document.getElementById('apiKey').placeholder = 'Connected ✓';
      await warmCache();          // fetch all live prices before anything renders
      startPriceWS();
      startFlowEngine();
      await refreshAll();
      await refreshMarketStats();
      toast('Live data loaded ✓', 'success');
    } else {
      throw new Error(d.error || 'Auth failed');
    }
  } catch(e) {
    isLive = false; setStatus('err');
    toast('Connection failed: ' + e.message, 'error');
  }
}

async function autoConnect() {
  if (!apiKey) return;
  try {
    const resp = await fetch(`https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${apiKey}`);
    const d    = await resp.json();
    if (d.status === 'OK' || d.resultsCount > 0) {
      isLive = true;
      setStatus('live');
      document.getElementById('apiKey').placeholder = 'Connected ✓ (Polygon.io)';
      await warmCache();          // fill priceCache with real data before any render
      startPriceWS();
      startFlowEngine();
      await refreshAll();
      await refreshMarketStats();
    }
  } catch(e) { /* silent – mock mode */ }
}

// ═══════════════════════════════════════════
//  CACHE WARMING — fills priceCache before any panel renders
// ═══════════════════════════════════════════
async function warmCache() {
  const allSyms = [...new Set([
    ...TICKERS.filter(t => t !== 'SPX'),
    ...HEAT_TICKERS.filter(t => t !== 'SPX')
  ])];
  try {
    const snap = await polySnapshotAll(allSyms);
    // polySnapshotAll now stores prevClose too
    for (const [sym, pd] of Object.entries(snap)) {
      priceCache[sym] = pd;
      updateTickerBtn(sym, pd);
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════
//  POLYGON REST FETCHERS
// ═══════════════════════════════════════════

// Single ticker snapshot — full detail including extended hours + prevClose
async function getExtendedQuote(sym) {
  const r = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${apiKey}`);
  const d = await r.json();
  const t = d.ticker;
  if (!t) throw new Error('no snapshot for ' + sym);

  const session   = marketSession();
  const prevClose = +(t.prevDay?.c || 0).toFixed(2);
  const dayClose  = +(t.day?.c    || 0).toFixed(2);
  const lastTrade = +(t.lastTrade?.p || dayClose || prevClose).toFixed(2);

  // During market hours use day price; pre/after use lastTrade (most recent print)
  const price = lastTrade > 0 ? lastTrade : dayClose > 0 ? dayClose : prevClose;

  const change    = prevClose > 0 ? +(price - prevClose).toFixed(2)               : 0;
  const changePct = prevClose > 0 ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0;

  return {
    p:         price,
    c:         change,
    pct:       changePct,
    prevClose,
    open:      +(t.day?.o  || 0).toFixed(2),
    high:      +(t.day?.h  || 0).toFixed(2),
    low:       +(t.day?.l  || 0).toFixed(2),
    vol:       t.day?.v    || 0,
    vwap:      +(t.day?.vw || 0).toFixed(2),
    extPrice:  (session === 'pre' || session === 'after') ? lastTrade : null,
    session,
    fetchedAt: Date.now(),
  };
}

// Bulk snapshot — all tickers in one call, stores prevClose for WS baseline
async function polySnapshotAll(tickers) {
  const syms = tickers.join(',');
  const r    = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${syms}&apiKey=${apiKey}`);
  const d    = await r.json();
  const out  = {};
  const sess = marketSession();
  for (const t of d.tickers || []) {
    const prevClose = +(t.prevDay?.c || 0).toFixed(2);
    const dayClose  = +(t.day?.c    || 0).toFixed(2);
    const lastTrade = +(t.lastTrade?.p || dayClose || prevClose).toFixed(2);
    const price     = lastTrade > 0 ? lastTrade : dayClose > 0 ? dayClose : prevClose;
    const change    = prevClose > 0 ? +(price - prevClose).toFixed(2) : 0;
    const changePct = prevClose > 0 ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0;
    out[t.ticker] = {
      p: price, c: change, pct: changePct,
      prevClose,
      extPrice:  (sess === 'pre' || sess === 'after') ? lastTrade : null,
      session:   sess,
      fetchedAt: Date.now(),
    };
  }
  return out;
}

async function polyPrevClose(sym) {
  const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${apiKey}`);
  const d = await r.json();
  if (!d.results?.[0]) throw new Error('no data for ' + sym);
  const res       = d.results[0];
  const prevClose = +res.o.toFixed(2);
  const price     = +res.c.toFixed(2);
  return {
    p: price, c: +(price - prevClose).toFixed(2),
    pct: +((price - prevClose) / prevClose * 100).toFixed(2),
    prevClose, fetchedAt: Date.now(),
  };
}

async function polyExpirations(sym) {
  const r = await fetch(`https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${sym}&limit=8&sort=expiration_date&order=asc&apiKey=${apiKey}`);
  const d = await r.json();
  return [...new Set((d.results || []).map(x => x.expiration_date))].slice(0, 7);
}

async function polyChain(sym, exp) {
  // Always use fresh price from cache (warmCache/refreshPrices keeps it current)
  const cached = priceCache[sym];
  const price  = (cached?.p > 0) ? cached.p : (MOCK_PRICES[sym]?.p || 200);

  const r = await fetch(`https://api.polygon.io/v3/snapshot/options/${sym}?expiration_date=${exp}&limit=250&apiKey=${apiKey}`);
  const d = await r.json();
  if (!d.results?.length) return null;

  const byStrike = {};
  for (const item of d.results) {
    const det    = item.details || {};
    const gr     = item.greeks || {};
    const day    = item.day    || {};
    const strike = det.strike_price;
    if (!strike) continue;
    if (!byStrike[strike]) byStrike[strike] = {
      strike,
      itm_c: strike < price,
      itm_p: strike > price,
      atm:   Math.abs(strike - price) < price * 0.005,
      c: null, p: null,
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
    if (!row.c) row.c = { iv:.25, delta:.5,  gamma:.01, oi:0, vol:0, bid:0, ask:0 };
    if (!row.p) row.p = { iv:.27, delta:-.5, gamma:.01, oi:0, vol:0, bid:0, ask:0 };
  });
  return rows;
}

// Flow trades — top-volume contracts for a given underlying
async function polyFetchRecentOptionTrades(underlying, limit = 50) {
  const snap = await fetch(
    `https://api.polygon.io/v3/snapshot/options/${underlying}?limit=50&sort=volume&order=desc&apiKey=${apiKey}`
  );
  const sd        = await snap.json();
  const contracts = sd.results || [];
  const trades    = [];

  for (const contract of contracts.slice(0, 10)) {
    const sym = contract.details?.ticker;
    if (!sym) continue;
    try {
      const tr = await fetch(
        `https://api.polygon.io/v3/trades/${sym}?limit=5&order=desc&sort=timestamp&apiKey=${apiKey}`
      );
      const td = await tr.json();
      for (const t of td.results || []) {
        const price   = t.price || 0;
        const size    = t.size  || 0;
        const premium = price * size * 100;
        if (premium < MIN_PREMIUM) continue;
        const det    = contract.details || {};
        const parsed = parseOptionSymbol(sym);
        trades.push({
          id:         t.id || (sym + t.participant_timestamp),
          sym,
          underlying,
          type:       det.contract_type === 'call' ? 'C' : 'P',
          strike:     det.strike_price?.toString() || parsed.strike,
          exp:        fmtExpLabel(det.expiration_date || parsed.exp),
          price, size, premium,
          iv:         contract.implied_volatility || 0,
          oi:         contract.open_interest      || 0,
          delta:      contract.greeks?.delta      || 0,
          ts:         t.participant_timestamp || t.sip_timestamp || Date.now() * 1e6,
          conditions: t.conditions || [],
        });
      }
    } catch(e) {}
  }
  return trades;
}

// ═══════════════════════════════════════════
//  MARKET SESSION
// ═══════════════════════════════════════════
function marketSession() {
  const now  = new Date();
  const et   = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mins = et.getHours() * 60 + et.getMinutes();
  const day  = et.getDay();
  if (day === 0 || day === 6) return 'closed';
  if (mins >= 570 && mins < 960)  return 'market';  // 9:30–16:00
  if (mins >= 240 && mins < 570)  return 'pre';     // 04:00–9:30
  if (mins >= 960 && mins < 1200) return 'after';   // 16:00–20:00
  return 'closed';
}

// ── Parse OCC option symbol  e.g. O:AAPL250321C00210000 ──
function parseOptionSymbol(sym) {
  const clean = sym.replace('O:', '');
  const m = clean.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return { underlying: '', exp: '', type: '', strike: '' };
  return {
    underlying: m[1],
    exp:        `20${m[2]}-${m[3]}-${m[4]}`,
    type:       m[5],
    strike:     (parseInt(m[6]) / 1000).toString(),
  };
}
