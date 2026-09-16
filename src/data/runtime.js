import { AIRPORT_MASTER_RECORDS, AIRPORT_MASTER, HISTORICAL_SNAPSHOTS } from './airportMaster.js';
import { DataRegistry, DEFAULT_DATA_VERSION } from './registry.js';
import { createScenario } from './scenario.js';
import { createDataRecord } from './provenance.js';
import { PASSENGER_ARRIVAL_MODEL, PASSENGER_SERVICE_CONFIG } from '../passengers/config.js';
import { BAGGAGE_CONFIG } from '../baggage/config.js';
import { GROUND_CONFIG } from '../ground/config.js';
import { EMPLOYEE_CONFIG } from '../employees/config.js';
import { FACILITY_CONFIG } from '../facilities/config.js';

const ACCESS_DATE = '2026-09-17';

function configRecords() {
  return [
    createDataRecord({ dataId: 'passenger.arrivalDistribution', category: 'passenger', key: 'arrivalDistribution', value: PASSENGER_ARRIVAL_MODEL, unit: 'distribution weights', sourceType: 'ESTIMATED', sourceName: 'Simulation model assumption', accessedDate: ACCESS_DATE, confidence: 'LOW', notes: 'Not a verified ICN passenger arrival distribution.', version: DEFAULT_DATA_VERSION }),
    createDataRecord({ dataId: 'passenger.serviceConfig', category: 'passenger', key: 'serviceConfig', value: PASSENGER_SERVICE_CONFIG, unit: 'simulation service units', sourceType: 'GAME', sourceName: 'Simulation configuration', accessedDate: ACCESS_DATE, confidence: 'LOW', notes: 'Game defaults; not verified ICN operational rates.', version: DEFAULT_DATA_VERSION }),
    createDataRecord({ dataId: 'baggage.config', category: 'baggage', key: 'config', value: BAGGAGE_CONFIG, unit: 'simulation configuration', sourceType: 'GAME', sourceName: 'Simulation configuration', accessedDate: ACCESS_DATE, confidence: 'LOW', notes: 'Game defaults; baggage probability, weights, service times and cutoffs are not verified ICN operating data.', version: DEFAULT_DATA_VERSION }),
    createDataRecord({ dataId: 'ground.config', category: 'ground', key: 'config', value: GROUND_CONFIG, unit: 'simulation configuration', sourceType: 'GAME', sourceName: 'Simulation configuration', accessedDate: ACCESS_DATE, confidence: 'LOW', notes: 'Game defaults; task durations and staffing are not verified airline/ICN procedures.', version: DEFAULT_DATA_VERSION }),
    createDataRecord({ dataId: 'employee.config', category: 'employee', key: 'config', value: EMPLOYEE_CONFIG, unit: 'simulation configuration', sourceType: 'GAME', sourceName: 'Simulation configuration', accessedDate: ACCESS_DATE, confidence: 'LOW', notes: 'Game defaults; salary, productivity, fatigue, attendance and staffing are not verified ICN workforce data.', version: DEFAULT_DATA_VERSION }),
    createDataRecord({ dataId: 'facility.config', category: 'facility', key: 'config', value: FACILITY_CONFIG, unit: 'simulation configuration', sourceType: 'GAME', sourceName: 'Simulation configuration', accessedDate: ACCESS_DATE, confidence: 'LOW', notes: 'Game defaults; MTBF, failure rate, maintenance interval, repair time and health curves are not verified ICN internal data.', version: DEFAULT_DATA_VERSION }),
    createDataRecord({ dataId: 'time.realTimeToSimulationTime', category: 'simulation.time', key: 'realTimeToSimulationTime', value: 'simulationMs = realDeltaMs * speed', unit: 'ratio', sourceType: 'GAME', sourceName: 'SimulationCore', accessedDate: ACCESS_DATE, confidence: 'HIGH', notes: '1x, 2x, 5x, 10x, 30x, 60x are deterministic simulation multipliers; they do not change the modeled demand schedule itself.', version: DEFAULT_DATA_VERSION }),
  ];
}

export function createDefaultDataRegistry({ version = DEFAULT_DATA_VERSION, scenario = 'NORMAL' } = {}) {
  const registry = new DataRegistry({ version, records: [...AIRPORT_MASTER_RECORDS, ...configRecords()], datasets: { airportMaster: AIRPORT_MASTER, historicalSnapshots: HISTORICAL_SNAPSHOTS }, scenario: createScenario(scenario) });
  return registry;
}

export function getConfiguredValue(registry, dataId, fallback) {
  if (!registry?.get) return fallback;
  const value = registry.get(dataId);
  return value === undefined ? fallback : value;
}

export function getPassengerConfig(registry) { return { arrivalModel: getConfiguredValue(registry, 'passenger.arrivalDistribution', PASSENGER_ARRIVAL_MODEL), serviceConfig: getConfiguredValue(registry, 'passenger.serviceConfig', PASSENGER_SERVICE_CONFIG) }; }
export function getBaggageConfig(registry) { return getConfiguredValue(registry, 'baggage.config', BAGGAGE_CONFIG); }
export function getGroundConfig(registry) { return getConfiguredValue(registry, 'ground.config', GROUND_CONFIG); }
export function getEmployeeConfig(registry) { return getConfiguredValue(registry, 'employee.config', EMPLOYEE_CONFIG); }
export function getFacilityConfig(registry) { return getConfiguredValue(registry, 'facility.config', FACILITY_CONFIG); }
