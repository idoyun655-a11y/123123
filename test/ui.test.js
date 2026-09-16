import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationCore } from '../src/simulation/index.js';
import { OperationsQuery } from '../src/ui/query.js';
import { AlertCenter } from '../src/ui/alerts.js';
import { OperationsCommandBus } from '../src/ui/commands.js';
import { buildOperationsViewModel, createTimeSeries, appendTimeSeries } from '../src/ui/viewModel.js';

function fixture(){
  const simulation = new SimulationCore({startDate:'2026-09-17T00:00:00Z'});
  const systems={
    flight:{flights:[{flightId:'F1',flightNumber:'KE123',status:'DELAYED',delayMinutes:12}]},
    gate:{gates:[{gateId:'T1-G01',terminalId:'T1',status:'AVAILABLE'}]},
    runway:{runways:[{runwayId:'RWY-1',status:'AVAILABLE'}]},
    passenger:{passengers:[{passengerId:'P1',status:'IN_PROGRESS',type:'DEPARTURE'},{passengerId:'P2',status:'COMPLETED'}]},
    baggage:{baggage:[{baggageId:'B1',status:'DELAYED'}]},
    ground:{tasks:[{taskId:'GT1',status:'IN_PROGRESS'}]},
    employee:{employees:[{employeeId:'E1',status:'WORKING'}]},
    facility:{facilities:[{facilityId:'FAC1',status:'DEGRADED',capacity:100,maxCapacity:100,availableCapacity:70}],equipment:[{equipmentId:'EQ1',status:'FAILED'}],maintenanceTasks:[{taskId:'M1',status:'PENDING'}]},
    queue:{queues:[{queueId:'Q1',waitingCount:7}]}
  };
  return {simulation,systems,query:new OperationsQuery({simulation,systems})};
}

test('TEST 1 Dashboard rendering view model',()=>assert.equal(typeof buildOperationsViewModel(fixture().query,new AlertCenter()),'object'));
test('TEST 2 Simulation Time display source',()=>assert.equal(fixture().query.simulationState().currentTime.toISOString(),'2026-09-17T00:00:00.000Z'));
test('TEST 3 Simulation Speed control',()=>{const {simulation}=fixture();simulation.setSpeed(10);assert.equal(simulation.state.speed,10)});
test('TEST 4 Pause Resume',()=>{const {simulation}=fixture();assert.equal(simulation.resume(),true);assert.equal(simulation.pause(),true)});
test('TEST 5 Flight list',()=>assert.equal(fixture().query.flights().length,1));
test('TEST 6 Flight detail query',()=>assert.equal(fixture().query.flights()[0].flightNumber,'KE123'));
test('TEST 7 Gate status display',()=>assert.equal(fixture().query.gates()[0].status,'AVAILABLE'));
test('TEST 8 Runway status display',()=>assert.equal(fixture().query.runways()[0].status,'AVAILABLE'));
test('TEST 9 Passenger KPI',()=>assert.equal(fixture().query.kpis().totalPassengers,2));
test('TEST 10 Passenger Queue KPI',()=>assert.equal(fixture().query.queues()[0].waitingCount,7));
test('TEST 11 Baggage KPI',()=>assert.equal(fixture().query.baggage().length,1));
test('TEST 12 Ground KPI',()=>assert.equal(fixture().query.kpis().activeGroundTasks,1));
test('TEST 13 Employee KPI',()=>assert.equal(fixture().query.kpis().employees,1));
test('TEST 14 Facility KPI',()=>assert.equal(fixture().query.facilities()[0].status,'DEGRADED'));
test('TEST 15 Equipment KPI',()=>assert.equal(fixture().query.kpis().failedEquipment,1));
test('TEST 16 Alert generation',()=>{const a=new AlertCenter();assert.equal(a.ingestEvent({type:'EQUIPMENT_FAILURE',sourceId:'EQ1'}).severity,'CRITICAL')});
test('TEST 17 Alert severity ordering',()=>{const a=new AlertCenter();a.emit({severity:'INFO',title:'i',message:'i'});a.emit({severity:'CRITICAL',title:'c',message:'c'});assert.equal(a.list()[0].severity,'CRITICAL')});
test('TEST 18 Alert acknowledge',()=>{const a=new AlertCenter();const x=a.emit({title:'x',message:'x'});assert.equal(a.acknowledge(x.alertId).status,'ACKNOWLEDGED')});
test('TEST 19 KPI time series',()=>{const f=fixture();const s=createTimeSeries();appendTimeSeries(s,buildOperationsViewModel(f.query,new AlertCenter()));assert.equal(s.flightDelay.length,1)});
test('TEST 20 Search Flight',()=>assert.equal(fixture().query.search('KE123')[0].type,'Flight'));
test('TEST 21 Search Gate',()=>assert.equal(fixture().query.search('T1-G01')[0].type,'Gate'));
test('TEST 22 Search Facility',()=>assert.equal(fixture().query.search('FAC1')[0].type,'Facility'));
test('TEST 23 Search Equipment',()=>assert.equal(fixture().query.search('EQ1')[0].type,'Equipment'));
test('TEST 24 DataRegistry integration',()=>{const q=new OperationsQuery({dataRegistry:{get:(k,o)=>({key:k,metadata:o})}});assert.equal(q.metadata('airport.name').key,'airport.name')});
test('TEST 25 REAL/ESTIMATED/GAME metadata display access',()=>{const q=new OperationsQuery({dataRegistry:{get:()=>({sourceType:'REAL'})}});assert.equal(q.metadata('x').sourceType,'REAL')});
test('TEST 26 Simulation event UI update source',()=>{const {simulation}=fixture();simulation.resume();simulation.tick(1000);assert.equal(simulation.state.tickCount,1)});
test('TEST 27 Large dataset query performance',()=>{const {query}=fixture();const many=Array.from({length:10000},(_,i)=>({id:`E${i}`}));query.systems.facility.equipment=many;const t=Date.now();query.equipment();assert.ok(Date.now()-t<250)});
test('TEST 28 Existing Simulation regression',()=>assert.equal(typeof fixture().simulation.tick,'function'));
test('TEST 29 Existing Flight regression',()=>assert.equal(fixture().query.flights()[0].flightId,'F1'));
test('TEST 30 Existing Passenger regression',()=>assert.equal(fixture().query.passengers()[0].passengerId,'P1'));
test('TEST 31 Existing Employee regression',()=>assert.equal(fixture().query.employees()[0].employeeId,'E1'));
test('TEST 32 Existing Baggage regression',()=>assert.equal(fixture().query.baggage()[0].baggageId,'B1'));
test('TEST 33 Existing Ground regression',()=>assert.equal(fixture().query.groundTasks()[0].taskId,'GT1'));
test('TEST 34 Existing Facility regression',()=>assert.equal(fixture().query.facilities()[0].facilityId,'FAC1'));
test('TEST 35 Complete Stage 1~10 UI query regression',()=>{const f=fixture();const a=new AlertCenter();const vm=buildOperationsViewModel(f.query,a);assert.equal(vm.kpi.activeFlights,1);assert.equal(vm.kpi.totalPassengers,2);assert.equal(vm.kpi.failedEquipment,1);assert.equal(vm.queues.length,1)});

test('Command layer controls SimulationCore without direct UI mutation',()=>{const {simulation}=fixture();const bus=new OperationsCommandBus({simulation});bus.execute('SetSimulationSpeed',{speed:60});assert.equal(simulation.state.speed,60);bus.execute('ResumeSimulation');assert.equal(simulation.state.status,'running')});
