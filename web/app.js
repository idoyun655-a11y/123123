import { SimulationCore, SIMULATION_SPEEDS } from '../src/simulation/index.js';
import { OperationsQuery } from '../src/ui/query.js';
import { AlertCenter } from '../src/ui/alerts.js';
import { OperationsCommandBus } from '../src/ui/commands.js';
import { buildOperationsViewModel, createTimeSeries, appendTimeSeries } from '../src/ui/viewModel.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const upper = v => String(v ?? '').toUpperCase();

function demoRuntime(simulation) {
  const gates = Array.from({length: 18}, (_, i) => ({gateId:`T${i < 10 ? 1 : 2}-G${String(i+1).padStart(2,'0')}`, terminalId:i<10?'T1':'T2', status:i===3?'BLOCKED':i%5===0?'BOARDING':'AVAILABLE', aircraftCompatibility:['A320','A321','B737'], jetBridge:i%4!==0}));
  const runways = ['15L/33R','15R/33L','16L/34R','16R/34L'].map((name,i)=>({runwayId:`RWY-${i+1}`,name,status:i===1?'OCCUPIED':'AVAILABLE',queueCount:i===1?4:0}));
  const flights = Array.from({length:32},(_,i)=>({flightId:`F-${100+i}`,flightNumber:`KE${120+i}`,airline:i%3===0?'Korean Air':i%3===1?'Asiana Airlines':'Jeju Air',aircraft:i%2?'A321':'B787',origin:i%2?'NRT':'ICN',destination:i%2?'ICN':'LAX',status:['APPROACHING','AT_GATE','BOARDING','READY','DELAYED','DEPARTING'][i%6],gateId:gates[i%gates.length].gateId,runwayId:runways[i%4].runwayId,delayMinutes:i%6===4?18:0,passengerCount:120+(i%8)*21}));
  const passengers = Array.from({length:240},(_,i)=>({passengerId:`P-${i+1}`,status:i%9===0?'COMPLETED':'IN_PROGRESS',type:i%4===0?'TRANSFER':i%2?'DEPARTURE':'ARRIVAL',waitMinutes:i%17}));
  const baggage = Array.from({length:180},(_,i)=>({baggageId:`B-${i+1}`,status:['SCREENING','SORTING','LOADED','CLAIMED','DELAYED'][i%5]}));
  const tasks = Array.from({length:50},(_,i)=>({taskId:`GT-${i+1}`,flightId:flights[i%flights.length].flightId,status:['PENDING','ASSIGNED','IN_PROGRESS','COMPLETED','DELAYED'][i%5],taskType:['PUSHBACK','CATERING','BAGGAGELOAD','REFUELING'][i%4]}));
  const employees = Array.from({length:120},(_,i)=>({employeeId:`E-${i+1}`,status:['WORKING','AVAILABLE','BREAK','TRAINING','ABSENT'][i%5],departmentId:['GROUND','SECURITY','BAGGAGE','OPERATIONS'][i%4],productivity:.75+(i%20)/100}));
  const facilities = [{facilityId:'T1-SECURITY',name:'T1 Security',status:'OPERATIONAL',capacity:12000,availableCapacity:10800,maxCapacity:12000},{facilityId:'T2-BHS',name:'T2 Baggage System',status:'DEGRADED',capacity:8000,availableCapacity:5600,maxCapacity:8000},{facilityId:'T1-IMMIGRATION',name:'T1 Immigration',status:'OPERATIONAL',capacity:9000,availableCapacity:9000,maxCapacity:9000}];
  const equipment = Array.from({length:38},(_,i)=>({equipmentId:`EQ-${i+1}`,equipmentType:['BaggageCart','TowTractor','GroundSupportEquipment'][i%3],status:i%19===0?'FAILED':i%11===0?'MAINTENANCE':'OPERATIONAL',health:100-(i%20),capacity:10,efficiency:.9}));
  return { flight:{flights}, gate:{gates}, runway:{runways}, passenger:{passengers}, baggage:{baggage}, ground:{tasks}, employee:{employees}, facility:{facilities,equipment,maintenanceTasks:[]}, queue:{queues:[{queueId:'CHECKIN',name:'Check-in',waitingCount:37},{queueId:'SECURITY',name:'Security',waitingCount:62},{queueId:'IMM-DEP',name:'Departure Immigration',waitingCount:19},{queueId:'IMM-ARR',name:'Arrival Immigration',waitingCount:11}]}, simulation };
}

const simulation = new SimulationCore({startDate:'2026-09-17T14:32:00.000Z',speed:10});
const runtime = window.airportRuntime ?? demoRuntime(simulation);
const alertCenter = new AlertCenter();
const query = new OperationsQuery({simulation, systems:runtime, dataRegistry:window.airportDataRegistry});
const commands = new OperationsCommandBus({simulation, alertCenter});
const series = createTimeSeries();
let selected = null; let layer = {FLIGHTS:true,GATES:true,RUNWAYS:true,FACILITIES:true}; let activeNav='OVERVIEW';

[['EQUIPMENT_FAILURE','T2-BHS','Equipment Failure','BHS equipment degradation detected'],['PASSENGER_QUEUE_SURGE','SECURITY','Passenger Queue Surge','Security queue above operating threshold'],['FLIGHT_DELAY','F-104','Flight Delay','KE124 delay 18 min']].forEach(([type,id,title,message])=>alertCenter.ingestEvent({type,sourceId:id,title,message}));

function detail(type,item){selected={type,item};render();}
function fmt(v){return new Intl.NumberFormat('en-US').format(Number(v)||0)}
function mapGate(g,i){return `<button class="gate ${upper(g.status)==='BLOCKED'?'bad':upper(g.status)==='BOARDING'?'warn':''}" style="left:${12+(i*13)%78}%;top:${30+(i*7)%48}%" title="${esc(g.gateId)}" data-type="Gate" data-index="${i}"></button>`}
function card(title,value,sub=''){return `<div class="card"><h3>${title}</h3><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`}
function render(){
  const vm=buildOperationsViewModel(query,alertCenter); appendTimeSeries(series,vm);
  const st=vm.state; const time=new Date(st.currentTime).toLocaleString('ko-KR',{hour12:false});
  $('#app').innerHTML=`<header class="top"><div class="brand">ICN / OPERATIONS CONTROL CENTER</div><div class="clock">${esc(time)}</div><div class="chip">SIM <b>${st.speed}x</b></div><div class="chip">FLIGHTS <b>${vm.kpi.activeFlights}</b></div><div class="chip">DELAYED <b class="status-${vm.kpi.delayedFlights?'warn':'good'}">${vm.kpi.delayedFlights}</b></div><div class="chip">PASSENGERS <b>${fmt(vm.kpi.totalPassengers)}</b></div><div class="chip">ALERTS <b>${vm.alerts.length}</b></div><input id="search" class="search" placeholder="Search Flight / Gate / Facility..."/><div class="controls"><button class="btn" id="pause">${st.status==='running'?'Pause':'Resume'}</button>${SIMULATION_SPEEDS.map(s=>`<button class="btn ${st.speed===s?'active':''}" data-speed="${s}">${s}x</button>`).join('')}</div></header>
  <main class="shell"><aside><div class="nav-title">OPERATIONS</div><div class="nav">${['OVERVIEW','FLIGHTS','PASSENGERS','BAGGAGE','GROUND','EMPLOYEES','FACILITIES','MAINTENANCE','ALERTS','DATA'].map(n=>`<button class="${activeNav===n?'sel':''}" data-nav="${n}">${n}</button>`).join('')}</div><div class="nav-title alerts">LAYERS</div><div class="nav">${Object.keys(layer).map(n=>`<button data-layer="${n}">◉ ${n} ${layer[n]?'ON':'OFF'}</button>`).join('')}</div><div class="alerts"><div class="section-title">ACTIVE ALERTS</div>${vm.alerts.slice(0,5).map(a=>`<div class="alert-mini ${a.severity.toLowerCase()}" data-alert="${a.alertId}"><b>${a.severity}</b><br>${esc(a.title)}</div>`).join('')}</div></aside>
  <section class="map-wrap"><div class="map"><div class="terminal t1">T1</div><div class="terminal t2">T2</div><div class="concourse">CONCOURSE</div><div class="apron a1">APRON</div><div class="apron a2">APRON</div><div class="runway r1">RWY 15L/33R</div><div class="runway r2">RWY 15R/33L</div><div class="runway r3">RWY 16L/34R</div><div class="runway r4">RWY 16R/34L</div>${layer.GATES?vm.gates.slice(0,18).map(mapGate).join(''):''}${layer.FLIGHTS?vm.flights.slice(0,18).map((f,i)=>`<button class="flight-dot" style="left:${20+(i*17)%68}%;top:${22+(i*11)%65}%" title="${esc(f.flightNumber)}" data-type="Flight" data-index="${i}"></button>`).join(''):''}<div class="legend">MAP / ${Object.entries(layer).filter(([,v])=>v).map(([k])=>k).join(' · ')}</div></div><div class="table"><h3>LIVE FLIGHT BOARD</h3><div class="list">${vm.flights.slice(0,8).map((f,i)=>`<div class="item" data-type="Flight" data-index="${i}"><span><b>${esc(f.flightNumber)}</b> ${esc(f.airline)}<br><span class="meta">${esc(f.origin)} → ${esc(f.destination)} · ${esc(f.gateId)}</span></span><span class="${f.delayMinutes?'status-warn':'status-good'}">${f.delayMinutes?`+${f.delayMinutes}m`:upper(f.status)}</span></div>`).join('')}</div></div></section>
  <section class="drawer ${selected?'':'empty'}">${selected?detailHtml(selected):`<div class="section-title">OPERATIONS DETAIL</div><h2>Select an object</h2><p>지도에서 Flight / Gate를 선택하거나 검색하세요.</p><p class="meta">Runtime 상태는 Simulation Systems에서 조회하고 정적 데이터는 DataRegistry에서 조회합니다.</p>`}</section>
  <section class="kpi">${card('FLIGHT KPI',fmt(vm.kpi.activeFlights),`${vm.kpi.delayedFlights} delayed`)}${card('PASSENGER KPI',fmt(vm.kpi.totalPassengers),`${fmt(vm.kpi.activePassengers)} active`)}${card('BAGGAGE KPI',fmt(vm.kpi.totalBaggage),`${vm.kpi.totalBaggage?Math.round(vm.baggage.filter(b=>upper(b.status)==='DELAYED').length/vm.kpi.totalBaggage*100):0}% delayed`)}${card('GROUND KPI',fmt(vm.kpi.activeGroundTasks),'active tasks')}${card('EMPLOYEE KPI',fmt(vm.kpi.employees),'runtime headcount')}${card('FACILITY KPI',fmt(vm.kpi.failedEquipment),`${vm.kpi.maintenanceQueue} maintenance`)}${card('QUEUE',fmt(vm.queues.reduce((n,q)=>n+Number(q.waitingCount??q.length??0),0)),'waiting passengers')}${card('CAPACITY LOSS',fmt(vm.kpi.capacityLoss),'units / configured capacity')}${card('SYSTEM',upper(st.status),'SimulationCore')}</section></main>`;
  bind();
}
function detailHtml(sel){const i=sel.item;const rows=Object.entries(i).filter(([k])=>!['handler'].includes(k)).slice(0,20);return `<div class="detail"><div class="section-title">${esc(sel.type)} DETAIL</div><h2>${esc(i.flightNumber??i.gateId??i.runwayId??i.facilityId??i.equipmentId??i.employeeId??i.taskId??i.passengerId??i.baggageId??sel.type)}</h2>${rows.map(([k,v])=>`<div class="row"><span>${esc(k)}</span><span>${esc(typeof v==='object'?JSON.stringify(v):v)}</span></div>`).join('')}${sel.type==='Alert'?`<button class="btn" data-ack="${esc(i.alertId)}">Acknowledge</button>`:''}</div>`}
function bind(){
  $('#pause')?.addEventListener('click',()=>{commands.execute(simulation.state.status==='running'?'PauseSimulation':'ResumeSimulation');render()});
  document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>{commands.execute('SetSimulationSpeed',{speed:Number(b.dataset.speed)});render()}));
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{activeNav=b.dataset.nav;render()}));
  document.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>{layer[b.dataset.layer]=!layer[b.dataset.layer];render()}));
  document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>{const arr={Flight:vmCache.flights,Gate:vmCache.gates}[b.dataset.type];if(arr)detail(b.dataset.type,arr[Number(b.dataset.index)]); }));
  document.querySelectorAll('[data-alert]').forEach(b=>b.addEventListener('click',()=>detail('Alert',alertCenter.alerts.get(b.dataset.alert))));
  document.querySelectorAll('[data-ack]').forEach(b=>b.addEventListener('click',()=>{commands.execute('AcknowledgeAlert',{alertId:b.dataset.ack});render()}));
  $('#search')?.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const r=query.search(e.target.value)[0];if(r)detail(r.type,r.item)});
}
let vmCache={flights:[],gates:[]};
const originalRender=render;
function renderCached(){const vm=buildOperationsViewModel(query,alertCenter);vmCache=vm;originalRender()}
render=renderCached;
setInterval(()=>{if(simulation.state.status==='running')simulation.tick(250);render();},250);
render();
