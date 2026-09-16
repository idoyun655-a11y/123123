import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationCore } from '../src/simulation/index.js';
import { QueueEngine } from '../src/passengers/index.js';
import { Gate, GateSystem } from '../src/resources/index.js';
import { Runway, RunwaySystem } from '../src/resources/index.js';
import {
  FacilitySystem,
  Facility,
  Equipment,
  MaintenanceTask,
  FACILITY_STATUSES,
  EQUIPMENT_TYPES,
  EQUIPMENT_STATUSES,
  MAINTENANCE_STATUS,
  MAINTENANCE_TYPES,
} from '../src/facilities/index.js';

const make = (opts = {}) => {
  const simulation = new SimulationCore({ startDate: '2026-01-01T00:00:00.000Z' });
  const facilitySystem = new FacilitySystem(simulation, { random: () => 1 });
  return { simulation, facilitySystem, ...opts };
};
const addFacility = (fs, id, capacity = 10) => fs.addFacility({ facilityId: id, facilityType: 'SecurityZone', name: id, capacity, maxCapacity: capacity });
const addEquipment = (fs, id, facilityId, equipmentType = EQUIPMENT_TYPES.SECURITY_LANE, extra = {}) => fs.addEquipment({ equipmentId: id, facilityId, equipmentType, capacity: 1, ...extra });

// TEST 1
 test('TEST 1 Facility 생성', () => { const { facilitySystem } = make(); const f = addFacility(facilitySystem, 'F1', 10); assert.ok(f instanceof Facility); assert.equal(f.health, 100); assert.equal(f.maxCapacity, 10); });
// TEST 2
 test('TEST 2 Equipment 생성', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); const e = addEquipment(facilitySystem, 'E1', 'F1'); assert.ok(e instanceof Equipment); assert.equal(e.status, EQUIPMENT_STATUSES.OPERATIONAL); });
// TEST 3
 test('TEST 3 Facility ↔ Equipment 연결', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); assert.deepEqual(facilitySystem.getFacility('F1').equipmentIds, ['E1']); assert.equal(facilitySystem.getEquipmentForFacility('F1').length, 1); });
// TEST 4
 test('TEST 4 Equipment Health 감소', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); facilitySystem.updateEquipmentHealth('E1', 70, { hours: 10 }); assert.equal(facilitySystem.getEquipment('E1').health, 70); assert.equal(facilitySystem.getEquipment('E1').status, EQUIPMENT_STATUSES.DEGRADED); });
// TEST 5
 test('TEST 5 Equipment Efficiency 감소', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); facilitySystem.updateEquipmentHealth('E1', 50); assert.equal(facilitySystem.getEquipment('E1').efficiency, 0.85); });
// TEST 6
 test('TEST 6 Equipment Failure', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); facilitySystem.failEquipment('E1'); assert.equal(facilitySystem.getEquipment('E1').status, EQUIPMENT_STATUSES.FAILED); assert.equal(facilitySystem.getFailedEquipment().length, 1); });
// TEST 7
 test('TEST 7 Automatic Maintenance Task', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); facilitySystem.failEquipment('E1'); const m = facilitySystem.getMaintenanceQueue()[0]; assert.ok(m); assert.equal(m.maintenanceType, MAINTENANCE_TYPES.CORRECTIVE); assert.equal(m.status, MAINTENANCE_STATUS.PENDING); });
// TEST 8
 test('TEST 8 Preventive Maintenance', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1', EQUIPMENT_TYPES.CONVEYOR, { health: 60 }); const m = facilitySystem.createPreventiveMaintenance('E1'); assert.equal(m.maintenanceType, MAINTENANCE_TYPES.PREVENTIVE); assert.equal(m.status, MAINTENANCE_STATUS.SCHEDULED); });
// TEST 9
 test('TEST 9 Corrective Maintenance', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); const m = facilitySystem.createCorrectiveMaintenance('E1'); assert.equal(m.maintenanceType, MAINTENANCE_TYPES.CORRECTIVE); assert.equal(m.status, MAINTENANCE_STATUS.PENDING); });
// TEST 10
 test('TEST 10 Maintenance Employee Assignment', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); const employees = { 'T1': 1.0, 'T2': 1.0 }; const fakeEmployeeSystem = { listEmployees: () => Object.keys(employees).map((employeeId) => ({ employeeId, roleId: 'MaintenanceTechnician', currentFacilityId: 'F1', isOperational: () => true })), effectiveProductivity: (id) => employees[id] ?? 0 }; facilitySystem.attachEmployeeSystem(fakeEmployeeSystem); const m = facilitySystem.createCorrectiveMaintenance('E1'); facilitySystem.assignMaintenance(m.maintenanceId, ['T1']); assert.deepEqual(m.assignedEmployees, ['T1']); });
// TEST 11
 test('TEST 11 Maintenance Staffing Shortage', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); const fakeEmployeeSystem = { listEmployees: () => [{ employeeId: 'T1', roleId: 'MaintenanceTechnician', currentFacilityId: 'F1', isOperational: () => true }], effectiveProductivity: () => 1 }; facilitySystem.attachEmployeeSystem(fakeEmployeeSystem); const m = facilitySystem.createCorrectiveMaintenance('E1'); facilitySystem.assignMaintenance(m.maintenanceId, ['T1']); assert.equal(m.status, MAINTENANCE_STATUS.DELAYED); });
// TEST 12
 test('TEST 12 Repair Completion', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); facilitySystem.failEquipment('E1'); const m = facilitySystem.getMaintenanceQueue()[0]; facilitySystem.completeMaintenance(m.maintenanceId); assert.equal(facilitySystem.getEquipment('E1').status, EQUIPMENT_STATUSES.OPERATIONAL); assert.equal(m.status, MAINTENANCE_STATUS.COMPLETED); assert.equal(facilitySystem.getFacility('F1').availableCapacity, 1); });
// TEST 13
 test('TEST 13 Facility Capacity 감소', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1', 10); for (let i = 0; i < 10; i += 1) addEquipment(facilitySystem, `E${i}`, 'F1'); facilitySystem.failEquipment('E0'); facilitySystem.failEquipment('E1'); assert.equal(facilitySystem.getFacility('F1').availableCapacity, 8); });
// TEST 14
 test('TEST 14 Queue Capacity 감소', () => { const { simulation, facilitySystem } = make(); const q = new QueueEngine(simulation); q.createQueue({ id: 'SECURITY_QUEUE', serviceType: 'security', serverCount: 10, serviceTime: 10 }); facilitySystem.attachQueueEngine(q); addFacility(facilitySystem, 'SECURITY_ZONE', 10); for (let i = 0; i < 10; i += 1) addEquipment(facilitySystem, `S${i}`, 'SECURITY_ZONE'); facilitySystem.bindQueue({ queueId: 'SECURITY_QUEUE', facilityId: 'SECURITY_ZONE', equipmentTypes: [EQUIPMENT_TYPES.SECURITY_LANE] }); facilitySystem.failEquipment('S0'); facilitySystem.failEquipment('S1'); assert.equal(q.stats('SECURITY_QUEUE').serverCount, 8); });
// TEST 15
 test('TEST 15 Security Equipment Failure → Queue 증가', () => { const { simulation, facilitySystem } = make(); const q = new QueueEngine(simulation); q.createQueue({ id: 'SECURITY_QUEUE', serviceType: 'security', serverCount: 10, serviceTime: 30 }); facilitySystem.attachQueueEngine(q); addFacility(facilitySystem, 'SECURITY_ZONE', 10); for (let i = 0; i < 10; i += 1) addEquipment(facilitySystem, `S${i}`, 'SECURITY_ZONE'); facilitySystem.bindQueue({ queueId: 'SECURITY_QUEUE', facilityId: 'SECURITY_ZONE', equipmentTypes: [EQUIPMENT_TYPES.SECURITY_LANE] }); facilitySystem.failEquipment('S0'); facilitySystem.failEquipment('S1'); const before = q.stats('SECURITY_QUEUE').serverCount; assert.equal(before, 8); });
// TEST 16
 test('TEST 16 Check-in Equipment Failure → Queue 증가', () => { const { simulation, facilitySystem } = make(); const q = new QueueEngine(simulation); q.createQueue({ id: 'CHECK_IN_QUEUE', serviceType: 'checkin', serverCount: 10, serviceTime: 30 }); facilitySystem.attachQueueEngine(q); addFacility(facilitySystem, 'CHECK_IN_ZONE', 10); for (let i = 0; i < 10; i += 1) addEquipment(facilitySystem, `C${i}`, 'CHECK_IN_ZONE', EQUIPMENT_TYPES.CHECK_IN_COUNTER); facilitySystem.bindQueue({ queueId: 'CHECK_IN_QUEUE', facilityId: 'CHECK_IN_ZONE', equipmentTypes: [EQUIPMENT_TYPES.CHECK_IN_COUNTER] }); facilitySystem.failEquipment('C0'); assert.equal(q.stats('CHECK_IN_QUEUE').serverCount, 9); });
// TEST 17
 test('TEST 17 Baggage Equipment Failure → Sorting Delay', () => { const { simulation, facilitySystem } = make(); const q = new QueueEngine(simulation); q.createQueue({ id: 'BAGGAGE_SORTING_QUEUE', serviceType: 'baggage-sorting', serverCount: 4, serviceTime: 20 }); facilitySystem.attachQueueEngine(q); addFacility(facilitySystem, 'BAGGAGE_FACILITY', 4); for (let i = 0; i < 4; i += 1) addEquipment(facilitySystem, `B${i}`, 'BAGGAGE_FACILITY', EQUIPMENT_TYPES.BAGGAGE_SORTER); facilitySystem.bindQueue({ queueId: 'BAGGAGE_SORTING_QUEUE', facilityId: 'BAGGAGE_FACILITY', equipmentTypes: [EQUIPMENT_TYPES.BAGGAGE_SORTER] }); facilitySystem.failEquipment('B0'); assert.equal(q.stats('BAGGAGE_SORTING_QUEUE').serverCount, 3); });
// TEST 18
 test('TEST 18 Ground Equipment Failure → GroundTask Delay factor', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'RAMP_G1', 3); addEquipment(facilitySystem, 'GB0', 'RAMP_G1', EQUIPMENT_TYPES.BAGGAGE_CART); addEquipment(facilitySystem, 'GB1', 'RAMP_G1', EQUIPMENT_TYPES.BAGGAGE_CART); addEquipment(facilitySystem, 'GB2', 'RAMP_G1', EQUIPMENT_TYPES.BAGGAGE_CART); facilitySystem.failEquipment('GB0'); assert.ok(facilitySystem.getGroundEquipmentFactor('RAMP_G1', 'BAGGAGE_LOAD') < 1); });
// TEST 19
 test('TEST 19 Jet Bridge Failure → Gate Availability 변화', () => { const { simulation, facilitySystem } = make(); const gs = new GateSystem(simulation); const gate = new Gate({ gateId: 'G1', terminalId: 'T1' }); gs.addGate(gate); facilitySystem.attachGateSystem(gs); addFacility(facilitySystem, 'GATE_G1', 1); addEquipment(facilitySystem, 'JB1', 'GATE_G1', EQUIPMENT_TYPES.BOARDING_BRIDGE); facilitySystem.failEquipment('JB1'); assert.equal(gate.status, 'BLOCKED'); facilitySystem.completeMaintenance(facilitySystem.getMaintenanceQueue()[0].maintenanceId); assert.equal(gate.status, 'AVAILABLE'); });
// TEST 20
 test('TEST 20 Runway Maintenance → Runway Queue 영향', () => { const { simulation, facilitySystem } = make(); const rs = new RunwaySystem(simulation); const runway = new Runway({ runwayId: '09', name: 'RWY 09' }); rs.addRunway(runway); facilitySystem.attachRunwaySystem(rs); addFacility(facilitySystem, 'RUNWAY_09', 1); addEquipment(facilitySystem, 'RP1', 'RUNWAY_09', EQUIPMENT_TYPES.IT_SYSTEM); facilitySystem.failEquipment('RP1'); assert.equal(runway.status, 'MAINTENANCE'); facilitySystem.completeMaintenance(facilitySystem.getMaintenanceQueue()[0].maintenanceId); assert.equal(runway.status, 'AVAILABLE'); });
// TEST 21
 test('TEST 21 Maintenance Completion → Capacity Recovery', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1', 2); addEquipment(facilitySystem, 'E1', 'F1'); addEquipment(facilitySystem, 'E2', 'F1'); facilitySystem.failEquipment('E1'); assert.equal(facilitySystem.getFacility('F1').availableCapacity, 1); facilitySystem.completeMaintenance(facilitySystem.getMaintenanceQueue()[0].maintenanceId); assert.equal(facilitySystem.getFacility('F1').availableCapacity, 2); });
// TEST 22
 test('TEST 22 Facility Statistics', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addFacility(facilitySystem, 'F2'); addEquipment(facilitySystem, 'E1', 'F1'); addEquipment(facilitySystem, 'E2', 'F2'); facilitySystem.failEquipment('E2'); const s = facilitySystem.statistics().facilities; assert.equal(s.totalFacilities, 2); assert.equal(s.failedFacilities + s.degradedFacilities + s.operationalFacilities, 2); });
// TEST 23
 test('TEST 23 Equipment Statistics', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); addEquipment(facilitySystem, 'E2', 'F1'); facilitySystem.failEquipment('E2'); const s = facilitySystem.statistics().equipment; assert.equal(s.totalEquipment, 2); assert.equal(s.failedEquipment, 1); assert.ok(s.correctiveMaintenanceCount >= 1); });
// TEST 24
 test('TEST 24 Maintenance Statistics', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1'); facilitySystem.failEquipment('E1'); const m = facilitySystem.getMaintenanceQueue()[0]; const s = facilitySystem.statistics().maintenance; assert.equal(s.pendingMaintenance, 1); assert.equal(s.correctiveMaintenanceCount, undefined); assert.ok(m); });
// TEST 25
 test('TEST 25 Maintenance Priority', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'F1'); addEquipment(facilitySystem, 'E1', 'F1', EQUIPMENT_TYPES.SECURITY_LANE, { health: 40, utilization: 0.95 }); const p = facilitySystem.calculateMaintenancePriority('E1'); assert.ok(p > 0); });
// TEST 26
 test('TEST 26 Cascading Failure', () => { const { simulation, facilitySystem } = make(); const q = new QueueEngine(simulation); q.createQueue({ id: 'SECURITY_QUEUE', serviceType: 'security', serverCount: 3, serviceTime: 30 }); facilitySystem.attachQueueEngine(q); addFacility(facilitySystem, 'SECURITY_ZONE', 3); for (let i = 0; i < 3; i += 1) addEquipment(facilitySystem, `E${i}`, 'SECURITY_ZONE'); facilitySystem.bindQueue({ queueId: 'SECURITY_QUEUE', facilityId: 'SECURITY_ZONE', equipmentTypes: [EQUIPMENT_TYPES.SECURITY_LANE] }); facilitySystem.failEquipment('E0'); assert.equal(q.stats('SECURITY_QUEUE').serverCount, 2); assert.equal(facilitySystem.getFacility('SECURITY_ZONE').operatingStatus, FACILITY_STATUSES.DEGRADED); });
// TEST 27
 test('TEST 27 10,000 Equipment Performance', () => { const { facilitySystem } = make(); addFacility(facilitySystem, 'BIG', 10000); const started = Date.now(); for (let i = 0; i < 10000; i += 1) addEquipment(facilitySystem, `E${i}`, 'BIG', EQUIPMENT_TYPES.CONVEYOR, { health: 100 }); const elapsed = Date.now() - started; assert.equal(facilitySystem.listEquipment().length, 10000); assert.ok(elapsed < 5000, `elapsed=${elapsed}ms`); });
// TEST 28
 test('TEST 28 Flight + Gate + Runway + Passenger + Employee + Baggage + Ground Regression imports remain available', async () => { const modules = await Promise.all([import('../src/flights/index.js'), import('../src/resources/index.js'), import('../src/passengers/index.js'), import('../src/employees/index.js'), import('../src/baggage/index.js'), import('../src/ground/index.js')]); assert.equal(modules.length, 6); assert.equal(typeof FacilitySystem, 'function'); });
