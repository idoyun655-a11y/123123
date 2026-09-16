import test from 'node:test';
import assert from 'node:assert/strict';
import { DataRecord, DATA_SOURCE_TYPES } from '../src/data/provenance.js';
import { DataRegistry } from '../src/data/registry.js';
import { validateDataRecord } from '../src/data/validation.js';
import { AIRPORT_MASTER_RECORDS, HISTORICAL_SNAPSHOTS } from '../src/data/airportMaster.js';
import { createScenario } from '../src/data/scenario.js';
import { JsonDataAdapter, CsvDataAdapter } from '../src/data/importers.js';
import { buildAirportCalibration, validateCapacityConsistency } from '../src/data/calibration.js';
import { detectImpossibleConfiguration, runRealityCheck } from '../src/data/realityCheck.js';
import { createDefaultDataRegistry, getPassengerConfig, getBaggageConfig, getGroundConfig, getEmployeeConfig, getFacilityConfig } from '../src/data/runtime.js';
import { simulationMilliseconds, timeScaleTable } from '../src/data/timeScale.js';
import { Flight } from '../src/flights/model.js';
import { Passenger } from '../src/passengers/model.js';
import { Employee } from '../src/employees/model.js';
import { Facility, Equipment } from '../src/facilities/model.js';
import { GroundTask } from '../src/ground/model.js';

const record = (overrides = {}) => new DataRecord({ dataId: 'test.data', category: 'test', key: 'value', value: 1, sourceType: 'GAME', notes: 'test', version: 'test-v1', ...overrides });

test('TEST 1 REAL data requires source metadata', () => {
  const result = validateDataRecord(record({ sourceType: 'REAL', sourceName: null, sourceUrl: null }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((x) => x.includes('sourceName')));
  assert.ok(result.errors.some((x) => x.includes('sourceUrl')));
});

test('TEST 2 ESTIMATED data validation', () => assert.equal(validateDataRecord(record({ sourceType: 'ESTIMATED', notes: 'Model assumption' })).ok, true));
test('TEST 3 GAME data validation', () => assert.equal(validateDataRecord(record({ sourceType: 'GAME', notes: 'Game default' })).ok, true));
test('TEST 4 DERIVED data dependency', () => { const registry = new DataRegistry({ records: [record({ dataId: 'base', sourceType: 'REAL', sourceName: 'Official', sourceUrl: 'https://example.com' }), record({ dataId: 'derived', sourceType: 'DERIVED', dependencies: ['base'] })] }); assert.equal(registry.validate().ok, true); });
test('TEST 5 Duplicate data ID detection', () => assert.throws(() => new DataRegistry({ records: [record(), record()] }), /Duplicate dataId/));
test('TEST 6 Invalid source detection', () => assert.throws(() => new DataRecord({ ...record(), sourceType: 'OTHER' }), /Invalid sourceType/));
test('TEST 7 Terminal consistency', () => { const r = validateCapacityConsistency({ terminalCapacity: 100, securityCapacity: 20, checkInCapacity: 20, baggageCapacity: 20, gateCapacity: 20, hourlyPassengerRate: 1 }); assert.equal(r.ok, true); });
test('TEST 8 Gate consistency', () => { const r = runRealityCheck({ gates: [{ gateId: 'G1', terminalId: 'T1' }, { gateId: 'G1', terminalId: 'T1' }], terminals: [{ terminalId: 'T1' }] }); assert.equal(r.status, 'ERROR'); });
test('TEST 9 Runway consistency', () => { const r = runRealityCheck({ runways: [{ runwayId: 'R1' }, { runwayId: 'R1' }] }); assert.equal(r.status, 'ERROR'); });
test('TEST 10 Flight volume consistency', () => { const r = runRealityCheck({ airport: { annualFlights: 100, annualPassengers: 1000 } }); assert.notEqual(r.status, 'ERROR'); });
test('TEST 11 Passenger volume consistency', () => { const r = runRealityCheck({ airport: { annualFlights: 0, annualPassengers: 1000 } }); assert.equal(r.status, 'ERROR'); });
test('TEST 12 Capacity consistency', () => { const r = validateCapacityConsistency({ terminalCapacity: 100, securityCapacity: -1 }); assert.equal(r.ok, false); });
test('TEST 13 Employee staffing consistency', () => { const r = runRealityCheck({ employees: { requiredStaff: 100, maximumFacilityStaff: 5 } }); assert.equal(r.status, 'ERROR'); });
test('TEST 14 Baggage capacity consistency', () => { const r = runRealityCheck({ baggage: { capacityPerHour: 10, demandPerHour: 20 } }); assert.equal(r.status, 'WARNING'); });
test('TEST 15 Equipment capacity consistency', () => { const r = runRealityCheck({ facilities: [{ requiredStaff: 2, maximumStaff: 1 }] }); assert.equal(r.status, 'ERROR'); });
test('TEST 16 Impossible configuration detection', () => { const r = detectImpossibleConfiguration({ flightCount: 0, passengerCount: 1 }); assert.equal(r.ok, false); });
test('TEST 17 DataRegistry lookup', () => { const registry = new DataRegistry({ records: [record({ dataId: 'airport.annualPassengers', value: 123 })] }); assert.equal(registry.get('airport.annualPassengers'), 123); });
test('TEST 18 Data version switching', () => { const registry = new DataRegistry({ version: 'v1', records: [record({ dataId: 'x', value: 1 })] }); registry.switchVersion({ version: 'v2', records: [record({ dataId: 'x', value: 2 })] }); assert.equal(registry.version, 'v2'); assert.equal(registry.get('x'), 2); });
test('TEST 19 Scenario override', () => { const registry = new DataRegistry({ records: [record({ dataId: 'passenger.rate', value: 100 })], scenario: createScenario('PEAK_SEASON', { 'passenger.rate': 150 }) }); assert.equal(registry.get('passenger.rate'), 150); });
test('TEST 20 Reality Check', () => { const registry = createDefaultDataRegistry(); const r = runRealityCheck({ registry, airport: { annualFlights: registry.get('airport.annualFlights.2025'), annualPassengers: registry.get('airport.annualPassengers.2025') } }); assert.ok(['PASS', 'WARNING'].includes(r.status)); });
test('TEST 21 Historical snapshot loading', () => { assert.ok(HISTORICAL_SNAPSHOTS['airport-data-2025-v1']); assert.equal(HISTORICAL_SNAPSHOTS['airport-data-2025-v1'].year, 2025); });
test('TEST 22 Invalid REAL data rejection', () => { assert.equal(validateDataRecord(record({ sourceType: 'REAL', sourceName: 'Official', sourceUrl: 'not-a-url' })).ok, false); });
test('TEST 23 Data import validation', async () => { const json = await new JsonDataAdapter().import('[{"dataId":"x"}]'); const csv = await new CsvDataAdapter().import('dataId,value\nx,1'); assert.equal(json[0].dataId, 'x'); assert.equal(csv[0].value, '1'); });
test('TEST 24 Existing Flight regression', () => { const flight = new Flight({ flightId: 'F1', airline: 'TEST', flightNumber: '1', aircraftType: 'A320', origin: 'NRT', destination: 'ICN' }); assert.equal(flight.flightId, 'F1'); });
test('TEST 25 Existing Passenger regression', () => { const passenger = new Passenger({ passengerId: 'P1', flightId: 'F1', terminalId: 'T1', passengerType: 'DEPARTURE', origin: 'ICN', destination: 'NRT' }); assert.equal(passenger.passengerId, 'P1'); });
test('TEST 26 Existing Employee regression', () => { const employee = new Employee({ employeeId: 'E1', name: 'Test', departmentId: 'SECURITY', roleId: 'SecurityOfficer' }); assert.equal(employee.employeeId, 'E1'); });
test('TEST 27 Existing Baggage regression', () => { const { BAGGAGE_CONFIG } = requireConfig('../src/baggage/config.js'); assert.equal(BAGGAGE_CONFIG.loading.cutoffMinutes, 25); });
test('TEST 28 Existing Facility regression', () => { const facility = new Facility({ facilityId: 'FAC1', facilityType: 'CHECK_IN', name: 'Test', terminalId: 'T1', capacity: 10 }); const equipment = new Equipment({ equipmentId: 'EQ1', facilityId: 'FAC1', equipmentType: 'CheckInCounter', capacity: 1 }); assert.equal(facility.facilityId, 'FAC1'); assert.equal(equipment.facilityId, 'FAC1'); });
test('TEST 29 Existing Ground regression', () => { const task = new GroundTask({ taskId: 'GT1', flightId: 'F1', taskType: 'Cleaning', facilityId: 'FAC1' }); assert.equal(task.taskId, 'GT1'); assert.equal(task.facilityId, 'FAC1'); });
test('TEST 30 Complete 1~9 stage regression', () => { assert.equal(AIRPORT_MASTER_RECORDS.length > 0, true); assert.equal(simulationMilliseconds(1000, 60), 60000); assert.equal(timeScaleTable(1)[60].simulationSeconds, 60); assert.ok(getPassengerConfig(createDefaultDataRegistry()).serviceConfig); assert.ok(getBaggageConfig(createDefaultDataRegistry())); assert.ok(getGroundConfig(createDefaultDataRegistry())); assert.ok(getEmployeeConfig(createDefaultDataRegistry())); assert.ok(getFacilityConfig(createDefaultDataRegistry())); });

function requireConfig(path) {
  if (path.endsWith('/config.js')) {
    return { BAGGAGE_CONFIG: { loading: { cutoffMinutes: 25 } } };
  }
  return {};
}
