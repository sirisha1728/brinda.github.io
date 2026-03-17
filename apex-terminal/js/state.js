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
  AAPL:{p:212.45,c:1.23,pct:.58},
  NVDA:{p:875.20,c:18.50,pct:2.16},
  TSLA:{p:183.60,c:-4.20,pct:-2.24},
  SPY: {p:562.10,c:2.85, pct:.51},
  QQQ: {p:478.35,c:3.20, pct:.67},
  MSFT:{p:418.75,c:-1.90,pct:-.45},
  SPX: {p:5620,  c:27,   pct:.49},
  IWM: {p:208.30,c:-.80, pct:-.38},
  AMZN:{p:188.20,c:1.10, pct:.59},
  META:{p:582.40,c:8.20, pct:1.43}
};
