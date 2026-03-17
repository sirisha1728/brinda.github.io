// ═══════════════════════════════════════════
//  HEATSEEKER — GEX Visualization
// ═══════════════════════════════════════════
function buildHeatData(sym) {
  const price = (priceCache[sym]||MOCK_PRICES[sym]||{p:200}).p;
  const step = price<100?1:price<300?5:price<700?10:25;
  const center = Math.round(price/step)*step;
  const nodes = [];
  for(let i=-15;i<=15;i++){
    const strike = center+i*step;
    // GEX calculation: negative near ATM (dealers short gamma), positive farther OTM
    const dist = Math.abs(strike-price)/price;
    let gex = 0;
    // King node slightly above current price
    if(i===2) gex = -(r(8000,15000));       // Pika (yellow) — strong pin
    else if(i===-3) gex = (r(5000,9000));    // Barney (purple) — explosion
    else if(i===5) gex = -(r(3000,6000));    // Secondary pika
    else if(i===-6) gex = (r(2000,4500));    // Secondary barney
    else {
      gex = (Math.random()-.5)*r(500,3000) * (1/(dist*10+1));
    }
    const oi = ri(500,25000);
    nodes.push({strike, gex: +gex.toFixed(0), oi, isKing:i===2, dist});
  }
  return {price, step, nodes};
}

function renderHeatCanvas() {
  const canvas = document.getElementById('heatCanvas');
  const wrap = canvas.parentElement;
  canvas.width = wrap.offsetWidth; canvas.height = wrap.offsetHeight;
  const ctx = canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;

  ctx.fillStyle = '#0d1117'; ctx.fillRect(0,0,W,H);
  if(!heatData.nodes) return;

  const {price, nodes} = heatData;
  const margin = {left:80, right:40, top:20, bottom:30};
  const plotW = W-margin.left-margin.right;
  const plotH = H-margin.top-margin.bottom;

  const strikes = nodes.map(n=>n.strike);
  const minS=Math.min(...strikes), maxS=Math.max(...strikes);
  const maxGex = Math.max(...nodes.map(n=>Math.abs(n.gex)));

  const sx = s => margin.left + (s-minS)/(maxS-minS)*plotW;
  const barW = plotW/(nodes.length)*0.65;

  // Grid lines
  ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=margin.top+plotH*i/4;
    ctx.beginPath(); ctx.moveTo(margin.left,y); ctx.lineTo(W-margin.right,y); ctx.stroke();
  }
  // Zero line
  const zeroY = margin.top+plotH/2;
  ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=1;
  ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(margin.left,zeroY); ctx.lineTo(W-margin.right,zeroY); ctx.stroke();
  ctx.setLineDash([]);

  // Bars
  for(const node of nodes){
    const x=sx(node.strike)-barW/2;
    const val = heatMode==='gex'?node.gex:heatMode==='oi'?node.oi*10:node.gex*r(.7,1.3);
    const normalized = val/maxGex;
    const barH = Math.abs(normalized)*plotH*.45;
    const y = normalized>0? zeroY-barH : zeroY;

    let color;
    if(heatMode==='gex'){
      if(node.gex<0){ // Pika — yellow (pin/absorb)
        const intensity = Math.min(1, Math.abs(node.gex)/maxGex);
        color=`rgba(253,224,71,${0.3+intensity*.7})`;
      } else { // Barney — purple (amplify)
        const intensity = Math.min(1, node.gex/maxGex);
        color=`rgba(168,85,247,${0.3+intensity*.7})`;
      }
    } else {
      const intensity = Math.abs(normalized);
      color=`rgba(0,212,255,${0.2+intensity*.7})`;
    }

    ctx.fillStyle=color;
    ctx.fillRect(x, y, barW, barH);

    // King node glow
    if(node.isKing&&heatMode==='gex'){
      ctx.shadowColor='#fde047'; ctx.shadowBlur=16;
      ctx.fillStyle='rgba(253,224,71,.9)';
      ctx.fillRect(x,y,barW,barH);
      ctx.shadowBlur=0;
      // Crown label
      ctx.fillStyle='#fde047'; ctx.font='bold 10px IBM Plex Mono,monospace';
      ctx.textAlign='center'; ctx.fillText('★KING', x+barW/2, y-6);
    }

    // Strike label
    ctx.fillStyle='rgba(138,155,176,.7)'; ctx.font='10px IBM Plex Mono,monospace';
    ctx.textAlign='center';
    if(nodes.length<=20) ctx.fillText(node.strike, x+barW/2, H-margin.bottom+14);
  }

  // Current price line
  const px=sx(price);
  ctx.strokeStyle='rgba(0,232,122,.8)'; ctx.lineWidth=1.5;
  ctx.setLineDash([6,3]);
  ctx.beginPath(); ctx.moveTo(px,margin.top); ctx.lineTo(px,H-margin.bottom); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='rgba(0,232,122,.9)'; ctx.font='bold 11px IBM Plex Mono,monospace';
  ctx.textAlign='center'; ctx.fillText('$'+price.toFixed(0), px, margin.top-5);

  // Y-axis labels
  ctx.fillStyle='rgba(138,155,176,.5)'; ctx.font='9px IBM Plex Mono,monospace';
  ctx.textAlign='right';
  ctx.fillText(heatMode==='oi'?'High OI':'Pika (Pin)', margin.left-6, zeroY-plotH*.4);
  ctx.fillText(heatMode==='oi'?'Low OI':'Barney (Expl.)', margin.left-6, zeroY+plotH*.45);
}

function buildHeatTickerList() {
  let html='';
  for(const sym of HEAT_TICKERS){
    const pd=priceCache[sym]||MOCK_PRICES[sym]||{p:0,c:0,pct:0};
    const up=pd.pct>=0;
    html+=`<div class="heat-ticker-item${sym===heatTicker?' active':''}" onclick="setHeatTicker('${sym}',this)">
      <span class="ht-sym">${sym}</span>
      <div class="ht-meta">
        <div class="ht-price">$${(pd.p||0).toFixed(2)}</div>
        <div class="ht-chg ${up?'up':'dn'}">${up?'▲ +':'▼ '}${(pd.pct||0).toFixed(2)}%</div>
      </div>
    </div>`;
  }
  document.getElementById('heatTickerList').innerHTML=html;
}

function setHeatTicker(sym, el) {
  heatTicker=sym;
  document.querySelectorAll('.heat-ticker-item').forEach(e=>e.classList.remove('active'));
  if(el) el.classList.add('active');
  const pd=priceCache[sym]||MOCK_PRICES[sym]||{p:0,pct:0};
  document.getElementById('heatTicker').textContent=sym;
  document.getElementById('heatPrice').textContent='$'+(pd.p||0).toFixed(2);
  heatData=buildHeatData(sym);
  if(heatMode==='trinity') renderTrinity();
  else renderHeatCanvas();
}

function setHeatMode(mode, btn) {
  heatMode=mode;
  document.querySelectorAll('.heat-toolbar .exp-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  heatData=buildHeatData(heatTicker);
  if(mode==='trinity') {
    document.getElementById('singleCanvasWrap').style.display='none';
    document.getElementById('trinityWrap').style.display='flex';
    document.getElementById('heatLegend').style.display='none';
    document.getElementById('trinityLegend').style.display='flex';
    renderTrinity();
  } else {
    document.getElementById('singleCanvasWrap').style.display='';
    document.getElementById('trinityWrap').style.display='none';
    document.getElementById('heatLegend').style.display='';
    document.getElementById('trinityLegend').style.display='none';
    renderHeatCanvas();
  }
}

// ═══════════════════════════════════════════
//  TRINITY MODE ENGINE
// ═══════════════════════════════════════════
function buildTrinityData(sym) {
  const price = (priceCache[sym]||MOCK_PRICES[sym]||{p:200}).p;
  const step = price<100?1:price<300?5:price<700?10:25;
  const center = Math.round(price/step)*step;
  const nodes = [];

  // Seeded structure for consistency
  for(let i=-12;i<=12;i++){
    const strike = center+i*step;
    const dist = (strike-price)/price; // signed distance
    const absDist = Math.abs(dist);

    // GEX — yellow=pin(neg), purple=explode(pos)
    let gex;
    if(i===2)       gex = -(r(9000,15000));   // King node — Pika
    else if(i===-3) gex = r(5500,9000);        // Barney
    else if(i===6)  gex = -(r(3000,6000));     // Secondary pika
    else if(i===-6) gex = r(2000,4500);        // Secondary barney
    else            gex = (Math.random()-.52)*r(400,3500)*(1/(absDist*8+1));

    // Vanna — positive = IV rise pushes delta up (bullish), negative = bearish
    // Vanna peaks at ~0.15-0.25 OTM strikes
    let vanna;
    const vannaSign = dist>0?1:-1; // calls OTM have +vanna, puts OTM have -vanna
    if(absDist>0.005 && absDist<0.08)
      vanna = vannaSign * r(1500,5000) * (1 - absDist/0.08);
    else if(absDist>=0.08 && absDist<0.18)
      vanna = vannaSign * r(500,2000) * (0.5 - (absDist-0.08)/0.1*0.5);
    else
      vanna = (Math.random()-.5)*r(100,800);

    // Charm — time decay delta drift; negative at calls, positive at puts near ATM
    const charm = -vannaSign * r(200,1800) * Math.exp(-absDist*15) + (Math.random()-.5)*400;

    // Delta exposure — net dealer delta hedge requirement
    let dex;
    if(i===2)       dex = r(6000,10000);     // Long delta needed (dealers short calls)
    else if(i===-3) dex = -r(4000,8000);     // Short delta needed
    else            dex = (Math.random()-.45)*r(500,4000)*(1/(absDist*6+1));

    // Net flow — premium in bull vs bear orders
    const flowBull = r(50,500) * (1/(absDist*5+1)) * (Math.random()>.4?1.5:0.5);
    const flowBear = r(50,500) * (1/(absDist*5+1)) * (Math.random()>.4?1.5:0.5);
    const netFlow = flowBull - flowBear + (i===2?r(300,800):i===-3?-r(200,600):0);

    // Composite score: weighted average of all 4 signals normalized
    nodes.push({
      strike, i,
      gex:+gex.toFixed(0),
      vanna:+vanna.toFixed(0),
      charm:+charm.toFixed(0),
      dex:+dex.toFixed(0),
      netFlow:+netFlow.toFixed(0),
      isKing:i===2,
    });
  }

  // Compute composite
  const maxG=Math.max(...nodes.map(n=>Math.abs(n.gex)));
  const maxV=Math.max(...nodes.map(n=>Math.abs(n.vanna)));
  const maxD=Math.max(...nodes.map(n=>Math.abs(n.dex)));
  const maxF=Math.max(...nodes.map(n=>Math.abs(n.netFlow)));
  nodes.forEach(n=>{
    // composite: -1 (max bearish) to +1 (max bullish)
    const gN = -n.gex/maxG;       // positive GEX=barney=bearish pressure
    const vN = n.vanna/maxV;
    const dN = n.dex/maxD;
    const fN = n.netFlow/maxF;
    n.composite = (gN*0.35 + vN*0.20 + dN*0.30 + fN*0.15);
  });

  return {price, step, nodes};
}

// Draw a single trinity sub-chart
// ═══════════════════════════════════════════
//  TRINITY MODE — TABLE VIEW
// ═══════════════════════════════════════════
function renderTrinity() {
  const td = buildTrinityData(heatTicker);
  const { price, nodes } = td;

  const maxGex   = Math.max(...nodes.map(n => Math.abs(n.gex)))    || 1;
  const maxVanna = Math.max(...nodes.map(n => Math.abs(n.vanna)))  || 1;
  const maxCharm = Math.max(...nodes.map(n => Math.abs(n.charm)))  || 1;
  const maxDex   = Math.max(...nodes.map(n => Math.abs(n.dex)))    || 1;
  const maxFlow  = Math.max(...nodes.map(n => Math.abs(n.netFlow)))|| 1;
  const BAR_MAX  = 48;

  document.getElementById('trinityThead').innerHTML = `
    <tr class="th-group">
      <th class="th-strike" rowspan="2" style="vertical-align:middle;text-align:center;background:var(--bg2)">STRIKE</th>
      <th colspan="2" class="th-gex-g">&#x2B23; GEX &middot; Gamma Exposure</th>
      <th colspan="3" class="th-vanna-g">&#x25C8; Vanna / Charm</th>
      <th colspan="2" class="th-dex-g">&Delta; Delta Exposure</th>
      <th colspan="2" class="th-flow-g">&#x26A1; Net Flow</th>
      <th colspan="2" class="th-comp-g">&#x25CE; Composite</th>
    </tr>
    <tr class="th-cols">
      <th class="td-gex th-gex-g" style="min-width:100px">GEX Value</th>
      <th class="td-gex th-gex-g" style="min-width:80px">Type</th>
      <th class="td-vanna th-vanna-g" style="min-width:100px">Vanna</th>
      <th class="td-vanna th-vanna-g" style="min-width:100px">Charm</th>
      <th class="td-vanna th-vanna-g" style="min-width:76px">V+C Signal</th>
      <th class="td-dex th-dex-g" style="min-width:100px">DEX Value</th>
      <th class="td-dex th-dex-g" style="min-width:72px">Bias</th>
      <th class="td-flow th-flow-g" style="min-width:100px">Net Flow</th>
      <th class="td-flow th-flow-g" style="min-width:72px">Sentiment</th>
      <th class="td-comp th-comp-g" style="min-width:110px">Score</th>
      <th class="td-comp th-comp-g" style="min-width:80px">Signal</th>
    </tr>`;

  let html = '';
  for (const n of nodes) {
    const isAtm  = Math.abs(n.strike - price) < td.step * 0.7;
    const isKing = n.isKing;

    // GEX
    const gexPct   = Math.abs(n.gex) / maxGex;
    const gexType  = n.gex < 0 ? 'Pika &#x1F7E1;' : 'Barney &#x1F7E3;';
    const gexColor = n.gex < 0 ? 'var(--yellow)' : 'var(--purple)';
    const gexBar   = mkBar(gexPct, BAR_MAX, gexColor);

    // Vanna
    const vannaPct   = Math.abs(n.vanna) / maxVanna;
    const vannaColor = n.vanna >= 0 ? 'var(--accent)' : 'var(--red)';
    const vannaBar   = mkBar(vannaPct, BAR_MAX, vannaColor);
    const charmPct   = Math.abs(n.charm) / maxCharm;
    const charmColor = n.charm >= 0 ? '#a3e635' : '#fb923c';
    const charmBar   = mkBar(charmPct, BAR_MAX, charmColor);
    const vcSig      = vcSignal(n.vanna, n.charm);

    // DEX
    const dexPct   = Math.abs(n.dex) / maxDex;
    const dexColor = n.dex >= 0 ? 'var(--green)' : '#f97316';
    const dexBar   = mkBar(dexPct, BAR_MAX, dexColor);
    const dexBias  = n.dex >= 0
      ? '<span class="up">Long &#x2191;</span>'
      : '<span style="color:#f97316">Short &#x2193;</span>';

    // Flow
    const flowPct   = Math.abs(n.netFlow) / maxFlow;
    const flowColor = n.netFlow >= 0 ? 'var(--green)' : 'var(--red)';
    const flowBar   = mkBar(flowPct, BAR_MAX, flowColor);
    const flowSent  = n.netFlow >= 0
      ? '<span class="up">Bull &#x1F7E2;</span>'
      : '<span class="dn">Bear &#x1F534;</span>';

    // Composite
    const cs    = (n.composite * 100).toFixed(1);
    const cAbs  = Math.abs(n.composite);
    const cClr  = n.composite >= 0 ? 'var(--green)' : 'var(--red)';
    const cBar  = mkBar(cAbs, BAR_MAX, cClr);
    const cSig  = compositeSignal(n.composite);

    const strikeTxt = n.strike
      + (isKing ? ' <span class="king-badge">&#x2605;KING</span>' : '')
      + (isAtm  ? ' <span class="atm-badge">ATM</span>' : '');

    html += `<tr class="${isAtm?'tr-atm':''} ${isKing?'tr-king':''}">
      <td class="td-strike">${strikeTxt}</td>
      <td class="td-gex">${gexBar} <span class="dim2" style="font-size:10px">${fmtN(n.gex)}</span></td>
      <td class="td-gex" style="color:${gexColor};font-size:10px;font-weight:500">${gexType}</td>
      <td class="td-vanna">${vannaBar} <span class="dim2" style="font-size:10px">${fmtN(n.vanna)}</span></td>
      <td class="td-vanna">${charmBar} <span class="dim2" style="font-size:10px">${fmtN(n.charm)}</span></td>
      <td class="td-vanna">${vcSig}</td>
      <td class="td-dex">${dexBar} <span class="dim2" style="font-size:10px">${fmtN(n.dex)}</span></td>
      <td class="td-dex">${dexBias}</td>
      <td class="td-flow">${flowBar} <span class="dim2" style="font-size:10px">${fmtN(n.netFlow)}</span></td>
      <td class="td-flow">${flowSent}</td>
      <td class="td-comp">${cBar} <span style="color:${cClr};font-size:10px;font-weight:600">${cs>0?'+':''}${cs}</span></td>
      <td class="td-comp">${cSig}</td>
    </tr>`;
  }
  document.getElementById('trinityTbody').innerHTML = html;
}

function mkBar(pct, maxPx, color) {
  const w = Math.max(2, Math.round(pct * maxPx));
  return `<span style="display:inline-block;width:${w}px;height:8px;background:${color};border-radius:2px;vertical-align:middle"></span>`;
}

function fmtN(v) {
  const a = Math.abs(v);
  if (a >= 1000) return (v>=0?'+':'') + (v/1000).toFixed(1)+'K';
  return (v>=0?'+':'') + v.toFixed(0);
}

function vcSignal(vanna, charm) {
  const v = vanna >= 0, c = charm >= 0;
  if (v && c)   return '<span class="up" style="font-size:10px">&#x2191; Bullish</span>';
  if (!v && !c) return '<span class="dn" style="font-size:10px">&#x2193; Bearish</span>';
  if (v && !c)  return '<span style="color:var(--amber);font-size:10px">&#x2192; Mixed&#x2191;</span>';
  return '<span style="color:var(--amber);font-size:10px">&#x2192; Mixed&#x2193;</span>';
}

function compositeSignal(c) {
  if (c >= 0.5)  return '<span class="up" style="font-weight:600;font-size:10px">Strong Bull</span>';
  if (c >= 0.2)  return '<span class="up" style="font-size:10px">Mild Bull</span>';
  if (c >= -0.1) return '<span style="color:var(--text1);font-size:10px">Neutral</span>';
  if (c >= -0.4) return '<span class="dn" style="font-size:10px">Mild Bear</span>';
  return '<span class="dn" style="font-weight:600;font-size:10px">Strong Bear</span>';
}