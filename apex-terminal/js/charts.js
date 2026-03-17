// ═══════════════════════════════════════════
//  TRADINGVIEW CHARTS
// ═══════════════════════════════════════════
let tvWidget = null;
let tvScriptLoaded = false;
let tvScriptLoading = false;

function loadTVScript(cb) {
  if (tvScriptLoaded) { cb(); return; }
  if (tvScriptLoading) { setTimeout(() => loadTVScript(cb), 200); return; }
  tvScriptLoading = true;
  const s = document.createElement('script');
  s.src = 'https://s3.tradingview.com/tv.js';
  s.onload = () => { tvScriptLoaded = true; cb(); };
  s.onerror = () => { tvScriptLoading = false; renderTVFallback(); };
  document.head.appendChild(s);
}

function renderCharts() {
  const wrap = document.getElementById('tv-chart-container');
  if (!wrap) return;
  wrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--mono);font-size:12px;color:var(--text2)">Loading TradingView chart...</div>';
  loadTVScript(initTV);
}

function initTV() {
  const wrap = document.getElementById('tv-chart-container');
  if (!wrap) return;
  wrap.innerHTML = '';

  // Map internal symbols to TradingView format
  const tvSym = chartTicker === 'SPX' ? 'SP:SPX' : chartTicker;

  // Interval map: TradingView uses '1','5','15','60','D','W'
  const tvInterval = chartInterval;

  try {
    tvWidget = new TradingView.widget({
      container_id:    'tv-chart-container',
      symbol:          tvSym,
      interval:        tvInterval,
      timezone:        'America/New_York',
      theme:           'dark',
      style:           '1',          // candlestick
      locale:          'en',
      toolbar_bg:      '#0d1117',
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend:     false,
      save_image:      false,
      allow_symbol_change: true,
      withdateranges:  true,
      autosize:        true,
      studies: [
        'Volume@tv-basicstudies',
        'RSI@tv-basicstudies',
        'MACD@tv-basicstudies',
      ],
      overrides: {
        'paneProperties.background':             '#0d1117',
        'paneProperties.vertGridProperties.color': '#162030',
        'paneProperties.horzGridProperties.color': '#162030',
        'symbolWatermarkProperties.transparency': 90,
        'scalesProperties.textColor':            '#4a5a6a',
        'mainSeriesProperties.candleStyle.upColor':   '#00e87a',
        'mainSeriesProperties.candleStyle.downColor': '#ff4560',
        'mainSeriesProperties.candleStyle.borderUpColor':   '#00e87a',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ff4560',
        'mainSeriesProperties.candleStyle.wickUpColor':   '#00e87a',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ff4560',
      },
      loading_screen: { backgroundColor: '#0d1117', foregroundColor: '#00d4ff' },
    });
  } catch(e) {
    renderTVFallback();
  }
}

function renderTVFallback() {
  const wrap = document.getElementById('tv-chart-container');
  if (!wrap) return;
  // Fallback: embed TradingView mini widget via iframe
  const sym = chartTicker === 'SPX' ? 'SP:SPX' : chartTicker;
  wrap.innerHTML = `<iframe
    src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${encodeURIComponent(sym)}&interval=${chartInterval}&theme=dark&style=1&locale=en&enable_publishing=0&allow_symbol_change=1&autosize=1&studies=RSI%40tv-basicstudies,MACD%40tv-basicstudies,Volume%40tv-basicstudies&utm_source=apex-terminal"
    style="width:100%;height:100%;border:none"
    allowtransparency="true"
    frameborder="0"
    scrolling="no"
  ></iframe>`;
}

function setChartTicker(sym, btn) {
  chartTicker = sym;
  document.querySelectorAll('#chart-ticker-btns .exp-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Also sync main ticker bar
  const tickerBtn = document.querySelector(`.ticker-btn[data-sym="${sym}"]`);
  if (tickerBtn) {
    document.querySelectorAll('.ticker-btn').forEach(b => b.classList.remove('active'));
    tickerBtn.classList.add('active');
    curTicker = sym;
  }
  updateChart();
}

function setChartInterval(interval, btn) {
  chartInterval = interval;
  document.querySelectorAll('.chain-toolbar .exp-btn').forEach(b => {
    if (['1m','5m','15m','1H','1D','1W'].includes(b.textContent)) b.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
  updateChart();
}

function updateChart() {
  if (tvWidget && tvWidget.activeChart) {
    try {
      const sym = chartTicker === 'SPX' ? 'SP:SPX' : chartTicker;
      tvWidget.activeChart().setSymbol(sym, chartInterval);
      return;
    } catch(e) {}
  }
  // Full re-render if widget not ready
  renderCharts();
}
