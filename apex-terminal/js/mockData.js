// ═══════════════════════════════════════════
//  MOCK DATA
// ═══════════════════════════════════════════
function mockExps(sym) {
  const base = new Date('2026-03-16');
  const out = [];
  [5,12,19,26,40,61,96].forEach(d => {
    const dt = new Date(base);
    dt.setDate(dt.getDate() + d);
    out.push(dt.toISOString().slice(0,10));
  });
  return out;
}

function mockChain(sym, exp) {
  const price = (priceCache[sym] || MOCK_PRICES[sym] || {p:200}).p;
  const step = price<50?1:price<200?5:price<600?10:price<2000?25:50;
  const center = Math.round(price/step)*step;
  const rows = [];
  for (let i = -8; i <= 8; i++) {
    const strike = center + i*step;
    const moneyC = Math.max(0, price-strike), moneyP = Math.max(0, strike-price);
    const dC = +Math.min(.99, Math.max(.01, .5+(price-strike)/(step*7))).toFixed(2);
    const dP = +(-Math.min(.99, Math.max(.01, .5+(strike-price)/(step*7)))).toFixed(2);
    const ivC = +(0.22+r(0,.12)).toFixed(3), ivP = +(0.24+r(0,.12)).toFixed(3);
    const cBid = +Math.max(.01, moneyC+r(.1,3)).toFixed(2);
    const pBid = +Math.max(.01, moneyP+r(.1,3)).toFixed(2);
    const cOI = ri(200,20000), pOI = ri(200,20000);
    rows.push({
      strike, itm_c: strike<price, itm_p: strike>price, atm: Math.abs(strike-price)<step*.7,
      c: {iv:ivC, delta:dC, gamma:+(r(.005,.04)).toFixed(4), oi:cOI, vol:ri(10,cOI*.4), bid:cBid, ask:+(cBid+r(.02,.3)).toFixed(2)},
      p: {iv:ivP, delta:dP, gamma:+(r(.005,.04)).toFixed(4), oi:pOI, vol:ri(10,pOI*.4), bid:pBid, ask:+(pBid+r(.02,.3)).toFixed(2)},
    });
  }
  return rows;
}

const MOCK_FLOW_BASE = [
  {ticker:'NVDA',type:'C',strike:'900',exp:'Apr 17',sent:'bull',prem:2400000,size:2840,flags:['sweep','unusual'],detail:'900C 4/17 · 3-leg sweep above ask · Cross-exchange fill'},
  {ticker:'AAPL',type:'P',strike:'205',exp:'Mar 21',sent:'bear',prem:875000,size:5200,flags:['block'],detail:'205P 3/21 · At bid · Institutional block'},
  {ticker:'TSLA',type:'C',strike:'200',exp:'Apr 4',sent:'bull',prem:1100000,size:3100,flags:['sweep'],detail:'200C 4/4 · Above ask · Multi-exchange sweep'},
  {ticker:'SPY',type:'P',strike:'550',exp:'Mar 21',sent:'bear',prem:3200000,size:8400,flags:['block','unusual'],detail:'550P 3/21 · At bid · Whale block · Dark pool correlated'},
  {ticker:'MSFT',type:'C',strike:'425',exp:'May 16',sent:'bull',prem:640000,size:980,flags:['unusual'],detail:'425C 5/16 · Above ask · IV spike 32→41%'},
  {ticker:'QQQ',type:'C',strike:'485',exp:'Apr 17',sent:'bull',prem:920000,size:1200,flags:['sweep'],detail:'485C 4/17 · Above ask · Fast sweep'},
  {ticker:'NVDA',type:'P',strike:'850',exp:'Mar 28',sent:'bear',prem:480000,size:620,flags:['unusual'],detail:'850P 3/28 · Below bid · Unusual OI spike'},
  {ticker:'AAPL',type:'C',strike:'215',exp:'Apr 4',sent:'bull',prem:310000,size:740,flags:[],detail:'215C 4/4 · At ask · Normal flow'},
  {ticker:'TSLA',type:'P',strike:'180',exp:'Mar 28',sent:'bear',prem:760000,size:2200,flags:['sweep'],detail:'180P 3/28 · Fast sweep · At bid'},
  {ticker:'SPY',type:'C',strike:'565',exp:'Apr 17',sent:'bull',prem:1850000,size:3400,flags:['block'],detail:'565C 4/17 · Above ask · Institutional block'},
  {ticker:'META',type:'C',strike:'590',exp:'Apr 17',sent:'bull',prem:520000,size:440,flags:['unusual'],detail:'590C 4/17 · Above ask · Unusual size vs OI'},
  {ticker:'AMZN',type:'P',strike:'185',exp:'Mar 28',sent:'bear',prem:290000,size:820,flags:[],detail:'185P 3/28 · At bid · Normal hedge flow'},
];

function buildMockFlow() {
  const now = new Date();
  return MOCK_FLOW_BASE.map((f, i) => {
    const t = new Date(now);
    t.setMinutes(t.getMinutes() - i*3 - ri(0,2));
    return {...f, time: t.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})};
  });
}

const HM_DATA = {
  Technology:[
    {t:'NVDA',c:2.16,iv:3.2,fl:98},{t:'AAPL',c:.58,iv:.8,fl:72},{t:'MSFT',c:-.45,iv:-.5,fl:44},
    {t:'META',c:1.32,iv:1.9,fl:65},{t:'GOOGL',c:.74,iv:1.1,fl:51},{t:'AMD',c:3.20,iv:4.8,fl:87},{t:'INTC',c:-1.8,iv:-2.1,fl:28}
  ],
  Consumer:[
    {t:'TSLA',c:-2.24,iv:-3.1,fl:92},{t:'AMZN',c:.9,iv:1.3,fl:58},{t:'NFLX',c:1.1,iv:1.6,fl:63},
    {t:'WMT',c:.22,iv:.3,fl:31},{t:'TGT',c:-.88,iv:-1.2,fl:40},{t:'SBUX',c:-.55,iv:-.7,fl:33}
  ],
  Finance:[
    {t:'JPM',c:.65,iv:.9,fl:47},{t:'GS',c:.42,iv:.6,fl:39},{t:'BAC',c:-.32,iv:-.4,fl:29},{t:'BRK.B',c:.18,iv:.2,fl:22}
  ],
};

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
