// ═══════════════════════════════════════════
//  FLOWSEEKER
// ═══════════════════════════════════════════
function renderFlow() {
  let data = allFlowData;
  if(flowFilter==='call') data=data.filter(d=>d.type==='C');
  else if(flowFilter==='put') data=data.filter(d=>d.type==='P');
  else if(flowFilter==='sweep') data=data.filter(d=>d.flags.includes('sweep'));
  else if(flowFilter==='block') data=data.filter(d=>d.flags.includes('block'));
  else if(flowFilter==='unusual') data=data.filter(d=>d.flags.includes('unusual'));
  else if(flowFilter==='bull') data=data.filter(d=>d.sent==='bull');
  else if(flowFilter==='bear') data=data.filter(d=>d.sent==='bear');

  document.getElementById('flowCount').textContent=data.length+' alerts';
  if(!data.length){document.getElementById('flowList').innerHTML='<div class="loader">No matching flow</div>';return;}

  let html='';
  for(const row of data){
    const tb=row.type==='C'?'<span class="badge badge-call">CALL</span>':'<span class="badge badge-put">PUT</span>';
    const sb=row.sent==='bull'?'<span class="badge badge-bull">Bull</span>':'<span class="badge badge-bear">Bear</span>';
    const fh=row.flags.map(f=>f==='sweep'?'<span class="badge badge-sweep">sweep</span>':f==='block'?'<span class="badge badge-block">block</span>':'<span class="badge badge-unusual">'+f+'</span>').join(' ');
    html+=`<div class="flow-row">
      <div class="dim2">${row.time}</div>
      <div style="font-weight:600">${row.ticker}</div>
      <div>${tb}</div>
      <div class="dim" style="font-size:10px">${row.strike} · ${row.exp}</div>
      <div>${sb}</div>
      <div class="${row.prem>=1e6?'prem-big':'dim'}">${fM(row.prem)}</div>
      <div class="dim">${(row.size||0).toLocaleString()}</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap">${fh}</div>
      <div class="dim2" style="font-size:10px">${row.detail}</div>
    </div>`;
  }
  document.getElementById('flowList').innerHTML=html;
}

function filterFlow(f,btn) {
  flowFilter=f;
  document.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderFlow();
}

function tickFlow() {
  // Add a new synthetic flow event every ~15 seconds
  const base = MOCK_FLOW_BASE[ri(0,MOCK_FLOW_BASE.length)];
  const newRow = {...base, time:tsShort(), prem:base.prem*(1+r(-.1,.3))};
  allFlowData.unshift(newRow);
  if(allFlowData.length>100) allFlowData.pop();
  renderFlow();
  // Flash first row
  const rows = document.querySelectorAll('.flow-row');
  if(rows[0]) { rows[0].classList.add('new-row'); setTimeout(()=>rows[0].classList.remove('new-row'),700); }
}