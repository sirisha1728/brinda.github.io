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
  if (panel === 'heat') {
    // Sync to active chain ticker
    if (curTicker && curTicker !== heatTicker) heatTicker = curTicker;
    buildHeatTickerList();
    setHeatTicker(heatTicker, null);   // always fetches fresh price
  }
  if (panel === 'nexus') {
    if (nexusSignalCache.length) { renderNexusSidebar(); renderNexusMain(); }
    else refreshNexus();
  }
}

// ═══════════════════════════════════════════
//  PRICE REFRESH  (called every 30s + on connect)
// ═══════════════════════════════════════════
async function refreshPrices() {
  if (isLive) {
    try {
      // Single bulk call covers ticker bar + all heat tickers
      const allSyms = [...new Set([
        ...TICKERS.filter(t => t !== 'SPX'),
        ...HEAT_TICKERS.filter(t => t !== 'SPX'),
      ])];
      const prices = await polySnapshotAll(allSyms);
      for (const [sym, pd] of Object.entries(prices)) {
        priceCache[sym] = pd;
        updateTickerBtn(sym, pd);
      }
      // Individual extended-hours fetch for the current active tickers
      // (polySnapshotAll uses lastTrade which already covers extended hours)
      const activeSym = curTicker;
      if (activeSym && priceCache[activeSym]) {
        updateTickerBtn(activeSym, priceCache[activeSym]);
      }
      // Update HeatSeeker price label if visible
      if (heatTicker && priceCache[heatTicker]) {
        const htEl = document.getElementById('heatPrice');
        if (htEl) htEl.textContent = '$' + priceCache[heatTicker].p.toFixed(2);
      }
    } catch(e) {}
  } else {
    // Mock: jitter prices slightly so ticker bar feels alive
    for (const [sym, pd] of Object.entries(MOCK_PRICES)) {
      const jitter = {
        ...pd,
        p:   +(pd.p * (1 + r(-.001, .001))).toFixed(2),
        c:   +(pd.c + r(-.05, .05)).toFixed(2),
        pct: +(pd.pct + r(-.02, .02)).toFixed(2),
        prevClose: pd.p,
        fetchedAt: Date.now(),
      };
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
  const s   = marketSession();
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
//  REFRESH ALL  (called after connect + every 30s)
// ═══════════════════════════════════════════
async function refreshAll() {
  await refreshPrices();
  await refreshMarketStats();
  const ap = document.querySelector('.panel.active').id.replace('panel-', '');
  if (ap === 'chain') await renderChain();
  if (ap === 'depth') await renderDepth();
  if (ap === 'flow')  renderFlow();
  if (ap === 'heat') {
    buildHeatTickerList();
    await setHeatTicker(heatTicker, null);  // fetches fresh price then renders
  }
  if (ap === 'nexus') await refreshNexus();
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
async function init() {
  // 1. Seed priceCache with mock so ticker bar renders immediately (no blank state)
  for (const [sym, pd] of Object.entries(MOCK_PRICES)) {
    priceCache[sym] = { ...pd, prevClose: pd.p, fetchedAt: 0 };
    updateTickerBtn(sym, pd);
  }
  updateSessionBadge();

  // 2. Render chain with mock data instantly so UI isn't empty
  allFlowData = buildMockFlow();
  await renderChain();

  // 3. Auto-connect: warmCache() inside autoConnect() replaces mock with live before any re-render
  await autoConnect();

  // 4. Background refresh loops
  setInterval(refreshPrices, 30000);       // prices every 30s
  setInterval(refreshMarketStats, 60000);  // VIX/PCR every 60s

  setInterval(async () => {
    const ap = document.querySelector('.panel.active').id.replace('panel-', '');
    if (ap === 'flow' && !isLive) tickFlow();
    if (ap === 'heat') {
      // Re-fetch price then re-render (catches extended hours drift)
      if (isLive) {
        try {
          const fresh = await getExtendedQuote(heatTicker);
          priceCache[heatTicker] = fresh;
          updateTickerBtn(heatTicker, fresh);
          const htEl = document.getElementById('heatPrice');
          if (htEl) htEl.textContent = '$' + fresh.p.toFixed(2);
        } catch(e) {}
      }
      heatData = buildHeatData(heatTicker);
      if (heatMode === 'trinity') renderTrinity(); else renderHeatCanvas();
    }
    if (ap === 'nexus' && isLive && (Date.now() - nexusLastRefresh > 300000)) refreshNexus();
  }, 15000);

  // 5. Canvas resize handler
  window.addEventListener('resize', () => {
    const hp = document.getElementById('panel-heat');
    if (hp?.classList.contains('active')) {
      if (heatMode === 'trinity') renderTrinity(); else renderHeatCanvas();
    }
  });
}

init();
