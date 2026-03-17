// ═══════════════════════════════════════════
//  STATE & CONSTANTS
// ═══════════════════════════════════════════

// ── Provider selection ──
// 'polygon' | 'marketdata' | 'tradier'
let provider = 'polygon';

// ── API keys (pre-configured — user can override in header) ──
let apiKeys = {
  polygon:    'XfZycX1PZlFJ1n6e__s2RxnEUMi6S81J',
  marketdata: '',   // paste at marketdata.app
  tradier:    '',   // paste at tradier.com/user/applications
};

// Convenience getter used throughout
function apiKey() { return apiKeys[provider] || ''; }

let isLive = false;

// ── UI state ──
let curTicker   = 'AAPL';
let curExp      = '';
let flowFilter  = 'all';
let heatMode    = 'gex';
let heatTicker  = 'SPY';
let nexusActive = 0;
let chartTicker = 'AAPL';
let chartInterval = 'D';

// ── Data caches ──
let allFlowData = [];
let priceCache  = {};
let heatData    = {};

// ── Flow engine state ──
let flowWS        = null;
let flowPollTimer = null;
let flowSeenIds   = new Set();
let flowRunning   = false;

// ── Watched underlyings ──
const FLOW_WATCH = ['AAPL','NVDA','TSLA','SPY','QQQ','MSFT','AMZN','META','AMD'];

// ── Flow thresholds ──
const MIN_PREMIUM  = 50000;
const BLOCK_SIZE   = 500;
const UNUSUAL_MULT = 3;

const TICKERS      = ['AAPL','NVDA','TSLA','SPY','QQQ','MSFT','SPX'];
const HEAT_TICKERS = ['SPY','QQQ','SPX','IWM','AAPL','NVDA','TSLA','MSFT','AMZN','META'];

// Tradier uses sandbox by default; switch to live when brokerage account is set
const TRADIER_BASE = () => provider === 'tradier' && apiKeys.tradier ? 'https://api.tradier.com/v1' : 'https://sandbox.tradier.com/v1';

const MOCK_PRICES = {
  AAPL:{p:212.45,c:1.23, pct:.58},
  NVDA:{p:116.78,c:-3.21,pct:-2.67},
  TSLA:{p:244.52,c:-6.80,pct:-2.71},
  SPY: {p:561.96,c:2.85, pct:.51},
  QQQ: {p:480.22,c:2.10, pct:.44},
  MSFT:{p:388.50,c:-1.90,pct:-.49},
  SPX: {p:5615,  c:22,   pct:.39},
  IWM: {p:208.30,c:-.80, pct:-.38},
  AMZN:{p:197.12,c:1.52, pct:.78},
  META:{p:598.45,c:7.20, pct:1.22}
};
