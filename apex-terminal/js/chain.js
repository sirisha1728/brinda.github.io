// ═══════════════════════════════════════════
//  PRICE WEBSOCKET (real-time ticks)
// ═══════════════════════════════════════════
let priceWS = null;
let priceWSRetries = 0;

function startPriceWS() {
  if (priceWS) { priceWS.close(); priceWS = null; }
  if (!isLive) return;

  try {
    priceWS = new WebSocket('wss://socket.polygon.io/stocks');
    priceWS.onopen = () => {
      priceWS.send(JSON.stringify({ action: 'auth', params: apiKey }));
    };
    priceWS.onmessage = (msg) => {
      let events; try { events = JSON.parse(msg.data); } catch(e) { return; }
      for (const ev of events) {
        if (ev.ev === 'status' && ev.status === 'auth_success') {
          // Subscribe to all ticker bar + heat tickers for complete live coverage
          const wsSyms = [...new Set([
            ...TICKERS.filter(t => t !== 'SPX'),
            ...HEAT_TICKERS.filter(t => t !== 'SPX'),
          ])];
          const subs = wsSyms.map(t => `T.${t}`).join(',');
          priceWS.send(JSON.stringify({ action: 'subscribe', params: subs }));
          priceWSRetries = 0;
        }
        // Trade tick
        if (ev.ev === 'T' && ev.sym) {
          const sym = ev.sym;
          const p   = ev.p;
          if (priceCache[sym] && Math.abs(p - priceCache[sym].p) < 0.001) continue;
          // Use real prevClose from cache (set by warmCache/refreshPrices), not mock
          const prevClose = priceCache[sym]?.prevClose || priceCache[sym]?.p || p;
          priceCache[sym] = {
            ...( priceCache[sym] || {} ),
            p,
            c:         +(p - prevClose).toFixed(2),
            pct:       prevClose > 0 ? +((p - prevClose) / prevClose * 100).toFixed(2) : 0,
            prevClose, // preserve real prevClose for subsequent ticks
            fetchedAt: Date.now(),
          };
          updateTickerBtn(sym, priceCache[sym]);
          // Flash the ticker
          const btn = document.querySelector(`.ticker-btn[data-sym="${sym}"]`);
          if (btn) { btn.classList.add('tick-flash'); setTimeout(() => btn.classList.remove('tick-flash'), 400); }
          // Update chain if this is the active ticker
          if (sym === curTicker) {
            document.getElementById('tb-price-' + sym).classList.add('tick-flash');
            setTimeout(() => document.getElementById('tb-price-' + sym)?.classList.remove('tick-flash'), 400);
          }
        }
        // Quote (bid/ask spread)
        if (ev.ev === 'Q' && ev.sym) {
          const sym = ev.sym;
          if (!priceCache[sym]) return;
          priceCache[sym].bid = ev.bp;
          priceCache[sym].ask = ev.ap;
          priceCache[sym].spread = +(ev.ap - ev.bp).toFixed(3);
        }
      }
    };
    priceWS.onerror = () => {};
    priceWS.onclose = () => {
      priceWS = null;
      priceWSRetries++;
      if (isLive && priceWSRetries < 5) {
        setTimeout(startPriceWS, Math.min(30000, 3000 * priceWSRetries));
      }
    };
  } catch(e) {}
}

// ═══════════════════════════════════════════
//  EXTENDED HOURS QUOTES
// ═══════════════════════════════════════════
async function getExtendedQuote(sym) {
  // Polygon snapshot includes extended hours last trade price
  const r = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${apiKey}`);
  const d = await r.json();
  const t = d.ticker;
  if (!t) throw new Error('no data');

  const session = marketSession();
  const dayClose  = t.day?.c || t.prevDay?.c || 0;
  const lastTrade = t.lastTrade?.p || dayClose;
  const extPrice  = (session === 'pre' || session === 'after') ? lastTrade : null;

  return {
    p:         +(lastTrade).toFixed(2),
    c:         +(t.todaysChange || 0).toFixed(2),
    pct:       +(t.todaysChangePerc || 0).toFixed(2),
    extPrice:  extPrice ? +extPrice.toFixed(2) : null,
    prevClose: +(t.prevDay?.c || dayClose).toFixed(2),
    open:      +(t.day?.o || 0).toFixed(2),
    high:      +(t.day?.h || 0).toFixed(2),
    low:       +(t.day?.l || 0).toFixed(2),
    vol:       t.day?.v || 0,
    vwap:      +(t.day?.vw || 0).toFixed(2),
    session,
  };
}

// ── Live VIX and Put/Call Ratio ──
async function refreshMarketStats() {
  if (!isLive) return;
  try {
    // VIX via aggs
    const vr = await fetch(`https://api.polygon.io/v2/aggs/ticker/I:VIX/prev?apiKey=${apiKey}`);
    const vd = await vr.json();
    const vix = vd.results?.[0]?.c;
    if (vix) {
      const el = document.getElementById('vix-val');
      if (el) { el.textContent = vix.toFixed(2); el.className = 'ms-val ' + (vix > 20 ? 'dn' : 'up'); }
    }
  } catch(e) {}

  try {
    // SPY put/call ratio from options snapshot aggregate
    const pr = await fetch(`https://api.polygon.io/v3/snapshot/options/SPY?limit=250&apiKey=${apiKey}`);
    const pd = await pr.json();
    const contracts = pd.results || [];
    let callVol = 0, putVol = 0;
    for (const c of contracts) {
      const vol = c.day?.volume || 0;
      if (c.details?.contract_type === 'call') callVol += vol;
      else putVol += vol;
    }
    if (callVol > 0) {
      const pcr = (putVol / callVol).toFixed(2);
      const el = document.getElementById('pcr-val');
      if (el) { el.textContent = pcr; el.className = 'ms-val ' + (parseFloat(pcr) > 1 ? 'dn' : 'up'); }
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════
//  TICKER & PRICE
// ═══════════════════════════════════════════
async function getPrice(sym) {
  if (isLive) {
    try { return await getExtendedQuote(sym); } catch(e) {}
    try { return await polyPrevClose(sym); } catch(e) {}
  }
  return MOCK_PRICES[sym] || { p: 200, c: 0, pct: 0 };
}

async function setTicker(sym, btn) {
  curTicker = sym; curExp = '';
  document.querySelectorAll('.ticker-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const pd = await getPrice(sym);
  priceCache[sym] = pd;
  updateTickerBtn(sym, pd);
  const activePanel = document.querySelector('.panel.active').id.replace('panel-', '');
  if (activePanel === 'chain') await renderChain();
  if (activePanel === 'depth') await renderDepth();
}

// ═══════════════════════════════════════════
//  CHAIN
// ═══════════════════════════════════════════
async function renderChain() {
  document.getElementById('chainBody').innerHTML = '<tr><td colspan="13" class="loader">Loading options chain...</td></tr>';
  document.getElementById('chainErr').innerHTML = '';
  try {
    // Always fetch fresh price when rendering chain — stale cache = wrong ATM row
    const pd = await getPrice(curTicker);
    priceCache[curTicker] = pd;

    let exps;
    if (isLive) { try { exps = await getExpirations(curTicker); } catch(e) { exps = mockExps(curTicker); } }
    else exps = mockExps(curTicker);
    if (!exps.length) exps = mockExps(curTicker);

    if (!curExp || !exps.includes(curExp)) curExp = exps[0];
    renderExpButtons(exps);

    let rows;
    if (isLive) { try { rows = await getChain(curTicker, curExp); } catch(e) { rows = null; } }
    if (!rows || !rows.length) rows = mockChain(curTicker, curExp);

    document.getElementById('chainSource').textContent = isLive ? 'live · polygon.io' : 'simulated data';
    renderDTE();

    // Extended hours indicator
    const sess = pd.session || marketSession();
    if (sess !== 'market' && pd.extPrice) {
      const extPct = pd.prevClose > 0 ? ((pd.extPrice - pd.prevClose) / pd.prevClose * 100).toFixed(2) : '0.00';
      const extUp  = parseFloat(extPct) >= 0;
      document.getElementById('chainErr').innerHTML = `
        <div style="background:rgba(0,212,255,.07);border-bottom:1px solid rgba(0,212,255,.15);padding:5px 16px;font-size:11px;font-family:var(--mono);display:flex;gap:16px;align-items:center">
          <span style="color:var(--accent)">● ${sess === 'pre' ? 'Pre-Market' : 'After Hours'}</span>
          <span>Last: <strong>$${pd.extPrice}</strong></span>
          <span class="${extUp ? 'up' : 'dn'}">${extUp ? '+' : ''}${extPct}% vs prev close</span>
          <span style="color:var(--text2)">Prev close: $${pd.prevClose}</span>
        </div>`;
    }

    let html = '';
    for (const row of rows) {
      const c = row.c, p = row.p;
      // Highlight unusual volume
      const cVolFlag = c.oi > 0 && c.vol / c.oi > 0.5;
      const pVolFlag = p.oi > 0 && p.vol / p.oi > 0.5;
      html += `<tr class="${row.itm_c ? 'itm-c' : ''} ${row.itm_p ? 'itm-p' : ''}">
        <td class="cs dim">${(c.iv * 100).toFixed(1)}%</td>
        <td class="cs ${c.delta > .5 ? 'up' : 'dim'}">${fP(c.delta)}</td>
        <td class="cs dim2">${fP(c.gamma, 4)}</td>
        <td class="cs dim">${fK(c.oi)}</td>
        <td class="cs ${cVolFlag ? 'up' : c.vol > c.oi * .15 ? 'up' : 'dim'}" ${cVolFlag ? 'style="font-weight:600"' : ''}>${fK(c.vol)}</td>
        <td class="cs dim">${fP(c.bid)} / ${fP(c.ask)}</td>
        <td class="str ${row.atm ? 'atm' : ''}">${row.strike}</td>
        <td class="ps dim">${fP(p.bid)} / ${fP(p.ask)}</td>
        <td class="ps ${pVolFlag ? 'dn' : p.vol > p.oi * .15 ? 'dn' : 'dim'}" ${pVolFlag ? 'style="font-weight:600"' : ''}>${fK(p.vol)}</td>
        <td class="ps dim">${fK(p.oi)}</td>
        <td class="ps dim2">${fP(p.gamma, 4)}</td>
        <td class="ps ${p.delta < -.5 ? 'dn' : 'dim'}">${fP(p.delta)}</td>
        <td class="ps dim">${(p.iv * 100).toFixed(1)}%</td>
      </tr>`;
    }
    document.getElementById('chainBody').innerHTML = html;
  } catch(e) {
    document.getElementById('chainErr').innerHTML = `<div class="err-bar">Error: ${e.message}. Showing simulated data.</div>`;
    const rows = mockChain(curTicker, mockExps(curTicker)[0]);
    let html = '';
    for (const row of rows) {
      const c = row.c, p = row.p;
      html += `<tr class="${row.itm_c ? 'itm-c' : ''} ${row.itm_p ? 'itm-p' : ''}">
        <td class="cs dim">${(c.iv*100).toFixed(1)}%</td><td class="cs dim">${fP(c.delta)}</td>
        <td class="cs dim2">${fP(c.gamma,4)}</td><td class="cs dim">${fK(c.oi)}</td>
        <td class="cs dim">${fK(c.vol)}</td><td class="cs dim">${fP(c.bid)} / ${fP(c.ask)}</td>
        <td class="str ${row.atm?'atm':''}">${row.strike}</td>
        <td class="ps dim">${fP(p.bid)} / ${fP(p.ask)}</td><td class="ps dim">${fK(p.vol)}</td>
        <td class="ps dim">${fK(p.oi)}</td><td class="ps dim2">${fP(p.gamma,4)}</td>
        <td class="ps dim">${fP(p.delta)}</td><td class="ps dim">${(p.iv*100).toFixed(1)}%</td>
      </tr>`;
    }
    document.getElementById('chainBody').innerHTML = html;
  }
}

function renderExpButtons(exps) {
  const eg = document.getElementById('expGroup');
  eg.innerHTML = exps.map(e =>
    `<button class="exp-btn${e === curExp ? ' active' : ''}" onclick="changeExp('${e}',this)">${fmtExpLabel(e)}</button>`
  ).join('');
}

function renderDTE() {
  if (!curExp) return;
  const now = new Date(), exp = new Date(curExp + 'T12:00:00');
  const dte = Math.max(0, Math.round((exp - now) / (1000 * 60 * 60 * 24)));
  document.getElementById('dteBadge').textContent = dte + ' DTE';
}

async function changeExp(exp, btn) {
  curExp = exp;
  document.querySelectorAll('#expGroup .exp-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await renderChain();
}

// ═══════════════════════════════════════════
//  DEPTH PANEL (Order Book / GEX by Strike)
// ═══════════════════════════════════════════
async function renderDepth() {
  const el = document.getElementById('depthBody');
  if (!el) return;
  el.innerHTML = '<div class="loader">Loading depth data...</div>';

  const sym = curTicker;
  // Fetch fresh price so depth strikes are centred on actual market price
  let pd = priceCache[sym];
  if (isLive && (!pd || !pd.p || (Date.now() - (pd.fetchedAt||0)) > 60000)) {
    try { pd = await getPrice(sym); priceCache[sym] = pd; } catch(e) {}
  }
  pd = pd || MOCK_PRICES[sym] || { p: 200 };
  const price = pd.p;

  // Fetch live OI by strike from nearest 2 expirations
  let contracts = [];
  if (isLive) {
    try {
      const r = await fetch(`https://api.polygon.io/v3/snapshot/options/${sym}?limit=250&apiKey=${apiKey}`);
      const d = await r.json();
      contracts = d.results || [];
    } catch(e) {}
  }

  // Aggregate OI and volume by strike
  const byStrike = {};
  for (const c of contracts) {
    const strike = c.details?.strike_price;
    if (!strike) continue;
    if (!byStrike[strike]) byStrike[strike] = { strike, callOI: 0, putOI: 0, callVol: 0, putVol: 0, callGex: 0, putGex: 0 };
    const oi  = c.open_interest || 0;
    const vol = c.day?.volume || 0;
    const gamma = c.greeks?.gamma || 0;
    const isCall = c.details?.contract_type === 'call';
    if (isCall) {
      byStrike[strike].callOI  += oi;
      byStrike[strike].callVol += vol;
      byStrike[strike].callGex += gamma * oi * 100 * price; // GEX = gamma * OI * contract_mult * spot
    } else {
      byStrike[strike].putOI  += oi;
      byStrike[strike].putVol += vol;
      byStrike[strike].putGex += gamma * oi * 100 * price;
    }
  }

  // If no live data use mock
  if (!Object.keys(byStrike).length) {
    const rows = mockChain(sym, '');
    for (const row of rows) {
      byStrike[row.strike] = {
        strike: row.strike,
        callOI: row.c.oi, putOI: row.p.oi,
        callVol: row.c.vol, putVol: row.p.vol,
        callGex: row.c.gamma * row.c.oi * 100 * price,
        putGex:  row.p.gamma * row.p.oi * 100 * price,
      };
    }
  }

  const strikes = Object.values(byStrike)
    .filter(s => Math.abs(s.strike - price) / price < 0.15) // ±15% from price
    .sort((a, b) => b.strike - a.strike); // descending

  const maxOI  = Math.max(...strikes.map(s => Math.max(s.callOI, s.putOI)), 1);
  const maxVol = Math.max(...strikes.map(s => Math.max(s.callVol, s.putVol)), 1);
  const maxGex = Math.max(...strikes.map(s => Math.max(Math.abs(s.callGex), Math.abs(s.putGex))), 1);
  const BAR = 120;

  let html = '';
  for (const s of strikes) {
    const isAtm  = Math.abs(s.strike - price) / price < 0.005;
    const abovePrice = s.strike > price;
    const netGex = s.callGex - s.putGex;
    const gexColor = netGex > 0 ? 'var(--yellow)' : 'var(--purple)';
    const gexW = Math.round(Math.abs(netGex) / maxGex * BAR);
    const coiW = Math.round(s.callOI / maxOI * BAR);
    const poiW = Math.round(s.putOI  / maxOI * BAR);
    const cvW  = Math.round(s.callVol / maxVol * BAR);
    const pvW  = Math.round(s.putVol  / maxVol * BAR);

    html += `<tr class="${isAtm ? 'depth-atm' : ''}" style="${abovePrice ? 'opacity:.85' : ''}">
      <!-- Call OI bar (right-aligned) -->
      <td style="text-align:right;padding:3px 6px"><span style="font-size:10px;color:var(--text2)">${fK(s.callOI)}</span></td>
      <td style="width:${BAR}px;padding:3px 2px;text-align:right">
        <span style="display:inline-block;width:${coiW}px;height:7px;background:rgba(0,212,255,.5);border-radius:2px;vertical-align:middle"></span>
      </td>
      <!-- Call Vol -->
      <td style="width:${BAR}px;padding:3px 2px;text-align:right">
        <span style="display:inline-block;width:${cvW}px;height:5px;background:rgba(0,212,255,.3);border-radius:2px;vertical-align:middle"></span>
      </td>
      <td style="text-align:right;padding:3px 6px"><span style="font-size:10px;color:var(--text2)">${fK(s.callVol)}</span></td>
      <!-- Strike -->
      <td class="depth-strike ${isAtm ? 'atm' : ''}">${s.strike}${isAtm ? ' ←' : ''}</td>
      <!-- Put Vol -->
      <td style="padding:3px 2px">
        <span style="display:inline-block;width:${pvW}px;height:5px;background:rgba(255,69,96,.3);border-radius:2px;vertical-align:middle"></span>
      </td>
      <td style="padding:3px 6px"><span style="font-size:10px;color:var(--text2)">${fK(s.putVol)}</span></td>
      <!-- Put OI bar -->
      <td style="width:${BAR}px;padding:3px 2px">
        <span style="display:inline-block;width:${poiW}px;height:7px;background:rgba(255,69,96,.5);border-radius:2px;vertical-align:middle"></span>
      </td>
      <td style="padding:3px 6px"><span style="font-size:10px;color:var(--text2)">${fK(s.putOI)}</span></td>
      <!-- Net GEX -->
      <td style="padding:3px 10px;text-align:center">
        <span style="display:inline-block;width:${gexW}px;height:9px;background:${gexColor};border-radius:2px;vertical-align:middle"></span>
        <span style="font-size:9px;color:${gexColor};margin-left:4px">${netGex > 0 ? 'Pika' : 'Barney'}</span>
      </td>
    </tr>`;
  }
  document.getElementById('depthBody').innerHTML = html;
  document.getElementById('depthTicker').textContent = sym + ' — Open Interest & GEX by Strike';
}
