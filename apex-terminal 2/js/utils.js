// ═══════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════
const r   = (a, b) => Math.random() * (b - a) + a;
const ri  = (a, b) => Math.floor(r(a, b));
const fK  = n => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(Math.floor(n));
const fM  = n => n >= 1e6 ? '$'+(n/1e6).toFixed(2)+'M' : '$'+(n/1000).toFixed(0)+'K';
const fP  = (n, d=2) => (n||0).toFixed(d);
const ts  = () => new Date().toLocaleTimeString();
const tsShort = () => new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});

function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 3000);
}

function setStatus(s) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  dot.className = 'status-dot' + (s==='live'?' live':s==='err'?' err':'');
  txt.textContent = s==='live'?'Live · Polygon.io':s==='err'?'Connection Error':'Mock Mode';
}

function updateTickerBtn(sym, pd) {
  const pe = document.getElementById('tb-price-'+sym);
  const ce = document.getElementById('tb-chg-'+sym);
  if (pe) pe.textContent = '$'+(pd.p||0).toFixed(2);
  if (ce) {
    ce.className = 'ticker-chg '+(pd.pct >= 0 ? 'up' : 'dn');
    ce.textContent = (pd.pct >= 0 ? '▲ +' : '▼ ')+(pd.pct||0).toFixed(2)+'%';
  }
}

function fmtExpLabel(e) {
  const d = new Date(e+'T12:00:00');
  return d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
}
