// ═══════════════════════════════════════════
//  API CONNECT
// ═══════════════════════════════════════════
async function connectAPI() {
  const key = document.getElementById('apiKey').value.trim();
  if (!key) { toast('Enter your Polygon.io API key first', 'error'); return; }
  apiKey = key;
  toast('Connecting to Polygon.io...');
  try {
    const resp = await fetch(`https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${apiKey}`);
    const d = await resp.json();
    if (d.status === 'OK' || d.resultsCount > 0) {
      isLive = true; setStatus('live');
      toast('Connected! Loading live data...', 'success');
      await refreshAll();
    } else {
      throw new Error(d.error || 'Auth failed');
    }
  } catch(e) {
    isLive = false; setStatus('err');
    toast('Connection failed: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════
//  POLYGON FETCHERS
// ═══════════════════════════════════════════
async function polyPrevClose(sym) {
  const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${apiKey}`);
  const d = await r.json();
  if (!d.results?.[0]) throw new Error('no data');
  const res = d.results[0];
  return {p:res.c, c:+(res.c-res.o).toFixed(2), pct:+((res.c-res.o)/res.o*100).toFixed(2)};
}

async function polyExpirations(sym) {
  const r = await fetch(`https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${sym}&limit=8&sort=expiration_date&order=asc&apiKey=${apiKey}`);
  const d = await r.json();
  return [...new Set((d.results||[]).map(x=>x.expiration_date))].slice(0,7);
}

async function polyChain(sym, exp) {
  const price = (priceCache[sym]||MOCK_PRICES[sym]||{p:200}).p;
  const r = await fetch(`https://api.polygon.io/v3/snapshot/options/${sym}?expiration_date=${exp}&limit=100&apiKey=${apiKey}`);
  const d = await r.json();
  if (!d.results?.length) return null;
  const byStrike = {};
  for (const item of d.results) {
    const det = item.details||{}, gr = item.greeks||{}, day = item.day||{};
    const strike = det.strike_price; if (!strike) continue;
    if (!byStrike[strike]) byStrike[strike]={strike,itm_c:strike<price,itm_p:strike>price,atm:Math.abs(strike-price)<price*.005,c:null,p:null};
    const side = det.contract_type==='call'?'c':'p';
    byStrike[strike][side]={
      iv:+(item.implied_volatility||.25),
      delta:+(gr.delta||0), gamma:+(gr.gamma||0),
      oi:item.open_interest||0, vol:day.volume||0,
      bid:+(item.last_quote?.bid||0), ask:+(item.last_quote?.ask||0),
    };
  }
  const rows = Object.values(byStrike).sort((a,b)=>a.strike-b.strike);
  rows.forEach(row=>{
    if(!row.c) row.c={iv:.25,delta:.5,gamma:.01,oi:0,vol:0,bid:0,ask:0};
    if(!row.p) row.p={iv:.27,delta:-.5,gamma:.01,oi:0,vol:0,bid:0,ask:0};
  });
  return rows;
}

async function polySnapshotAll(tickers) {
  const syms = tickers.join(',');
  const r = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${syms}&apiKey=${apiKey}`);
  const d = await r.json();
  const out = {};
  for (const t of d.tickers||[]) {
    out[t.ticker] = {
      p:+(t.day?.c||t.prevDay?.c||200).toFixed(2),
      c:+(t.todaysChange||0).toFixed(2),
      pct:+(t.todaysChangePerc||0).toFixed(2)
    };
  }
  return out;
}