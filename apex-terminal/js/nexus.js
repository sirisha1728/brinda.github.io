// ═══════════════════════════════════════════
//  NEXUS
// ═══════════════════════════════════════════
const NEXUS_SIGNALS = [
  {ticker:'NVDA',score:87,cls:'score-bull',label:'Strongly Bullish',
    desc:'Unusual call sweep at $900 strike across 3 exchanges. $2.4M premium in 30min. IV rank 68th pct. Gamma skew bullish.',
    pcr:.41,ivr:68,gex:'Bullish',flow:'8.7/10'},
  {ticker:'SPY',score:34,cls:'score-bear',label:'Cautiously Bearish',
    desc:'Large 550P block signals institutional hedging. VIX term structure flattening. Gamma flip at 558.',
    pcr:1.28,ivr:44,gex:'Negative',flow:'3.2/10'},
  {ticker:'TSLA',score:22,cls:'score-bear',label:'Bearish',
    desc:'Put sweep at 180 strike. Elevated short interest. Stock below 20-day MA. Options pricing 4.8% move.',
    pcr:1.55,ivr:72,gex:'Negative',flow:'2.8/10'},
  {ticker:'MSFT',score:55,cls:'score-neu',label:'Neutral / Watch',
    desc:'Mixed signals: 425C buying offset by 415P activity. IV subdued near ATH. Watching for breakout.',
    pcr:.88,ivr:31,gex:'Flat',flow:'5.5/10'},
  {ticker:'AAPL',score:61,cls:'score-bull',label:'Mildly Bullish',
    desc:'Steady call flow on 215-220 strikes. Low IV rank suggests cheap premium. Dealer gamma positive above 210.',
    pcr:.72,ivr:28,gex:'Positive',flow:'6.1/10'},
  {ticker:'QQQ',score:58,cls:'score-bull',label:'Mildly Bullish',
    desc:'Tech macro tailwind. 485C sweeps detected. Gamma exposure concentrated 480-490 range acts as support.',
    pcr:.76,ivr:35,gex:'Positive',flow:'5.8/10'},
];

function renderNexusSidebar() {
  let html='';
  for(let i=0;i<NEXUS_SIGNALS.length;i++){
    const s=NEXUS_SIGNALS[i];
    html+=`<div class="nsig${i===nexusActive?' active':''}" onclick="setNexusActive(${i},this)">
      <div class="nsig-head">
        <span class="nsig-tick">${s.ticker}</span>
        <span class="nsig-score ${s.cls}">${s.label}</span>
      </div>
      <div class="nsig-desc">${s.desc.slice(0,70)}...</div>
    </div>`;
  }
  document.getElementById('nexusSigList').innerHTML=html;
}

function setNexusActive(i, el) {
  nexusActive=i;
  document.querySelectorAll('.nsig').forEach(e=>e.classList.remove('active'));
  if(el) el.classList.add('active');
  renderNexusMain();
}

function renderNexusMain() {
  const s=NEXUS_SIGNALS[nexusActive];
  const pd=priceCache[s.ticker]||MOCK_PRICES[s.ticker]||{p:0,c:0,pct:0};
  const up=pd.pct>=0;
  const gexW=s.gex==='Bullish'?75:s.gex==='Positive'?62:s.gex==='Flat'?50:s.gex==='Negative'?32:18;
  const gexC=s.gex.includes('Bull')||s.gex.includes('Pos')?'var(--green)':s.gex==='Flat'?'var(--amber)':'var(--red)';

  document.getElementById('nexusMain').innerHTML=`
    <div class="ncard">
      <div class="ncard-head">
        <span class="ncard-title">${s.ticker} — ${s.label}</span>
        <span class="nsig-score ${s.cls}">${s.score}/100</span>
      </div>
      <div class="ncard-body">
        <div class="metric-grid">
          <div class="metric"><div class="metric-label">Price</div><div class="metric-val">$${(pd.p||0).toFixed(2)}</div></div>
          <div class="metric"><div class="metric-label">Change</div><div class="metric-val ${up?'up':'dn'}">${up?'+':''}${(pd.pct||0).toFixed(2)}%</div></div>
          <div class="metric"><div class="metric-label">IV Rank</div><div class="metric-val">${s.ivr}%</div></div>
          <div class="metric"><div class="metric-label">P/C Ratio</div><div class="metric-val ${s.pcr>1?'dn':'up'}">${s.pcr}</div></div>
        </div>
        <div class="gex-bar-wrap">
          <div class="gex-label-row"><span>GEX Exposure Bias</span><span style="color:${gexC}">${s.gex}</span></div>
          <div class="gex-bar-track"><div class="gex-bar-fill" style="width:${gexW}%;background:${gexC}"></div></div>
        </div>
        <div class="pcr-row">
          <span class="pcr-label">Flow Score</span>
          <span class="pcr-val ${s.score>60?'up':s.score<40?'dn':''}">${s.flow}</span>
          <span class="pcr-label" style="margin-left:20px">Signal Strength</span>
          <span class="pcr-val">${s.score>75?'Strong':s.score>55?'Moderate':'Weak'}</span>
        </div>
      </div>
    </div>
    <div class="ncard">
      <div class="ncard-head"><span class="ncard-title">Analysis Summary</span></div>
      <div class="ncard-body">
        <p style="font-size:12px;color:var(--text1);line-height:1.7">${s.desc}</p>
        <p style="font-size:11px;color:var(--text2);margin-top:10px;font-family:var(--mono)">
          Signal generated at ${ts()} · Based on options flow, GEX analysis, and IV data · Not financial advice.
        </p>
      </div>
    </div>
    <div class="ncard">
      <div class="ncard-head"><span class="ncard-title">Key Levels (Heatseeker)</span></div>
      <div class="ncard-body">
        <div class="metric-grid">
          <div class="metric"><div class="metric-label">King Node</div><div class="metric-val">${(((pd.p||200)*1.01)).toFixed(0)}</div></div>
          <div class="metric"><div class="metric-label">Primary Pin</div><div class="metric-val" style="color:var(--yellow)">${(((pd.p||200)*1.005)).toFixed(0)}</div></div>
          <div class="metric"><div class="metric-label">Exp. Zone</div><div class="metric-val" style="color:var(--purple)">${(((pd.p||200)*.985)).toFixed(0)}</div></div>
          <div class="metric"><div class="metric-label">Gamma Flip</div><div class="metric-val">${(((pd.p||200)*.992)).toFixed(0)}</div></div>
        </div>
      </div>
    </div>`;
}