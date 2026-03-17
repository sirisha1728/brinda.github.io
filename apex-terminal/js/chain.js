// ═══════════════════════════════════════════
//  TICKER & PRICE
// ═══════════════════════════════════════════
async function getPrice(sym) {
  if(isLive) { try { return await polyPrevClose(sym); } catch(e){} }
  return MOCK_PRICES[sym]||{p:200,c:0,pct:0};
}

async function setTicker(sym, btn) {
  curTicker = sym; curExp = '';
  document.querySelectorAll('.ticker-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const pd = await getPrice(sym);
  priceCache[sym] = pd;
  updateTickerBtn(sym, pd);
  const activePanel = document.querySelector('.panel.active').id.replace('panel-','');
  if(activePanel==='chain') await renderChain();
}

function updateTickerBtn(sym, pd) {
  const pe = document.getElementById('tb-price-'+sym);
  const ce = document.getElementById('tb-chg-'+sym);
  if(pe) pe.textContent = '$'+(pd.p||0).toFixed(2);
  if(ce) {
    ce.className = 'ticker-chg '+(pd.pct>=0?'up':'dn');
    ce.textContent = (pd.pct>=0?'▲ +':'▼ ')+(pd.pct||0).toFixed(2)+'%';
  }
}

async function refreshPrices() {
  if(isLive) {
    try {
      const prices = await polySnapshotAll(TICKERS.filter(t=>t!=='SPX'));
      for(const [sym,pd] of Object.entries(prices)) {
        priceCache[sym]=pd; updateTickerBtn(sym,pd);
      }
    } catch(e){}
  } else {
    for(const [sym,pd] of Object.entries(MOCK_PRICES)) {
      const jitter = {p:pd.p*(1+r(-.001,.001)), c:pd.c+r(-.05,.05), pct:pd.pct+r(-.02,.02)};
      priceCache[sym]=jitter; updateTickerBtn(sym,jitter);
    }
  }
  document.getElementById('update-time').textContent = ts();
}

// ═══════════════════════════════════════════
//  CHAIN
// ═══════════════════════════════════════════
async function renderChain() {
  document.getElementById('chainBody').innerHTML = '<tr><td colspan="13" class="loader">Loading options chain...</td></tr>';
  document.getElementById('chainErr').innerHTML = '';
  try {
    const pd = priceCache[curTicker]||await getPrice(curTicker);
    priceCache[curTicker]=pd;

    let exps;
    if(isLive) { try { exps=await polyExpirations(curTicker); } catch(e){ exps=mockExps(curTicker); } }
    else exps=mockExps(curTicker);
    if(!exps.length) exps=mockExps(curTicker);

    if(!curExp||!exps.includes(curExp)) curExp=exps[0];
    renderExpButtons(exps);

    let rows;
    if(isLive) { try { rows=await polyChain(curTicker,curExp); } catch(e){ rows=null; } }
    else rows=null;
    if(!rows||!rows.length) rows=mockChain(curTicker,curExp);

    document.getElementById('chainSource').textContent = isLive?'live · polygon.io':'simulated data';
    renderDTE();

    let html='';
    for(const row of rows){
      const c=row.c, p=row.p;
      html+=`<tr class="${row.itm_c?'itm-c':''} ${row.itm_p?'itm-p':''}">
        <td class="cs dim">${(c.iv*100).toFixed(1)}%</td>
        <td class="cs ${c.delta>.5?'up':'dim'}">${fP(c.delta)}</td>
        <td class="cs dim2">${fP(c.gamma,4)}</td>
        <td class="cs dim">${fK(c.oi)}</td>
        <td class="cs ${c.vol>c.oi*.15?'up':'dim'}">${fK(c.vol)}</td>
        <td class="cs dim">${fP(c.bid)} / ${fP(c.ask)}</td>
        <td class="str ${row.atm?'atm':''}">${row.strike}</td>
        <td class="ps dim">${fP(p.bid)} / ${fP(p.ask)}</td>
        <td class="ps ${p.vol>p.oi*.15?'dn':'dim'}">${fK(p.vol)}</td>
        <td class="ps dim">${fK(p.oi)}</td>
        <td class="ps dim2">${fP(p.gamma,4)}</td>
        <td class="ps ${p.delta<-.5?'dn':'dim'}">${fP(p.delta)}</td>
        <td class="ps dim">${(p.iv*100).toFixed(1)}%</td>
      </tr>`;
    }
    document.getElementById('chainBody').innerHTML=html;
  } catch(e) {
    document.getElementById('chainErr').innerHTML=`<div class="err-bar">Error: ${e.message}. Showing simulated data.</div>`;
    document.getElementById('chainBody').innerHTML='<tr><td colspan="13" class="loader">—</td></tr>';
  }
}

function renderExpButtons(exps) {
  const eg = document.getElementById('expGroup');
  eg.innerHTML = exps.map(e=>`<button class="exp-btn${e===curExp?' active':''}" onclick="changeExp('${e}',this)">${fmtExpLabel(e)}</button>`).join('');
}

function renderDTE() {
  if(!curExp) return;
  const now = new Date(); const exp = new Date(curExp+'T12:00:00');
  const dte = Math.max(0,Math.round((exp-now)/(1000*60*60*24)));
  document.getElementById('dteBadge').textContent=dte+' DTE';
}

function fmtExpLabel(e) {
  const d=new Date(e+'T12:00:00');
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

async function changeExp(exp, btn) {
  curExp=exp;
  document.querySelectorAll('#expGroup .exp-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  await renderChain();
}