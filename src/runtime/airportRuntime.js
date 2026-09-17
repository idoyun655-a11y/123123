import { SimulationCore } from '../simulation/index.js';
import { Gate } from '../resources/gate.js';
import { GateSystem } from '../resources/gateSystem.js';
import { Runway } from '../resources/runway.js';
import { RunwaySystem } from '../resources/runwaySystem.js';
import { FlightSimulationSystem } from '../flights/system.js';
import { PassengerSimulationSystem } from '../passengers/system.js';
import { BaggageHandlingSystem } from '../baggage/system.js';
import { EmployeeSystem } from '../employees/system.js';
import { GroundHandlingSystem } from '../ground/system.js';
import { FacilitySystem } from '../facilities/system.js';
import { Facility, Equipment, FACILITY_TYPES, EQUIPMENT_TYPES } from '../facilities/model.js';
import { createDefaultDataRegistry } from '../data/runtime.js';
import { runRealityCheck } from '../data/realityCheck.js';
import { OperationsQuery } from '../ui/query.js';
import { OperationalEventEngine } from './eventEngine.js';
import { DailyAirportScheduler } from './dailyScheduler.js';

export const RUNTIME_STATUS = Object.freeze({ CREATED:'CREATED', INITIALIZING:'INITIALIZING', READY:'READY', RUNNING:'RUNNING', PAUSED:'PAUSED', STOPPING:'STOPPING', STOPPED:'STOPPED', ERROR:'ERROR' });

class SeededRng {
  constructor(seed = 12345) { this.seed = (Number(seed) >>> 0) || 1; this.initialSeed = this.seed; }
  next() { let x=this.seed; x^=x<<13; x^=x>>>17; x^=x<<5; this.seed=x>>>0; return this.seed/0x100000000; }
}

export class AirportRuntime {
  constructor({ startDate='2026-09-17T00:00:00.000Z', speed=1, scenario='NORMAL', dataVersion='airport-data-2026-v1', seed=12345, autoSchedule=true, dailyFlights=96, passengersPerFlight=130 } = {}) {
    this.options={startDate,speed,scenario,dataVersion,seed,autoSchedule,dailyFlights,passengersPerFlight};
    this.status=RUNTIME_STATUS.CREATED; this.session={sessionId:`session-${Date.now().toString(36)}-${Math.abs(seed)}`,scenarioId:scenario,dataVersion,startDate:new Date(startDate),currentDate:new Date(startDate),currentTime:new Date(startDate),speed,status:RUNTIME_STATUS.CREATED,seed,createdAt:new Date()};
    this.config={dailyFlights,passengersPerFlight,airlines:['Korean Air','Asiana Airlines','Jeju Air'],aircraftTypes:['A321','B787','A350','B737']};
    this.rngEngine=new SeededRng(seed); this.rng=()=>this.rngEngine.next(); this.logs=[]; this.metrics={flights:0,arrivals:0,departures:0,delays:0,passengers:0,baggage:0};
    this.dataRegistry=null; this.simulationCore=null; this.eventEngine=null; this.gateSystem=null; this.runwaySystem=null; this.passengerSystem=null; this.employeeSystem=null; this.baggageSystem=null; this.groundSystem=null; this.facilitySystem=null; this.flightSystem=null; this.scheduler=null; this.realityCheck=null; this.operationsQuery=null; this.operationsRuntime=null;
  }
  initialize() {
    if(this.status!==RUNTIME_STATUS.CREATED&&this.status!==RUNTIME_STATUS.ERROR)throw new Error(`Runtime cannot initialize from ${this.status}`);
    this.status=RUNTIME_STATUS.INITIALIZING; this.session.status=this.status;
    try {
      this.dataRegistry=createDefaultDataRegistry({version:this.options.dataVersion,scenario:this.options.scenario});
      const validation=this.dataRegistry.validate(); if(validation.errors.length)throw new Error(`Data validation failed: ${validation.errors.join('; ')}`);
      this.simulationCore=new SimulationCore({startDate:this.options.startDate,speed:this.options.speed});
      this.eventEngine=new OperationalEventEngine({simulation:this.simulationCore});
      this.passengerSystem=new PassengerSimulationSystem(this.simulationCore,{random:this.rng});
      this.baggageSystem=new BaggageHandlingSystem(this.simulationCore,{passengerSystem:this.passengerSystem,random:this.rng});
      this.employeeSystem=new EmployeeSystem(this.simulationCore,{passengerSystem:this.passengerSystem,queueEngine:this.passengerSystem.queueEngine,random:this.rng});
      this.passengerSystem.attachBaggageSystem(this.baggageSystem);
      this.gateSystem=new GateSystem(this.simulationCore); this.runwaySystem=new RunwaySystem(this.simulationCore);
      this.facilitySystem=new FacilitySystem(this.simulationCore,{queueEngine:this.passengerSystem.queueEngine,employeeSystem:this.employeeSystem,baggageSystem:this.baggageSystem,gateSystem:this.gateSystem,runwaySystem:this.runwaySystem,random:this.rng});
      this.groundSystem=new GroundHandlingSystem(this.simulationCore,{employeeSystem:this.employeeSystem,baggageSystem:this.baggageSystem,facilitySystem:this.facilitySystem}); this.facilitySystem.attachGroundHandlingSystem(this.groundSystem);
      this.flightSystem=new FlightSimulationSystem(this.simulationCore,{gateSystem:this.gateSystem,runwaySystem:this.runwaySystem,passengerSystem:this.passengerSystem,baggageSystem:this.baggageSystem,groundHandlingSystem:this.groundSystem});
      this.#seedAirportResources(); this.#seedEmployees(); this.#seedFacilities();
      this.realityCheck=runRealityCheck({registry:this.dataRegistry,airport:{annualFlights:this.dataRegistry.get('airport.annualFlights.2025'),annualPassengers:this.dataRegistry.get('airport.annualPassengers.2025'),annualPassengerCapacity:this.dataRegistry.get('airport.annualPassengerCapacity'),hourlyPassengerRate:this.dataRegistry.get('airport.hourlyPassengers.2025')},terminals:this.dataRegistry.getDataset('airportMaster')?.terminals??[],gates:this.gateSystem.getGates(),runways:this.runwaySystem.getRunways(),facilities:this.facilitySystem.listFacilities(),employees:{requiredStaff:0,maximumFacilityStaff:Infinity}});
      if(this.realityCheck.status==='ERROR')throw new Error(`Reality check failed: ${this.realityCheck.checks.filter(c=>c.status==='ERROR').map(c=>c.message).join('; ')}`);
      this.scheduler=new DailyAirportScheduler({runtime:this}); if(this.options.autoSchedule)this.scheduler.generateDay(this.session.currentTime);
      this.operationsQuery=new OperationsQuery({simulation:this.simulationCore,systems:{flight:this.flightSystem,gate:this.gateSystem,runway:this.runwaySystem,passenger:this.passengerSystem,baggage:this.baggageSystem,ground:this.groundSystem,employee:this.employeeSystem,facility:this.facilitySystem,queue:this.passengerSystem.queueEngine},dataRegistry:this.dataRegistry});
      this.operationsRuntime=this;
      this.status=RUNTIME_STATUS.READY; this.session.status=this.status; this.logEvent('RUNTIME_READY','SYSTEM','AirportRuntime',this.session.sessionId,{realityStatus:this.realityCheck.status}); return this;
    } catch(error) { this.status=RUNTIME_STATUS.ERROR; this.session.status=this.status; this.error=error; this.logEvent('RUNTIME_ERROR','SYSTEM','AirportRuntime',this.session.sessionId,{message:error.message}); throw error; }
  }
  start(){this.#requireInitialized();if(this.status===RUNTIME_STATUS.RUNNING)return false;if(![RUNTIME_STATUS.READY,RUNTIME_STATUS.PAUSED].includes(this.status))throw new Error(`Cannot start from ${this.status}`);this.simulationCore.resume();this.status=RUNTIME_STATUS.RUNNING;this.session.status=this.status;this.logEvent('RUNTIME_STARTED','SYSTEM','AirportRuntime',this.session.sessionId);return true;}
  pause(){this.#requireInitialized();if(this.status!==RUNTIME_STATUS.RUNNING)return false;this.simulationCore.pause();this.status=RUNTIME_STATUS.PAUSED;this.session.status=this.status;return true;}
  resume(){return this.start();}
  stop(){this.#requireInitialized();if(this.status===RUNTIME_STATUS.STOPPED)return false;this.status=RUNTIME_STATUS.STOPPING;this.session.status=this.status;this.simulationCore.pause();this.status=RUNTIME_STATUS.STOPPED;this.session.status=this.status;this.logEvent('RUNTIME_STOPPED','SYSTEM','AirportRuntime',this.session.sessionId);return true;}
  setSpeed(speed){this.#requireInitialized();this.simulationCore.setSpeed(speed);this.session.speed=speed;return speed;}
  tick(realDeltaMs){this.#requireInitialized();const previousTime=new Date(this.session.currentTime);const snap=this.simulationCore.tick(realDeltaMs);this.session.currentTime=new Date(snap.currentTime);this.session.currentDate=new Date(snap.currentTime);if(this.scheduler&&previousTime.toISOString().slice(0,10)!==this.session.currentTime.toISOString().slice(0,10))this.scheduler.generateDay(this.session.currentTime);this.metrics.flights=this.flightSystem.getFlights().length;this.metrics.arrivals=this.flightSystem.getFlights().filter(f=>f.origin!=='ICN'&&f.status!=='SCHEDULED').length;this.metrics.departures=this.flightSystem.getFlights().filter(f=>f.destination!=='ICN').length;this.metrics.delays=this.flightSystem.getFlights().filter(f=>f.delayMinutes>0).length;this.metrics.passengers=this.passengerSystem.getPassengers().length;this.metrics.baggage=this.baggageSystem.listBaggage().length;return snap;}
  snapshot(){this.#requireInitialized();return Object.freeze({runtime:{...this.session,status:this.status,currentTime:new Date(this.session.currentTime)},simulation:this.simulationCore.getSnapshot(),flights:this.flightSystem.getFlights(),passengers:this.passengerSystem.getPassengers(),baggage:this.baggageSystem.listBaggage(),gates:this.gateSystem.getGates(),runways:this.runwaySystem.getRunways(),employees:this.employeeSystem.listEmployees(),ground:this.groundSystem.listTasks(),facilities:this.facilitySystem.listFacilities(),equipment:this.facilitySystem.listEquipment(),maintenance:this.facilitySystem.listMaintenanceTasks(),alerts:this.eventEngine.recent(100),kpis:this.kpis()});}
  kpis(){const fs=this.flightSystem.getFlights(),ps=this.passengerSystem.statistics(),bs=this.baggageSystem.statistics?.()??{},gs=this.groundSystem.statistics(),es=this.employeeSystem.statistics(),fac=this.facilitySystem.statistics();return{totalFlights:fs.length,arrivals:fs.filter(f=>f.origin!=='ICN').length,departures:fs.filter(f=>f.destination!=='ICN').length,delays:fs.filter(f=>f.delayMinutes>0).length,totalPassengers:ps.totalPassengers,passengerThroughput:ps.throughput,baggageProcessed:bs.totalBaggage??this.baggageSystem.listBaggage().length,baggageDelay:bs.delayed??0,groundDelay:gs.delayedTasks,equipmentFailures:fac.failedEquipment,maintenanceTasks:fac.maintenanceTasks,staffingRatio:es.staffingRatio,hourlyFlights:fs.filter(f=>new Date(f.scheduledDeparture??0).getUTCDate()===this.session.currentTime.getUTCDate()).length,queueLoad:Object.values(ps.queues).reduce((n,q)=>n+Number(q.waiting??0),0)};}
  logEvent(type,category,sourceType,sourceId,payload={}){const entry={time:new Date(this.session.currentTime??this.options.startDate),type,category,sourceType,sourceId,payload};this.logs.push(entry);if(this.logs.length>5000)this.logs.splice(0,this.logs.length-5000);this.simulationCore?.logger?.info?.(type,payload);return entry;}
  getEventLog(limit=100){return this.logs.slice(-limit);}
  #seedAirportResources(){const master=this.dataRegistry.getDataset('airportMaster');for(const r of master.runways)this.runwaySystem.addRunway(new Runway(r));const terminals=['T1','T2'];for(let i=1;i<=48;i++){const terminal=i<=24?'T1':'T2';this.gateSystem.addGate(new Gate({gateId:`${terminal}-G${String(i<=24?i:i-24).padStart(2,'0')}`,terminalId:terminal,gateType:'PASSENGER',compatibleAircraft:['A321','B787','A350','B737'],jetBridge:true,sourceType:'ESTIMATED'}));}}
  #seedEmployees(){const roles=['GroundHandler','BaggageHandler','CheckInAgent','SecurityOfficer','BoardingAgent','MaintenanceTechnician'];let n=0;for(const roleId of roles){const role=this.employeeSystem.roles.get(roleId);if(!role)continue;const count=roleId==='GroundHandler'?100:roleId==='BaggageHandler'?40:20;for(let i=0;i<count;i++){const e=this.employeeSystem.hireEmployee({employeeId:`SIM-E-${++n}`,name:`Simulation ${roleId} ${i+1}`,departmentId:role.departmentId,roleId,skillLevel:3,attendance:1,shiftId:i%3===0?'DAY':i%3===1?'EVENING':'NIGHT'});const facility=roleId==='GroundHandler'?`RAMP_T${i%2+1}-G${String(i%24+1).padStart(2,'0')}`:roleId==='BaggageHandler'?'BAGGAGE':roleId==='CheckInAgent'?'CHECK_IN_ZONE':roleId==='SecurityOfficer'?'SECURITY_ZONE':roleId==='BoardingAgent'?'GATE':'MAINTENANCE';try{this.employeeSystem.assignEmployee(e.employeeId,{facilityId:facility,serviceType:role.queueServices?.[0]??null,status:'ACTIVE'});}catch{}}}}
  #seedFacilities(){const defs=[['T1-SECURITY',FACILITY_TYPES.SECURITY_ZONE,'T1 Security','T1',12000],['T2-SECURITY',FACILITY_TYPES.SECURITY_ZONE,'T2 Security','T2',12000],['T1-BAGGAGE',FACILITY_TYPES.BAGGAGE_FACILITY,'T1 Baggage','T1',10000],['T2-BAGGAGE',FACILITY_TYPES.BAGGAGE_FACILITY,'T2 Baggage','T2',10000],['T1-CHECKIN',FACILITY_TYPES.CHECK_IN_ZONE,'T1 Check-in','T1',8000],['T2-CHECKIN',FACILITY_TYPES.CHECK_IN_ZONE,'T2 Check-in','T2',8000]];for(const[facilityId,facilityType,name,terminalId,capacity]of defs)this.facilitySystem.addFacility(new Facility({facilityId,facilityType,name,terminalId,capacity,maxCapacity:capacity,availableCapacity:capacity,sourceType:'ESTIMATED'}));for(let i=0;i<60;i++){const f=i%2?'T2-BAGGAGE':'T1-BAGGAGE';this.facilitySystem.addEquipment(new Equipment({equipmentId:`SIM-EQ-${i+1}`,facilityId:f,equipmentType:EQUIPMENT_TYPES.BAGGAGE_CART,capacity:100,efficiency:0.95,sourceType:'GAME'}));}}
  #requireInitialized(){if(!this.simulationCore||this.status===RUNTIME_STATUS.ERROR||this.status===RUNTIME_STATUS.STOPPED)throw new Error(`Runtime is not active: ${this.status}`);}
}
export function createAirportRuntime(options={}){return new AirportRuntime(options);}
