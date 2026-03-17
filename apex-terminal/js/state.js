// ═══════════════════════════════════════════
//  STATE & CONSTANTS
// ═══════════════════════════════════════════

// ── Polygon.io API key (pre-configured) ──
let apiKey = 'XfZycX1PZlFJ1n6e__s2RxnEUMi6S81J';
let isLive = false;

// ── UI state ──
let curTicker   = 'AAPL';
let curExp      = '';
let flowFilter  = 'all';
let heatMode    = 'gex';
let heatTicker  = 'SPY';
let nexusActive = 0;

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
const MIN_PREMIUM  = 50000;   // $50K minimum to show
const BLOCK_SIZE   = 500;     // contracts = block
const UNUSUAL_MULT = 3;       // vol/OI ratio multiplier = unusual

const TICKERS      = ['AAPL','NVDA','TSLA','SPY','QQQ','MSFT','SPX'];
const HEAT_TICKERS = ['SPY','QQQ','SPX','IWM','AAPL','NVDA','TSLA','MSFT','AMZN','META'];

const MOCK_PRICES = {
  AAPL:{p:212.45,c:1.23, pct:.58},
  NVDA:{p:116.78,c:-3.21,pct:-2.67},
  TSLA:{p:244.52,c:-6.80,pct:-2.71},
  SPY: {p:561.96,c:2.85, pct:.51},
  QQQ: {p:480.22,c:2.10, pct:.44},   // NOTE: will be overridden by live fetch
  MSFT:{p:388.50,c:-1.90,pct:-.49},
  SPX: {p:5615,  c:22,   pct:.39},
  IWM: {p:208.30,c:-.80, pct:-.38},
  AMZN:{p:197.12,c:1.52, pct:.78},
  META:{p:598.45,c:7.20, pct:1.22}
};
// These are fallback values only — live prices from Polygon override them immediately on connect.
