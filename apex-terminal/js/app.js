// ═══════════════════════════════════════════
//  PANEL SWITCHING
// ═══════════════════════════════════════════
function switchPanel(panel, btn) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + panel).classList.add('active');

  if (panel === 'chain') renderChain();
  if (panel === 'depth') renderDepth();
  if (panel === 'flow') {
    flowNewCount = 0;
    const badge = document.getElementById('flowNewBadge');
    if (badge) badge.style.display = 'none';
    if (!allFlowData.length && !isLive) allFlowData = buildMockFlow();
    renderFlow();
    if (!isLive) setFlowStatus('mock');
  }
  if (panel === 'heat')  {
    // Sync HeatSeeker ticker to whatever's active in FlowChain
    if (curTicker && curTicker !== heatTicker) heatTicker = curTicker;
    buildHeatTickerList();
    setHeatTicker(heatTicker, null);
  }
  if (panel === 'nexus') {
    if (nexusSignalCache.length) { renderNexusSidebar(); renderNexusMain(); }
    else refreshNexus();
  }
}

// ═══════════════════════════════════════════
//  PRICE REFRESH (REST fallback)
// ═══════════════════════════════════════════
async function refreshPrices() {
  if (isLive) {
    try {
      const prices = await polySnapshotAll(TICKERS.filter(t => t !== 'SPX'));
      for (const [sym, pd] of Object.entries(prices)) {
        priceCache[sym] = pd;
        updateTickerBtn(sym, pd);
      }
    } catch(e) {}
  } else {
    for (const [sym, pd] of Object.entries(MOCK_PRICES)) {
      const jitter = { p: pd.p * (1 + r(-.001, .001)), c: pd.c + r(-.05, .05), pct: pd.pct + r(-.02, .02) };
      priceCache[sym] = jitter;
      updateTickerBtn(sym, jitter);
    }
  }
  document.getElementById('update-time').textContent = ts();
  updateSessionBadge();
}

function updateSessionBadge() {
  const el = document.getElementById('sessionBadge');
  if (!el) return;
  const s = marketSession();
  const map = {
    market: ['#22c55e', '● Market Open'],
    pre:    ['#ffb020', '◑ Pre-Market'],
    after:  ['#00d4ff', '◑ After Hours'],
    closed: ['#4a5a6a', '○ Closed'],
  };
  const [color, label] = map[s] || map.closed;
  el.style.color = color;
  el.textContent = label;
}

// ═══════════════════════════════════════════
//  REFRESH ALL
// ═══════════════════════════════════════════
async function refreshAll() {
  await refreshPrices();
  await refreshMarketStats();
  const ap = document.querySelector('.panel.active').id.replace('panel-', '');
  if (ap === 'chain') await renderChain();
  if (ap === 'depth') await renderDepth();
  if (ap === 'flow')  renderFlow();
  if (ap === 'heat')  { buildHeatTickerList(); heatData = buildHeatData(heatTicker); if (heatMode === 'trinity') renderTrinity(); else renderHeatCanvas(); }
  if (ap === 'nexus') await refreshNexus();
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
async function init() {
  // 1. Immediately render mock prices
  for (const [sym, pd] of Object.entries(MOCK_PRICES)) {
    priceCache[sym] = pd;
    updateTickerBtn(sym, pd);
  }
  updateSessionBadge();

  // 2. Mock flow + chain
  allFlowData = buildMockFlow();
  await renderChain();

  // 3. Auto-connect to Polygon
  await autoConnect();

  // 4. Background loops
  setInterval(refreshPrices, 30000);           // REST price refresh every 30s
  setInterval(refreshMarketStats, 60000);      // VIX/PCR every 60s

  setInterval(() => {
    const ap = document.querySelector('.panel.active').id.replace('panel-', '');
    if (ap === 'flow' && !isLive) tickFlow();
    if (ap === 'heat') {
      heatData = buildHeatData(heatTicker);
      if (heatMode === 'trinity') renderTrinity(); else renderHeatCanvas();
    }
    // Nexus auto-refresh every 5 minutes when live
    if (ap === 'nexus' && isLive && (Date.now() - nexusLastRefresh > 300000)) refreshNexus();
  }, 15000);

  // 5. Canvas resize
  window.addEventListener('resize', () => {
    const hp = document.getElementById('panel-heat');
    if (hp?.classList.contains('active')) {
      if (heatMode === 'trinity') renderTrinity(); else renderHeatCanvas();
    }
  });
}

init();
