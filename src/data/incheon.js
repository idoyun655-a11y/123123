import { Models, SOURCE_TYPES, OPERATING_STATUSES, MAINTENANCE_STATUSES } from './model.js';

const SOURCES = Object.freeze({
  FACILITIES: 'https://www.airport.kr/co_en/4190/subview.do',
  PHASE4_KO: 'https://www.airport.kr/co_ko/771/subview.do',
  GUIDE: 'https://www.airport.kr/ap_ko/967/subview.do',
});
const ESTIMATED = 'ESTIMATED: not individually published/verified in the source';

export const INCHEON_AIRPORT_DATA = Object.freeze({
  metadata: Object.freeze({
    datasetId: 'icn-public-facilities-2024',
    referenceBasis: '2024 4th-phase completion public data; official pages accessed 2026-09-16',
    dataPolicy: 'Only explicitly published values are REAL. Unverified component-level values remain ESTIMATED or null.',
    sources: SOURCES,
  }),
  airports: Object.freeze([
    Models.Airport({
      id: 'ICN', name: '인천국제공항', location: { region: '인천광역시 영종도', coordinate: null },
      size: { unit: 'site-area', value: null },
      capacity: { passengersPerYear: { value: 106_000_000, unit: 'passengers/year' }, flightsPerYear: { value: 600_000, unit: 'movements/year' }, cargoTonsPerYear: { value: 6_300_000, unit: 'tons/year' } },
      operatingStatus: OPERATING_STATUSES.OPERATIONAL, maintenanceStatus: MAINTENANCE_STATUSES.NORMAL,
      sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES,
    }),
  ]),
  terminals: Object.freeze([
    Models.Terminal({
      id: 'T1', name: '제1여객터미널', location: { zone: 'Passenger Terminal 1' },
      size: { area: 507_000, unit: 'm²' }, capacity: { passengersPerYear: 72_000_000, unit: 'passengers/year' },
      operatingStatus: OPERATING_STATUSES.OPERATIONAL, maintenanceStatus: MAINTENANCE_STATUSES.NORMAL,
      sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES,
    }),
    Models.Terminal({
      id: 'T2', name: '제2여객터미널', location: { zone: 'Passenger Terminal 2' },
      size: { area: 703_000, unit: 'm²', currentAndPhase4Combined: true },
      capacity: null,
      operatingStatus: OPERATING_STATUSES.OPERATIONAL, maintenanceStatus: MAINTENANCE_STATUSES.NORMAL,
      sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES,
      notes: 'Official source reports T2 total area as 703,000 m² (387,000 m² current + 316,000 m² phase-4). No T2-only passenger handling capacity is assigned here; 106M is an airport-wide capacity figure.',
    }),
  ]),
  concourses: Object.freeze([
    Models.Concourse({
      id: 'CONCOURSE_A', name: '탑승동', location: { zone: 'Concourse' },
      size: { area: 166_000, unit: 'm²' }, capacity: null,
      operatingStatus: OPERATING_STATUSES.OPERATIONAL, maintenanceStatus: MAINTENANCE_STATUSES.NORMAL,
      sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES,
    }),
  ]),
  runways: Object.freeze([
    Models.Runway({ id: 'RWY-1', name: 'Runway 1', size: { length: 3_750, width: 60, unit: 'm' }, capacity: null, sourceType: SOURCE_TYPES.ESTIMATED, source: ESTIMATED, notes: 'Official source confirms two 3,750×60 m runways, but the extracted public table does not establish which runway number corresponds to which dimensions.' }),
    Models.Runway({ id: 'RWY-2', name: 'Runway 2', size: { length: 3_750, width: 60, unit: 'm' }, capacity: null, sourceType: SOURCE_TYPES.ESTIMATED, source: ESTIMATED }),
    Models.Runway({ id: 'RWY-3', name: 'Runway 3', size: { length: 4_000, width: 60, unit: 'm' }, capacity: null, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES, notes: 'This follows the phase table mapping of the 4,000×60 m runway; detailed runway designation/operational use data is not modeled here.' }),
    Models.Runway({ id: 'RWY-4', name: 'Runway 4', size: { length: 3_750, width: 60, unit: 'm' }, capacity: null, sourceType: SOURCE_TYPES.REAL, source: SOURCES.PHASE4_KO }),
  ]),
  gates: Object.freeze([
    Models.Gate({ id: 'GATE_TOTAL', name: 'Passenger apron stand aggregate', capacity: { passengerApronStands: 236 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES, notes: '236 is the official passenger apron stand total. This is not an individual gate inventory; individual gate IDs, aircraft compatibility, and per-gate processing limits require additional verified data.' }),
  ]),
  checkInZones: Object.freeze([
    Models.CheckInZone({ id: 'CHECKIN_TOTAL', name: 'Check-in counter aggregate', capacity: { counters: 810, selfBagDrop: 100 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES, notes: 'Airport-wide cumulative count; terminal-specific allocation is not represented.' }),
  ]),
  securityZones: Object.freeze([
    Models.SecurityZone({ id: 'SECURITY_TOTAL', name: 'Security screening zone aggregate', capacity: { zones: 110 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES, notes: 'Airport-wide cumulative zone count.' }),
  ]),
  immigrationZones: Object.freeze([
    Models.ImmigrationZone({ id: 'DEP_PASSPORT_GENERAL', name: 'Departure passport control - general', capacity: { lanes: 122 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
    Models.ImmigrationZone({ id: 'DEP_PASSPORT_AUTO', name: 'Departure passport control - automated', capacity: { lanes: 84 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
    Models.ImmigrationZone({ id: 'ARR_PASSPORT_GENERAL', name: 'Arrival passport control - general', capacity: { lanes: 136 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
    Models.ImmigrationZone({ id: 'ARR_PASSPORT_AUTO', name: 'Arrival passport control - automated', capacity: { lanes: 88 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
  ]),
  baggageSystems: Object.freeze([
    Models.BaggageSystem({ id: 'BHS_TOTAL', name: 'Baggage Handling System', size: { length: 198, unit: 'km' }, capacity: null, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES, notes: 'Public cumulative BHS network length. Processing throughput is not assigned because no verified figure was used.' }),
    Models.BaggageSystem({ id: 'BAGGAGE_CLAIM_AREA_TOTAL', name: 'Baggage claim areas', capacity: { areas: 43 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
  ]),
  cargoFacilities: Object.freeze([
    Models.CargoFacility({ id: 'CARGO_TERMINAL_TOTAL', name: 'Cargo terminal aggregate', size: { area: 259_000, unit: 'm²' }, capacity: { tonsPerYear: 6_300_000 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES, notes: 'Official cumulative cargo terminal area and airport-wide cargo handling capacity.' }),
  ]),
  parkings: Object.freeze([
    Models.Parking({ id: 'T1_SHORT_TERM', name: 'T1 단기주차장', capacity: null, operatingStatus: OPERATING_STATUSES.OPERATIONAL, sourceType: SOURCE_TYPES.REAL, source: SOURCES.GUIDE, notes: 'Facility existence is officially confirmed. A verified total designed capacity is not stored.' }),
    Models.Parking({ id: 'T2_SHORT_TERM', name: 'T2 단기주차장', capacity: null, operatingStatus: OPERATING_STATUSES.OPERATIONAL, sourceType: SOURCE_TYPES.REAL, source: SOURCES.GUIDE, notes: 'Facility existence is officially confirmed. A verified total designed capacity is not stored.' }),
    Models.Parking({ id: 'T2_LONG_TERM', name: 'T2 장기주차장', capacity: null, operatingStatus: OPERATING_STATUSES.OPERATIONAL, sourceType: SOURCE_TYPES.REAL, source: SOURCES.GUIDE, properties: { publishedAvailability: { spaces: 773, date: '2026-09-11' } }, notes: '773 is current availability reported on 2026-09-11, not designed capacity.' }),
    Models.Parking({ id: 'T2_PARKING_TOWER_P1', name: 'T2 주차타워 P1', capacity: null, operatingStatus: OPERATING_STATUSES.OPERATIONAL, sourceType: SOURCE_TYPES.REAL, source: SOURCES.GUIDE, properties: { publishedAvailability: { spaces: 1_194, date: '2026-09-11' } }, notes: '1,194 is current availability reported on 2026-09-11, not designed capacity.' }),
    Models.Parking({ id: 'T2_PARKING_TOWER_P2', name: 'T2 주차타워 P2', capacity: null, operatingStatus: OPERATING_STATUSES.OPERATIONAL, sourceType: SOURCE_TYPES.REAL, source: SOURCES.GUIDE, properties: { publishedAvailability: { spaces: 1_035, date: '2026-09-11' } }, notes: '1,035 is current availability reported on 2026-09-11, not designed capacity.' }),
  ]),
  roads: Object.freeze([
    Models.Road({ id: 'T1_T2_CONNECTING_ROADS', name: 'T1-T2 연결도로', size: { length: 3.87, unit: 'km' }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
    Models.Road({ id: 'T2_ACCESS_ROAD_EXTENSION', name: 'T2 접근도로 확장', size: { length: 3.52, unit: 'km' }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
    Models.Road({ id: 'SOUTHERN_CONNECTING_ROAD_IMPROVEMENT', name: '남측 연결도로 개선', size: { length: 1.72, unit: 'km' }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
  ]),
  facilities: Object.freeze([
    Models.Facility({ id: 'T2_TRANSPORT_CENTER', name: '제2교통센터', size: { area: 87_000, unit: 'm²' }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
    Models.Facility({ id: 'FREIGHT_APRON_TOTAL', name: 'Cargo apron aggregate', capacity: { stands: 62 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
    Models.Facility({ id: 'PASSENGER_APRON_TOTAL', name: 'Passenger apron aggregate', capacity: { stands: 236 }, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES }),
    Models.Facility({ id: 'MRO_COMPLEX', name: 'MRO complex', capacity: null, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES, notes: 'Official source lists the facility/project; quantitative capacity is not assigned.' }),
    Models.Facility({ id: 'REFUELING_FACILITIES', name: 'Refueling facilities', capacity: null, sourceType: SOURCE_TYPES.REAL, source: SOURCES.FACILITIES, notes: 'Official source lists the facility; quantitative capacity is not assigned.' }),
  ]),
});

export function flattenIncheonDataset(dataset = INCHEON_AIRPORT_DATA) {
  return Object.values(dataset).filter(Array.isArray).flat();
}
