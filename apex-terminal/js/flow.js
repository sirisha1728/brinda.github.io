// ═══════════════════════════════════════════
//  FLOWSEEKER — REAL-TIME ENGINE
// ═══════════════════════════════════════════

// ── Classify a raw Polygon options trade into a flow alert row ──
function classifyTrade(trade) {
  const { underlying, type, strike, exp, price, size, premium, iv, oi, delta, conditions, ts } = trade;

  // Sentiment: use delta sign + contract type
  // Calls bought above ask = bullish, puts bought above ask = bearish
  // Conditions: 37 = sweep, 41 = intermarket sweep, 14 = opening, 15 = closing
  const isSweep  = conditions?.some(c => [37, 41, 67].includes(c));
  const isBlock  = size >= BLOCK_SIZE;
  const volOiRatio = oi > 0 ? size / oi : 99;
  const isUnusual  = volOiRatio > UNUSUAL_MULT || premium > 500000;

  const flags = [];
  if (isSweep)  flags.push('sweep');
  if (isBlock)  flags.push('block');
  if (isUnusual) flags.push('unusual');

  // Sentiment heuristic:
  //   Call + delta > 0   → bullish
  //   Put  + delta < 0   → bearish  (put delta is negative)
  //   Premium > $500K    → institutional
  let sent = 'bull';
  if (type === 'C' && delta >= 0)  sent = 'bull';
  if (type === 'C' && delta < 0)   sent = 'bear';   // deep ITM call hedge
  if (type === 'P' && delta <= 0)  sent = 'bear';
  if (type === 'P' && delta > 0)   sent = 'bull';   // deep ITM put = synthetic short covering

  const ivPct = iv > 0 ? (iv * 100).toFixed(0) + '% IV' : '';
  const detail = [
    `${strike}${type} ${exp}`,
    isSweep  ? '· Sweep' : isBlock ? '· Block' : '· Trade',
    `· $${price.toFixed(2)} x ${size.toLocaleString()}`,
    ivPct ? `· ${ivPct}` : '',
  ].filter(Boolean).join(' ');

  return {
    id:      trade.id,
    time:    fmtTradeTime(ts),
    ticker:  underlying,
    type,
    strike,
    exp,
    sent,
    prem:    premium,
    size,
    flags,
    detail,
    price,
    iv,
    delta,
  };
}

function fmtTradeTime(nanos) {
  // Polygon timestamps are in nanoseconds
  const ms = typeof nanos === 'number' && nanos > 1e15 ? nanos / 1e6 : nanos;
  const d  = new Date(ms);
  return isNaN(d) ? tsShort() : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Ingest a classified row into the live feed ──
function ingestFlowRow(row) {
  if (flowSeenIds.has(row.id)) return false;
  flowSeenIds.add(row.id);
  allFlowData.unshift(row);
  if (allFlowData.length > 200) allFlowData.pop();
  return true;
}

// ── WebSocket real-time stream (Polygon Options WebSocket) ──
function startFlowWS() {
  if (flowWS) { flowWS.close(); flowWS = null; }

  const session = marketSession();
  if (session === 'closed') {
    setFlowStatus('closed');
    // Still do a REST poll for recent trades
    startFlowRESTPoll();
    return;
  }

  try {
    flowWS = new WebSocket('wss://socket.polygon.io/options');

    flowWS.onopen = () => {
      flowWS.send(JSON.stringify({ action: 'auth', params: apiKey }));
      setFlowStatus('connecting');
    };

    flowWS.onmessage = (msg) => {
      let events;
      try { events = JSON.parse(msg.data); } catch(e) { return; }

      for (const ev of events) {
        // Authentication response
        if (ev.ev === 'status') {
          if (ev.status === 'auth_success') {
            // Subscribe to options trades for all watched underlyings
            const subs = FLOW_WATCH.map(sym => `T.O:${sym}*`).join(',');
            flowWS.send(JSON.stringify({ action: 'subscribe', params: subs }));
            setFlowStatus('live');
            toast('Flow stream connected ✓', 'success');
          } else if (ev.status === 'auth_failed') {
            setFlowStatus('err');
            toast('Flow WebSocket auth failed', 'error');
          }
          continue;
        }

        // Options trade event
        if (ev.ev === 'T') {
          const sym      = ev.sym || '';
          const parsed   = parseOptionSymbol(sym);
          if (!parsed.underlying) continue;

          const price   = ev.p || 0;
          const size    = ev.s || 0;
          const premium = price * size * 100;
          if (premium < MIN_PREMIUM) continue;

          const raw = {
            id:         sym + (ev.t || Date.now()),
            sym,
            underlying: parsed.underlying,
            type:       parsed.type,
            strike:     parsed.strike,
            exp:        fmtExpLabel(parsed.exp),
            price,
            size,
            premium,
            iv:         ev.iv || 0,
            oi:         ev.oi || 0,
            delta:      ev.d  || 0,
            conditions: ev.c  || [],
            ts:         ev.t  || Date.now() * 1e6,
          };

          const row = classifyTrade(raw);
          const isNew = ingestFlowRow(row);

          if (isNew) {
            // Only re-render if flow panel is visible
            const ap = document.querySelector('.panel.active')?.id;
            if (ap === 'panel-flow') {
              renderFlow();
              flashFirstRow();
            }
            updateFlowBadge();
          }
        }
      }
    };

    flowWS.onerror = () => {
      setFlowStatus('err');
      // Fallback to REST polling
      startFlowRESTPoll();
    };

    flowWS.onclose = () => {
      setFlowStatus('closed');
      flowWS = null;
      // Reconnect after 5s if market is open
      setTimeout(() => {
        if (isLive && marketSession() !== 'closed') startFlowWS();
      }, 5000);
    };

  } catch(e) {
    // WebSocket not supported or blocked – fall back
    startFlowRESTPoll();
  }
}

// ── REST Poll fallback (works on all Polygon tiers, delayed) ──
function startFlowRESTPoll() {
  if (flowPollTimer) clearInterval(flowPollTimer);

  const session = marketSession();
  const interval = session === 'market' ? 20000 : 60000; // 20s market, 60s extended

  async function poll() {
    setFlowStatus(session === 'closed' ? 'closed' : 'polling');
    for (const sym of FLOW_WATCH.slice(0, 5)) { // limit to 5 to avoid rate limit
      try {
        const trades = await fetchFlowTrades(sym);
        let gotNew = false;
        for (const t of trades) {
          const row = classifyTrade(t);
          if (ingestFlowRow(row)) gotNew = true;
        }
        if (gotNew) {
          const ap = document.querySelector('.panel.active')?.id;
          if (ap === 'panel-flow') renderFlow();
          updateFlowBadge();
        }
      } catch(e) { /* skip */ }
    }
  }

  poll(); // immediate first fetch
  flowPollTimer = setInterval(poll, interval);
}

// ── Start the appropriate flow engine depending on plan ──
function startFlowEngine() {
  if (flowRunning) return;
  flowRunning = true;

  // Try WebSocket first; it will fall back to REST on auth failure
  startFlowWS();

  // Also do an immediate REST scan for top-of-session historical trades
  setTimeout(async () => {
    for (const sym of FLOW_WATCH.slice(0, 4)) {
      try {
        const trades = await fetchFlowTrades(sym);
        for (const t of trades) ingestFlowRow(classifyTrade(t));
      } catch(e) {}
    }
    const ap = document.querySelector('.panel.active')?.id;
    if (ap === 'panel-flow') renderFlow();
    updateFlowBadge();
  }, 1500);
}

function stopFlowEngine() {
  if (flowWS) { flowWS.close(); flowWS = null; }
  if (flowPollTimer) { clearInterval(flowPollTimer); flowPollTimer = null; }
  flowRunning = false;
}

// ── Flow status indicator ──
function setFlowStatus(s) {
  const el = document.getElementById('flowStatus');
  if (!el) return;
  const map = {
    live:       ['#22c55e', '● Live stream'],
    polling:    ['#00d4ff', '◎ Polling'],
    connecting: ['#ffb020', '○ Connecting...'],
    closed:     ['#4a5a6a', '— Market closed'],
    err:        ['#ff4560', '✕ Stream error'],
    mock:       ['#4a5a6a', '◌ Simulated'],
  };
  const [color, label] = map[s] || map.mock;
  el.style.color = color;
  el.textContent = label;
}

let flowNewCount = 0;
function updateFlowBadge() {
  flowNewCount++;
  const badge = document.getElementById('flowNewBadge');
  if (badge) {
    badge.textContent = flowNewCount > 99 ? '99+' : String(flowNewCount);
    badge.style.display = '';
  }
}

function flashFirstRow() {
  const rows = document.querySelectorAll('.flow-row');
  if (rows[0]) {
    rows[0].classList.add('new-row');
    setTimeout(() => rows[0]?.classList.remove('new-row'), 700);
  }
}

// ── Render flow table ──
function renderFlow() {
  // Reset new badge when user views the panel
  flowNewCount = 0;
  const badge = document.getElementById('flowNewBadge');
  if (badge) badge.style.display = 'none';

  let data = allFlowData;
  if (flowFilter === 'call')    data = data.filter(d => d.type === 'C');
  else if (flowFilter === 'put') data = data.filter(d => d.type === 'P');
  else if (flowFilter === 'sweep')   data = data.filter(d => d.flags.includes('sweep'));
  else if (flowFilter === 'block')   data = data.filter(d => d.flags.includes('block'));
  else if (flowFilter === 'unusual') data = data.filter(d => d.flags.includes('unusual'));
  else if (flowFilter === 'bull')    data = data.filter(d => d.sent === 'bull');
  else if (flowFilter === 'bear')    data = data.filter(d => d.sent === 'bear');

  document.getElementById('flowCount').textContent = data.length + ' alerts';

  if (!data.length) {
    document.getElementById('flowList').innerHTML = '<div class="loader">Waiting for flow data... (market hours only)</div>';
    return;
  }

  let html = '';
  for (const row of data) {
    const tb = row.type === 'C'
      ? '<span class="badge badge-call">CALL</span>'
      : '<span class="badge badge-put">PUT</span>';
    const sb = row.sent === 'bull'
      ? '<span class="badge badge-bull">Bull</span>'
      : '<span class="badge badge-bear">Bear</span>';
    const fh = row.flags.map(f =>
      f === 'sweep'   ? '<span class="badge badge-sweep">sweep</span>' :
      f === 'block'   ? '<span class="badge badge-block">block</span>' :
      f === 'unusual' ? '<span class="badge badge-unusual">unusual</span>' :
                        `<span class="badge badge-unusual">${f}</span>`
    ).join(' ');

    html += `<div class="flow-row">
      <div class="dim2" style="font-size:10px">${row.time}</div>
      <div style="font-weight:600">${row.ticker}</div>
      <div>${tb}</div>
      <div class="dim" style="font-size:10px">${row.strike} · ${row.exp}</div>
      <div>${sb}</div>
      <div class="${row.prem >= 1e6 ? 'prem-big' : 'dim'}">${fM(row.prem)}</div>
      <div class="dim">${(row.size || 0).toLocaleString()}</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap">${fh}</div>
      <div class="dim2" style="font-size:10px">${row.detail}</div>
    </div>`;
  }
  document.getElementById('flowList').innerHTML = html;
}

function filterFlow(f, btn) {
  flowFilter = f;
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFlow();
}

// Legacy mock tick — kept for when market is closed
function tickFlow() {
  if (isLive) return; // skip mock ticks when live
  const base = MOCK_FLOW_BASE[ri(0, MOCK_FLOW_BASE.length)];
  const newRow = { ...base, id: 'mock-' + Date.now(), time: tsShort(), prem: base.prem * (1 + r(-.1, .3)) };
  allFlowData.unshift(newRow);
  if (allFlowData.length > 100) allFlowData.pop();
  renderFlow();
  flashFirstRow();
}
