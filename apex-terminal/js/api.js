// ═══════════════════════════════════════════
//  CONNECT & WARM CACHE
// ═══════════════════════════════════════════
async function connectAPI() {
  const sel  = document.getElementById('providerSel');
  const input = document.getElementById('apiKeyInput').value.trim();
  if (sel) provider = sel.value;
  if (input) apiKeys[provider] = input;

  if (!apiKey()) { toast('Enter an API key for ' + PROVIDER_LABELS[provider], 'error'); return; }

  toast('Connecting to ' + PROVIDER_LABELS[provider] + '...');
  try {
    const ok = await testConnection();
    if (ok) {
      isLive = true;
      setStatus('live');
      document.getElementById('apiKeyInput').value = '';
      document.getElementById('apiKeyInput').placeholder = 'Connected ✓ – ' + PROVIDER_LABELS[provider];
      await warmCache();
      startPriceWS();
      startFlowEngine();
      await refreshAll();
      await refreshMarketStats();
      toast('Live · ' + PROVIDER_LABELS[provider] + ' ✓', 'success');
    } else throw new Error('Auth failed');
  } catch(e) {
    isLive = false; setStatus('err');
    toast('Failed: ' + e.message, 'error');
  }
}

async function autoConnect() {
  // Try providers in order: polygon (pre-keyed) → others if keyed
  for (const p of ['polygon','marketdata','tradier']) {
    if (!apiKeys[p]) continue;
    provider = p;
    try {
      const ok = await testConnection();
      if (ok) {
        isLive = true; setStatus('live');
        document.getElementById('apiKeyInput').placeholder = 'Connected ✓ – ' + PROVIDER_LABELS[provider];
        const sel = document.getElementById('providerSel');
        if (sel) sel.value = provider;
        await warmCache();
        startPriceWS();
        startFlowEngine();
        await refreshAll();
        await refreshMarketStats();
        return;
      }
    } catch(e) {}
  }
}

async function testConnection() {
  if (provider === 'polygon') {
    const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${apiKey()}`);
    const d = await r.json();
    return d.status === 'OK' || d.resultsCount > 0;
  }
  if (provider === 'marketdata') {
    const r = await fetch('https://api.marketdata.app/v1/stocks/quotes/AAPL/', { headers: mdHeaders() });
    return r.ok;
  }
  if (provider === 'tradier') {
    const r = await fetch(`${TRADIER_BASE()}/markets/quotes?symbols=AAPL`, { headers: tradierHeaders() });
    return r.ok;
  }
  return false;
}

async function warmCache() {
  const allSyms = [...new Set([...TICKERS.filter(t=>t!=='SPX'), ...HEAT_TICKERS.filter(t=>t!=='SPX')])];
  try {
    const prices = await getSnapshotAll(allSyms);
    for (const [sym,pd] of Object.entries(prices)) { priceCache[sym]=pd; updateTickerBtn(sym,pd); }
  } catch(e) {}
}

// ═══════════════════════════════════════════
//  PROVIDER HEADERS
// ═══════════════════════════════════════════
const mdHeaders      = () => ({ 'Authorization': `Token ${apiKeys.marketdata}` });
const tradierHeaders = () => ({ 'Authorization': `Bearer ${apiKeys.tradier}`, 'Accept': 'application/json' });

// ═══════════════════════════════════════════
//  PRICE — getExtendedQuote (single ticker)
// ═══════════════════════════════════════════
async function getExtendedQuote(sym) {
  if (provider === 'polygon')    return polyGetQuote(sym);
  if (provider === 'marketdata') return mdGetQuote(sym);
  if (provider === 'tradier')    return tradierGetQuote(sym);
  throw new Error('Unknown provider');
}

async function polyGetQuote(sym) {
  const r = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${apiKey()}`);
  const d = await r.json();
  const t = d.ticker; if (!t) throw new Error('no data');
  const sess      = marketSession();
  const prevClose = +(t.prevDay?.c || 0).toFixed(2);
  const price     = +(t.lastTrade?.p || t.day?.c || prevClose).toFixed(2);
  return { p:price, c:+(price-prevClose).toFixed(2), pct:prevClose>0?+((price-prevClose)/prevClose*100).toFixed(2):0, prevClose, extPrice:(sess==='pre'||sess==='after')?price:null, session:sess, fetchedAt:Date.now() };
}

async function mdGetQuote(sym) {
  const r = await fetch(`https://api.marketdata.app/v1/stocks/quotes/${sym}/`, { headers: mdHeaders() });
  const d = await r.json();
  const price = +(d.last?.[0] || 0).toFixed(2);
  const prev  = +(d.prevClose?.[0] || price).toFixed(2);
  const sess  = marketSession();
  return { p:price, c:+(price-prev).toFixed(2), pct:prev>0?+((price-prev)/prev*100).toFixed(2):0, prevClose:prev, extPrice:(sess==='pre'||sess==='after')?price:null, session:sess, fetchedAt:Date.now() };
}

async function tradierGetQuote(sym) {
  const r = await fetch(`${TRADIER_BASE()}/markets/quotes?symbols=${sym}`, { headers: tradierHeaders() });
  const d = await r.json();
  const q = d.quotes?.quote; if (!q) throw new Error('no data');
  const price = +(q.last||0).toFixed(2), prev = +(q.prevclose||price).toFixed(2);
  const sess  = marketSession();
  return { p:price, c:+(price-prev).toFixed(2), pct:prev>0?+((price-prev)/prev*100).toFixed(2):0, prevClose:prev, extPrice:(sess==='pre'||sess==='after')?price:null, session:sess, fetchedAt:Date.now() };
}

// ═══════════════════════════════════════════
//  PRICE — getSnapshotAll (bulk)
// ═══════════════════════════════════════════
async function getSnapshotAll(tickers) {
  if (provider === 'polygon')    return polySnapshotAll(tickers);
  if (provider === 'marketdata') return mdSnapshotAll(tickers);
  if (provider === 'tradier')    return tradierSnapshotAll(tickers);
  return {};
}

async function polySnapshotAll(tickers) {
  const r = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${apiKey()}`);
  const d = await r.json(); const out = {}; const sess = marketSession();
  for (const t of d.tickers||[]) {
    const prev=+(t.prevDay?.c||0).toFixed(2), price=+(t.lastTrade?.p||t.day?.c||prev).toFixed(2);
    out[t.ticker]={p:price,c:+(price-prev).toFixed(2),pct:prev>0?+((price-prev)/prev*100).toFixed(2):0,prevClose:prev,extPrice:(sess==='pre'||sess==='after')?price:null,session:sess,fetchedAt:Date.now()};
  }
  return out;
}

async function mdSnapshotAll(tickers) {
  const out = {};
  // MarketData bulk quotes
  const r = await fetch(`https://api.marketdata.app/v1/stocks/quotes/${tickers.join(',')}/`, { headers: mdHeaders() });
  const d = await r.json();
  const sess = marketSession();
  const syms = d.symbol || [];
  syms.forEach((sym,i) => {
    const price=+(d.last?.[i]||0).toFixed(2), prev=+(d.prevClose?.[i]||price).toFixed(2);
    out[sym]={p:price,c:+(price-prev).toFixed(2),pct:prev>0?+((price-prev)/prev*100).toFixed(2):0,prevClose:prev,extPrice:(sess==='pre'||sess==='after')?price:null,session:sess,fetchedAt:Date.now()};
  });
  return out;
}

async function tradierSnapshotAll(tickers) {
  const r = await fetch(`${TRADIER_BASE()}/markets/quotes?symbols=${tickers.join(',')}`, { headers: tradierHeaders() });
  const d = await r.json(); const out = {}; const sess = marketSession();
  const quotes = d.quotes?.quote;
  const list = Array.isArray(quotes) ? quotes : (quotes ? [quotes] : []);
  for (const q of list) {
    const price=+(q.last||0).toFixed(2), prev=+(q.prevclose||price).toFixed(2);
    out[q.symbol]={p:price,c:+(price-prev).toFixed(2),pct:prev>0?+((price-prev)/prev*100).toFixed(2):0,prevClose:prev,extPrice:(sess==='pre'||sess==='after')?price:null,session:sess,fetchedAt:Date.now()};
  }
  return out;
}

// Legacy alias (used in chain.js)
const polyPrevClose = sym => polyGetQuote(sym);

// ═══════════════════════════════════════════
//  EXPIRATIONS
// ═══════════════════════════════════════════
async function getExpirations(sym) {
  if (provider === 'polygon')    return polyExpirations(sym);
  if (provider === 'marketdata') return mdExpirations(sym);
  if (provider === 'tradier')    return tradierExpirations(sym);
  return mockExps(sym);
}

async function polyExpirations(sym) {
  try {
    const r = await fetch(`https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${sym}&limit=8&sort=expiration_date&order=asc&apiKey=${apiKey()}`);
    const d = await r.json();
    const exps = [...new Set((d.results||[]).map(x=>x.expiration_date))].filter(Boolean);
    if (exps.length) return exps.slice(0,7);
  } catch(e) {}
  return upcomingFridays(7);
}

async function mdExpirations(sym) {
  const r = await fetch(`https://api.marketdata.app/v1/options/expirations/${sym}/`, { headers: mdHeaders() });
  const d = await r.json();
  return (d.expirations||[]).slice(0,7);
}

async function tradierExpirations(sym) {
  const r = await fetch(`${TRADIER_BASE()}/markets/options/expirations?symbol=${sym}`, { headers: tradierHeaders() });
  const d = await r.json();
  return (d.expirations?.date||[]).slice(0,7);
}

function upcomingFridays(n) {
  const out=[]; const d=new Date(); const day=d.getDay();
  d.setDate(d.getDate()+((5-day+7)%7||7));
  for(let i=0;i<n;i++){out.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+7);}
  return out;
}

// ═══════════════════════════════════════════
//  OPTIONS CHAIN
// ═══════════════════════════════════════════
async function getChain(sym, exp) {
  if (provider === 'polygon')    return polyChain(sym, exp);
  if (provider === 'marketdata') return mdChain(sym, exp);
  if (provider === 'tradier')    return tradierChain(sym, exp);
  return null;
}

// ── Black-Scholes greeks fallback ──
function bsGreeks(S, K, T, iv, isCall) {
  if (T<=0||iv<=0||S<=0||K<=0) return {delta:0,gamma:0};
  const sqrtT=Math.sqrt(T), d1=(Math.log(S/K)+0.5*iv*iv*T)/(iv*sqrtT), d2=d1-iv*sqrtT;
  const phi=x=>Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI);
  const N=x=>{const a1=.319381530,a2=-.356563782,a3=1.781477937,a4=-1.821255978,a5=1.330274429,k=1/(1+.2316419*Math.abs(x)),p=1-phi(x)*(a1*k+a2*k*k+a3*k*k*k+a4*k*k*k*k+a5*k*k*k*k*k);return x>=0?p:1-p;};
  return { delta:+(isCall?N(d1):N(d1)-1).toFixed(4), gamma:+(phi(d1)/(S*iv*sqrtT)).toFixed(6) };
}

function buildSyntheticChain(price, step) {
  const T=14/365, baseIV=0.20, rows=[], center=Math.round(price/step)*step;
  for(let i=-16;i<=16;i++){
    const strike=center+i*step, moneyness=(strike-price)/price;
    const iv=Math.max(0.08,baseIV+Math.abs(moneyness)*0.6+(moneyness<0?0.05:0));
    const cG=bsGreeks(price,strike,T,iv,true), pG=bsGreeks(price,strike,T,iv,false);
    const oiBase=50000, oiDecay=Math.exp(-Math.pow(moneyness/0.04,2));
    const callOI=Math.round(oiBase*oiDecay*(0.7+Math.random()*0.6));
    const putOI =Math.round(oiBase*oiDecay*(0.8+Math.random()*0.4)*(moneyness<0?1.3:0.9));
    const cBid=+Math.max(0.01,(Math.max(0,price-strike)+iv*price*Math.sqrt(T)*0.4)).toFixed(2);
    const pBid=+Math.max(0.01,(Math.max(0,strike-price)+iv*price*Math.sqrt(T)*0.4)).toFixed(2);
    rows.push({strike,itm_c:strike<price,itm_p:strike>price,atm:Math.abs(strike-price)<step*0.7,
      c:{iv,delta:cG.delta,gamma:cG.gamma,oi:callOI,vol:Math.round(callOI*0.1*Math.random()),bid:cBid,ask:+(cBid+iv*0.5).toFixed(2)},
      p:{iv,delta:pG.delta,gamma:pG.gamma,oi:putOI, vol:Math.round(putOI *0.1*Math.random()),bid:pBid,ask:+(pBid+iv*0.5).toFixed(2)}});
  }
  return rows;
}

function normaliseChainRows(byStrike, price) {
  const rows = Object.values(byStrike).sort((a,b)=>a.strike-b.strike);
  rows.forEach(row=>{
    if(!row.c) row.c={iv:.25,delta:.5, gamma:.01,oi:0,vol:0,bid:0,ask:0};
    if(!row.p) row.p={iv:.27,delta:-.5,gamma:.01,oi:0,vol:0,bid:0,ask:0};
  });
  return rows;
}

// ── Polygon chain ──
async function polyChain(sym, exp) {
  const price=(priceCache[sym]?.p>0)?priceCache[sym].p:(MOCK_PRICES[sym]?.p||200);
  let allResults=[], nextUrl=`https://api.polygon.io/v3/snapshot/options/${sym}?expiration_date=${exp}&limit=250&apiKey=${apiKey()}`;
  for(let page=0;page<4&&nextUrl;page++){
    try{const r=await fetch(nextUrl),d=await r.json();
      if(d.status==='NOT_AUTHORIZED'||d.status==='ERROR') throw new Error(d.message||d.status);
      allResults=allResults.concat(d.results||[]);
      nextUrl=d.next_url?d.next_url+`&apiKey=${apiKey()}`:null;
    }catch(e){if(page===0)throw e;break;}
  }
  if(!allResults.length) return null;
  const expDate=new Date(exp+'T16:00:00-05:00'), T=Math.max(0.001,(expDate-Date.now())/(365*24*3600*1000));
  const byStrike={};
  for(const item of allResults){
    const det=item.details||{},gr=item.greeks||{},day=item.day||{},quote=item.last_quote||{};
    const strike=det.strike_price; if(!strike) continue;
    const isCall=det.contract_type==='call', iv=item.implied_volatility||0.25;
    let delta=+(gr.delta||0), gamma=+(gr.gamma||0);
    if(!delta&&!gamma){const g=bsGreeks(price,strike,T,iv,isCall);delta=g.delta;gamma=g.gamma;}
    if(!byStrike[strike]) byStrike[strike]={strike,itm_c:strike<price,itm_p:strike>price,atm:Math.abs(strike-price)<price*0.005,c:null,p:null};
    byStrike[strike][isCall?'c':'p']={iv,delta,gamma,oi:item.open_interest||0,vol:day.volume||0,bid:+(quote.bid||0),ask:+(quote.ask||0)};
  }
  return normaliseChainRows(byStrike, price);
}

// ── MarketData.app chain ──
async function mdChain(sym, exp) {
  const price=(priceCache[sym]?.p>0)?priceCache[sym].p:(MOCK_PRICES[sym]?.p||200);
  const r = await fetch(`https://api.marketdata.app/v1/options/chain/${sym}/?expiration=${exp}&limit=500`, { headers: mdHeaders() });
  const d = await r.json();
  if (!d.optionSymbol?.length) return null;
  const n=d.optionSymbol.length, byStrike={};
  const expDate=new Date(exp+'T16:00:00-05:00'), T=Math.max(0.001,(expDate-Date.now())/(365*24*3600*1000));
  for(let i=0;i<n;i++){
    const strike=d.strike?.[i]; if(!strike) continue;
    const isCall=d.side?.[i]==='call', iv=d.iv?.[i]||0.25;
    let delta=+(d.delta?.[i]||0), gamma=+(d.gamma?.[i]||0);
    if(!delta&&!gamma){const g=bsGreeks(price,strike,T,iv,isCall);delta=g.delta;gamma=g.gamma;}
    if(!byStrike[strike]) byStrike[strike]={strike,itm_c:strike<price,itm_p:strike>price,atm:Math.abs(strike-price)<price*0.005,c:null,p:null};
    byStrike[strike][isCall?'c':'p']={iv,delta,gamma,oi:d.openInterest?.[i]||0,vol:d.volume?.[i]||0,bid:+(d.bid?.[i]||0),ask:+(d.ask?.[i]||0)};
  }
  return normaliseChainRows(byStrike, price);
}

// ── Tradier chain ──
async function tradierChain(sym, exp) {
  const price=(priceCache[sym]?.p>0)?priceCache[sym].p:(MOCK_PRICES[sym]?.p||200);
  const r = await fetch(`${TRADIER_BASE()}/markets/options/chains?symbol=${sym}&expiration=${exp}&greeks=true`, { headers: tradierHeaders() });
  const d = await r.json();
  const opts=d.options?.option||[]; if(!opts.length) return null;
  const expDate=new Date(exp+'T16:00:00-05:00'), T=Math.max(0.001,(expDate-Date.now())/(365*24*3600*1000));
  const byStrike={};
  for(const o of opts){
    const strike=o.strike; if(!strike) continue;
    const isCall=o.option_type==='call', iv=+(o.greeks?.smv_vol||o.iv||0.25);
    let delta=+(o.greeks?.delta||0), gamma=+(o.greeks?.gamma||0);
    if(!delta&&!gamma){const g=bsGreeks(price,strike,T,iv,isCall);delta=g.delta;gamma=g.gamma;}
    if(!byStrike[strike]) byStrike[strike]={strike,itm_c:strike<price,itm_p:strike>price,atm:Math.abs(strike-price)<price*0.005,c:null,p:null};
    byStrike[strike][isCall?'c':'p']={iv,delta,gamma,oi:o.open_interest||0,vol:o.volume||0,bid:+(o.bid||0),ask:+(o.ask||0)};
  }
  return normaliseChainRows(byStrike, price);
}

// ── Multi-exp aggregation (Trinity) ──
async function polyChainMultiExp(sym, numExps=4) {
  const exps=(await getExpirations(sym)).slice(0,numExps);
  if(!exps.length) return null;
  const chainsByExp=await Promise.all(exps.map(exp=>getChain(sym,exp).catch(()=>null)));
  const agg={};
  for(const rows of chainsByExp){
    if(!rows) continue;
    for(const row of rows){
      const k=row.strike;
      if(!agg[k]) agg[k]={strike:k,itm_c:row.itm_c,itm_p:row.itm_p,atm:row.atm,c:{iv:0,delta:0,gamma:0,oi:0,vol:0,bid:0,ask:0,_w:0},p:{iv:0,delta:0,gamma:0,oi:0,vol:0,bid:0,ask:0,_w:0}};
      for(const s of['c','p']){
        const src=row[s],dst=agg[k][s],oi=src.oi||0;
        dst.iv    =(dst._w>0)?(dst.iv*dst._w+src.iv*oi)/(dst._w+oi+1e-9):src.iv;
        dst.delta =(dst._w>0)?(dst.delta*dst._w+src.delta*oi)/(dst._w+oi+1e-9):src.delta;
        dst.gamma =(dst._w>0)?(dst.gamma*dst._w+src.gamma*oi)/(dst._w+oi+1e-9):src.gamma;
        dst.bid=Math.max(dst.bid,src.bid||0); dst.ask=Math.max(dst.ask,src.ask||0);
        dst.oi+=oi; dst.vol+=src.vol||0; dst._w+=oi;
      }
    }
  }
  const rows=Object.values(agg).sort((a,b)=>a.strike-b.strike);
  rows.forEach(row=>{delete row.c._w;delete row.p._w;row.c.delta=+row.c.delta.toFixed(4);row.c.gamma=+row.c.gamma.toFixed(6);row.p.delta=+row.p.delta.toFixed(4);row.p.gamma=+row.p.gamma.toFixed(6);});
  return rows.length?rows:null;
}

// ── Flow trades ──
async function fetchFlowTrades(underlying) {
  if (provider==='polygon') return polyFetchRecentOptionTrades(underlying);
  if (provider==='marketdata') return mdFetchFlowTrades(underlying);
  if (provider==='tradier') return tradierFetchFlowTrades(underlying);
  return [];
}

async function polyFetchRecentOptionTrades(underlying) {
  const snap=await fetch(`https://api.polygon.io/v3/snapshot/options/${underlying}?limit=50&sort=volume&order=desc&apiKey=${apiKey()}`);
  const sd=await snap.json(); const contracts=sd.results||[]; const trades=[];
  for(const contract of contracts.slice(0,10)){
    const sym=contract.details?.ticker; if(!sym) continue;
    try{const tr=await fetch(`https://api.polygon.io/v3/trades/${sym}?limit=5&order=desc&sort=timestamp&apiKey=${apiKey()}`),td=await tr.json();
      for(const t of td.results||[]){
        const price=t.price||0,size=t.size||0,premium=price*size*100;
        if(premium<MIN_PREMIUM) continue;
        const det=contract.details||{},parsed=parseOptionSymbol(sym);
        trades.push({id:t.id||(sym+t.participant_timestamp),sym,underlying,type:det.contract_type==='call'?'C':'P',strike:det.strike_price?.toString()||parsed.strike,exp:fmtExpLabel(det.expiration_date||parsed.exp),price,size,premium,iv:contract.implied_volatility||0,oi:contract.open_interest||0,delta:contract.greeks?.delta||0,ts:t.participant_timestamp||t.sip_timestamp||Date.now()*1e6,conditions:t.conditions||[]});
      }
    }catch(e){}
  }
  return trades;
}

async function mdFetchFlowTrades(underlying) {
  // MarketData.app: get option chain sorted by volume, treat high-vol contracts as flow
  try {
    const r=await fetch(`https://api.marketdata.app/v1/options/chain/${underlying}/?minVolume=100&limit=50`,{headers:mdHeaders()});
    const d=await r.json(); const trades=[]; const n=d.optionSymbol?.length||0;
    for(let i=0;i<n;i++){
      const vol=d.volume?.[i]||0,bid=+(d.bid?.[i]||0),ask=+(d.ask?.[i]||0);
      const mid=(bid+ask)/2, premium=mid*vol*100;
      if(premium<MIN_PREMIUM) continue;
      const isCall=d.side?.[i]==='call';
      trades.push({id:'md-'+d.optionSymbol[i],sym:d.optionSymbol[i],underlying,type:isCall?'C':'P',strike:(d.strike?.[i]||'').toString(),exp:fmtExpLabel(d.expiration?.[i]||''),price:mid,size:vol,premium,iv:d.iv?.[i]||0,oi:d.openInterest?.[i]||0,delta:d.delta?.[i]||0,ts:Date.now()*1e6,conditions:[]});
    }
    return trades;
  }catch(e){return [];}
}

async function tradierFetchFlowTrades(underlying) {
  // Tradier: get option quotes for nearest expiry, flag unusual vol
  try {
    const exps=await tradierExpirations(underlying);
    if(!exps.length) return [];
    const r=await fetch(`${TRADIER_BASE()}/markets/options/chains?symbol=${underlying}&expiration=${exps[0]}&greeks=false`,{headers:tradierHeaders()});
    const d=await r.json(); const opts=d.options?.option||[]; const trades=[];
    for(const o of opts){
      const vol=o.volume||0,bid=+(o.bid||0),ask=+(o.ask||0),mid=(bid+ask)/2,premium=mid*vol*100;
      if(premium<MIN_PREMIUM) continue;
      trades.push({id:'tr-'+o.symbol,sym:o.symbol,underlying,type:o.option_type==='call'?'C':'P',strike:o.strike?.toString()||'',exp:fmtExpLabel(o.expiration_date||''),price:mid,size:vol,premium,iv:+(o.greeks?.smv_vol||0),oi:o.open_interest||0,delta:+(o.greeks?.delta||0),ts:Date.now()*1e6,conditions:[]});
    }
    return trades;
  }catch(e){return [];}
}

// ── Market stats (VIX, PCR) ──
async function refreshMarketStats() {
  if (!isLive) return;
  // VIX
  try {
    if (provider==='polygon') {
      const r=await fetch(`https://api.polygon.io/v2/aggs/ticker/I:VIX/prev?apiKey=${apiKey()}`),d=await r.json(),vix=d.results?.[0]?.c;
      if(vix){const el=document.getElementById('vix-val');if(el){el.textContent=vix.toFixed(2);el.className='ms-val '+(vix>20?'dn':'up');}}
    }
    if (provider==='marketdata') {
      const r=await fetch('https://api.marketdata.app/v1/stocks/quotes/VIX/',{headers:mdHeaders()}),d=await r.json(),vix=d.last?.[0];
      if(vix){const el=document.getElementById('vix-val');if(el){el.textContent=(+vix).toFixed(2);el.className='ms-val '+(+vix>20?'dn':'up');}}
    }
    if (provider==='tradier') {
      const r=await fetch(`${TRADIER_BASE()}/markets/quotes?symbols=VIX`,{headers:tradierHeaders()}),d=await r.json(),vix=d.quotes?.quote?.last;
      if(vix){const el=document.getElementById('vix-val');if(el){el.textContent=(+vix).toFixed(2);el.className='ms-val '+(+vix>20?'dn':'up');}}
    }
  }catch(e){}
  // PCR from SPY options
  try {
    if (provider==='polygon') {
      const r=await fetch(`https://api.polygon.io/v3/snapshot/options/SPY?limit=250&apiKey=${apiKey()}`),d=await r.json();
      const contracts=d.results||[]; let callVol=0,putVol=0;
      for(const c of contracts){const vol=c.day?.volume||0;c.details?.contract_type==='call'?callVol+=vol:putVol+=vol;}
      if(callVol>0){const pcr=(putVol/callVol).toFixed(2);const el=document.getElementById('pcr-val');if(el){el.textContent=pcr;el.className='ms-val '+(+pcr>1?'dn':'up');}}
    }
    if (provider==='marketdata') {
      const r=await fetch('https://api.marketdata.app/v1/options/chain/SPY/?limit=200',{headers:mdHeaders()}),d=await r.json();
      const n=d.side?.length||0; let callVol=0,putVol=0;
      for(let i=0;i<n;i++) d.side[i]==='call'?callVol+=(d.volume?.[i]||0):putVol+=(d.volume?.[i]||0);
      if(callVol>0){const pcr=(putVol/callVol).toFixed(2);const el=document.getElementById('pcr-val');if(el){el.textContent=pcr;el.className='ms-val '+(+pcr>1?'dn':'up');}}
    }
  }catch(e){}
}

// ── Market session ──
function marketSession() {
  const now=new Date(),et=new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}));
  const mins=et.getHours()*60+et.getMinutes(),day=et.getDay();
  if(day===0||day===6) return 'closed';
  if(mins>=570&&mins<960)  return 'market';
  if(mins>=240&&mins<570)  return 'pre';
  if(mins>=960&&mins<1200) return 'after';
  return 'closed';
}

// ── OCC symbol parser ──
function parseOptionSymbol(sym) {
  const clean=sym.replace('O:',''),m=clean.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if(!m) return {underlying:'',exp:'',type:'',strike:''};
  return {underlying:m[1],exp:`20${m[2]}-${m[3]}-${m[4]}`,type:m[5],strike:(parseInt(m[6])/1000).toString()};
}
