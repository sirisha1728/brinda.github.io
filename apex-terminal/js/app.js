// ═══════════════════════════════════════════
//  PANEL SWITCHING
// ═══════════════════════════════════════════
function switchPanel(panel, btn) {
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-'+panel).classList.add('active');
  if(panel==='chain') renderChain();
  if(panel==='flow') { allFlowData=buildMockFlow(); renderFlow(); }
  if(panel==='heat') { buildHeatTickerList(); setHeatTicker(heatTicker,null); }
  if(panel==='nexus') { renderNexusSidebar(); renderNexusMain(); }
}

// ═══════════════════════════════════════════
//  INIT & REFRESH LOOP
// ═══════════════════════════════════════════
async function refreshAll() {
  await refreshPrices();
  const activePanel = document.querySelector('.panel.active').id.replace('panel-','');
  if(activePanel==='chain') await renderChain();
  if(activePanel==='flow') { allFlowData=buildMockFlow(); renderFlow(); }
  if(activePanel==='heat') { buildHeatTickerList(); heatData=buildHeatData(heatTicker); if(heatMode==='trinity') renderTrinity(); else renderHeatCanvas(); }
  if(activePanel==='nexus') { renderNexusSidebar(); renderNexusMain(); }
}

async function init() {
  await refreshPrices();
  allFlowData=buildMockFlow();
  await renderChain();
  // Background ticks
  setInterval(()=>{ refreshPrices(); }, 30000);
  setInterval(()=>{
    const ap=document.querySelector('.panel.active').id.replace('panel-','');
    if(ap==='flow') tickFlow();
    if(ap==='heat') { heatData=buildHeatData(heatTicker); if(heatMode==='trinity') renderTrinity(); else renderHeatCanvas(); }
    if(ap==='nexus') renderNexusMain();
  }, 15000);
  // Resize canvas
  window.addEventListener('resize',()=>{
    if(document.getElementById('panel-heat').classList.contains('active')) {
      if(heatMode==='trinity') renderTrinity(); else renderHeatCanvas();
    }
  });
}

init();