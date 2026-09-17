import { createAirportRuntime, RUNTIME_STATUS } from '../src/runtime/index.js';
import { OperationsQuery } from '../src/ui/query.js';
import { AlertCenter } from '../src/ui/alerts.js';
import { OperationsCommandBus } from '../src/ui/commands.js';
import { buildOperationsViewModel, createTimeSeries, appendTimeSeries } from '../src/ui/viewModel.js';
import { SIMULATION_SPEEDS } from '../src/simulation/index.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const upper = v => String(v ?? '').toUpperCase();
const fmt = v => new Intl.NumberFormat('en-US').format(Number(v) || 0);

const runtime = createAirportRuntime({ startDate: '2026-09-17T00:00:00.000Z', speed: 10, scenario: 'NORMAL', seed: 120926, autoSchedule: true, dailyFlights: 96, passengersPerFlight: 130 });
const alertCenter = new AlertCenter();
let bootError = null;
try { runtime.initialize(); runtime.start(); } catch (error) { bootError = error; }
const simulation = runtime.simulationCore;
const systems = { flight: runtime.flightSystem, gate: runtime.gateSystem, runway: runtime.runwaySystem, passenger: runtime.passengerSystem, baggage: runtime.baggageSystem, ground: runtime.groundSystem, employee: runtime.employeeSystem, facility: runtime.facilitySystem, queue: runtime.passengerSystem?.queueEngine };
const query = new OperationsQuery({ simulation, systems, dataRegistry: runtime.dataRegistry });
const commands = new OperationsCommandBus({ simulation, alertCenter });
const series = createTimeSeries();
let selected = null; let activeNav = 'OVERVIEW'; let layer = { FLIGHTS: true, GATES: true, RUNWAYS: true, FACILITIES: true }; let vmCache = null; let lastAlertLogSize = 0;

function syncAlerts() {
  const logs = runtime.getEventLog(200); const fresh = logs.slice(lastAlertLogSize); lastAlertLogSize = logs.length;
  for (const log of fresh) {
    const critical = ['RUNTIME_ERROR','EQUIPMENT_FAILURE'].includes(log.type);
    const warning = /DELAY|SHORTAGE|FAILURE|RISK|SURGE/.test(log.type);
    if (critical || warning) alertCenter.ingestEvent({ type: log.type, sourceId: log.sourceId, title: log.type.replaceAll('_',' '), message: JSON.stringify(log.payload ?? {}), severity: critical ? 'CRITICAL' : 'WARNING' });
  }
}
function card(title, value, sub='') { return `<div class="card"><h3>${title}</h3><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`; }
function mapGate(g, i) { return `<button class="gate ${upper(g.status)==='BLOCKED'?'bad':upper(g.status)==='BOARDING'?'warn':''}" style="left:${12+(i*13)%78}%;top:${30+(i*7)%48}%" title="${esc(g.gateId)}" data-type="Gate" data-index="${i}"></button>`; }
function detailHtml(sel) { const i = sel.item ?? {}; const rows = Object.entries(i).filter(([k]) => k !== 'handler').slice(0, 24); return `<div class="detail"><div class="section-title">${esc(sel.type)} DETAIL</div><h2>${esc(i.flightNumber ?? i.gateId ?? i.runwayId ?? i.facilityId ?? i.equipmentId ?? i.employeeId ?? i.taskId ?? i.passengerId ?? i.baggageId ?? sel.type)}</h2>${rows.map(([k,v]) => `<div class="row"><span>${esc(k)}</span><span>${esc(typeof v==='object'?JSON.stringify(v):v)}</span></div>`).join('')}</div>`; }
function select(type, item) { selected = { type, item }; render(); }

function render() {
  if (bootError) { $('#app').innerHTML = `<main class="shell"><section class="drawer"><div class="section-title">RUNTIME ERROR</div><h2>Airport Runtime failed to start</h2><p>${esc(bootError.message)}</p></section></main>`; return; }
  syncAlerts();
  const vm = buildOperationsViewModel(query, alertCenter); vmCache = vm; appendTimeSeries(series, vm);
  const st = vm.state; const time = new Date(st.currentTime).toLocaleString('ko-KR', { hour12: false }); const k = vm.kpi;
  $('#app').innerHTML = `<header class="top"><div class="brand">ICN / OPERATIONS CONTROL CENTER</div><div class="clock">${esc(time)}</div><div class="chip">RUNTIME <b>${esc(runtime.status)}</b></div><div class="chip">SIM <b>${st.speed}x</b></div><div class="chip">FLIGHTS <b>${k.activeFlights}</b></div><div class="chip">DELAYED <b class="status-${k.delayedFlights?'warn':'good'}">${k.delayedFlights}</b></div><div class="chip">PASSENGERS <b>${fmt(k.totalPassengers)}</b></div><div class="chip">ALERTS <b>${vm.alerts.length}</b></div><input id="search" class="search" placeholder="Search Flight / Gate / Facility / Equipment..."/><div class="controls"><button class="btn" id="pause">${st.status==='running'?'Pause':'Resume'}</button>${SIMULATION_SPEEDS.map(s=>`<button class="btn ${st.speed===s?'active':''}" data-speed="${s}">${s}x</button>`).join('')}</div></header><main class="shell"><aside><div class="nav-title">OPERATIONS</div><div class="nav">${['OVERVIEW','FLIGHTS','PASSENGERS','BAGGAGE','GROUND','EMPLOYEES','FACILITIES','MAINTENANCE','ALERTS','DATA'].map(n=>`<button class="${activeNav===n?'sel':''}" data-nav="${n}">${n}</button>`).join('')}</div><div class="nav-title alerts">LAYERS</div><div class="nav">${Object.keys(layer).map(n=>`<button data-layer="${n}">◉ ${n} ${layer[n]?'ON':'OFF'}</button>`).join('')}</div><div class="alerts"><div class="section-title">ACTIVE ALERTS</div>${vm.alerts.slice(0,6).map(a=>`<div class="alert-mini ${a.severity.toLowerCase()}" data-alert="${a.alertId}"><b>${a.severity}</b><br>${esc(a.title)}</div>`).join('')}</div></aside><section class="map-wrap"><div class="map"><div class="terminal t1">T1</div><div class="terminal t2">T2</div><div class="concourse">CONCOURSE</div><div class="apron a1">APRON</div><div class="apron a2">APRON</div>${layer.RUNWAYS?runtime.runwaySystem.getRunways().map((r,i)=>`<div class="runway r${i+1}">${esc(r.name)}</div>`).join(''):''}${layer.GATES?vm.gates.slice(0,48).map(mapGate).join(''):''}${layer.FLIGHTS?vm.flights.slice(0,24).map((f,i)=>`<button class="flight-dot" style="left:${20+(i*17)%68}%;top:${22+(i*11)%65}%" title="${esc(f.flightNumber)}" data-type="Flight" data-index="${i}"></button>`).join(''):''}<div class="legend">LIVE MAP / ${Object.entries(layer).filter(([,v])=>v).map(([x])=>x).join(' · ')}</div></div><div class="table"><h3>LIVE FLIGHT BOARD</h3><div class="list">${vm.flights.slice(0,10).map((f,i)=>`<div class="item" data-type="Flight" data-index="${i}"><span><b>${esc(f.flightNumber)}</b> ${esc(f.airline)}<br><span class="meta">${esc(f.origin)} → ${esc(f.destination)} · ${esc(f.gate ?? 'UNASSIGNED')}</span></span><span class="${f.delayMinutes?'status-warn':'status-good'}">${f.delayMinutes?`+${Math.round(f.delayMinutes)}m`:upper(f.status)}</span></div>`).join('')}</div></div></section><section class="drawer ${selected?'':'empty'}">${selected?detailHtml(selected):`<div class="section-title">OPERATIONS DETAIL</div><h2>Integrated Airport Runtime</h2><p>Flight → Passenger → Baggage → Ground → Employee → Facility가 SimulationCore에서 동작합니다.</p><p class="meta">Session ${esc(runtime.session.sessionId)} · Scenario ${esc(runtime.session.scenarioId)} · Data ${esc(runtime.session.dataVersion)} · Seed ${esc(runtime.session.seed)}</p>`}</section><section class="kpi">${card('FLIGHT KPI',fmt(k.activeFlights),`${k.delayedFlights} delayed`)}${card('PASSENGER KPI',fmt(k.totalPassengers),`${fmt(k.activePassengers)} active`)}${card('BAGGAGE KPI',fmt(k.totalBaggage),`${fmt(k.totalBaggage)} total`)}${card('GROUND KPI',fmt(k.activeGroundTasks),'active tasks')}${card('EMPLOYEE KPI',fmt(k.employees),'runtime headcount')}${card('FACILITY KPI',fmt(k.failedEquipment),`${k.maintenanceQueue} maintenance`)}${card('QUEUE',fmt(vm.queues.reduce((n,q)=>n+Number(q.waitingCount??q.length??0),0)),'waiting')}${card('CAPACITY LOSS',fmt(k.capacityLoss),'configured units')}${card('SYSTEM',upper(st.status),'SimulationCore')}</section></main>`;
  bind();
}
function bind() {
  $('#pause')?.addEventListener('click',()=>{commands.execute(simulation.state.status==='running'?'PauseSimulation':'ResumeSimulation'); if(simulation.state.status==='running')runtime.status=RUNTIME_STATUS.RUNNING; else runtime.status=RUNTIME_STATUS.PAUSED; render();});
  document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>{runtime.setSpeed(Number(b.dataset.speed));render();}));
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{activeNav=b.dataset.nav;render();}));
  document.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>{layer[b.dataset.layer]=!layer[b.dataset.layer];render();}));
  document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>{const arr=b.dataset.type==='Flight'?vmCache.flights:b.dataset.type==='Gate'?vmCache.gates:[];if(arr[Number(b.dataset.index)])select(b.dataset.type,arr[Number(b.dataset.index)]);}));
  document.querySelectorAll('[data-alert]').forEach(b=>b.addEventListener('click',()=>select('Alert',alertCenter.alerts.get(b.dataset.alert))));
  $('#search')?.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const r=query.search(e.target.value)[0];if(r)select(r.type,r.item);});
}

render();
setInterval(()=>{ if(!bootError && simulation?.state.status==='running'){ runtime.tick(250); render(); } },250);
