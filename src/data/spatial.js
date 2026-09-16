export const SPATIAL_SOURCE = 'ESTIMATED: relative positions inferred from Incheon International Airport public facility map; not survey/GIS coordinates.';

export const MAP_UNITS = Object.freeze({
  unit: 'm',
  coordinateSystem: 'ICN_LOCAL_ESTIMATED',
  origin: 'Estimated southwest airport reference point',
  note: 'Coordinates preserve public-map spatial relationships. They are not official cadastral, GIS, or aeronautical coordinates.',
});

const rect = ({ id, type, x, y, width, height, rotation = 0, sourceType = 'ESTIMATED', properties = {} }) => ({
  id, type, geometryType: 'rect', x, y, width, height, rotation, sourceType, properties,
});

const point = ({ id, type, x, y, sourceType = 'ESTIMATED', properties = {} }) => ({
  id, type, geometryType: 'point', x, y, sourceType, properties,
});

const path = ({ id, type, points, sourceType = 'ESTIMATED', properties = {} }) => ({
  id, type, geometryType: 'polyline', points, sourceType, properties,
});

export const INCHEON_SPATIAL_MAP = Object.freeze({
  map: Object.freeze({
    id: 'ICN_MAP',
    name: '인천국제공항 공간 시뮬레이션 맵',
    sourceType: 'ESTIMATED',
    source: SPATIAL_SOURCE,
    units: MAP_UNITS.unit,
    bounds: Object.freeze({ x: 0, y: 0, width: 24_000, height: 16_000 }),
    camera: Object.freeze({ minZoom: 0.25, maxZoom: 8, defaultZoom: 1, panEnabled: true, zoomEnabled: true }),
  }),

  facilities: Object.freeze([
    rect({ id: 'T1', type: 'Terminal', x: 7_400, y: 5_250, width: 1_650, height: 520, rotation: 0, properties: { sourceRef: 'airport-facility-map', layoutConfidence: 'medium' } }),
    rect({ id: 'T2', type: 'Terminal', x: 12_650, y: 7_850, width: 1_900, height: 560, rotation: 0, properties: { sourceRef: 'airport-facility-map', layoutConfidence: 'medium' } }),
    rect({ id: 'CONCOURSE_A', type: 'Concourse', x: 9_600, y: 5_950, width: 1_350, height: 420, rotation: 0, properties: { sourceRef: 'airport-facility-map', layoutConfidence: 'medium' } }),
    rect({ id: 'APRON_PASSENGER_T1', type: 'Apron', x: 7_300, y: 4_300, width: 2_100, height: 760, rotation: 0, properties: { terminalId: 'T1' } }),
    rect({ id: 'APRON_PASSENGER_T2', type: 'Apron', x: 12_350, y: 6_900, width: 2_400, height: 820, rotation: 0, properties: { terminalId: 'T2' } }),
    rect({ id: 'APRON_CARGO', type: 'CargoApron', x: 15_100, y: 4_450, width: 2_000, height: 1_050, rotation: 0 }),
    rect({ id: 'RWY-1', type: 'Runway', x: 2_000, y: 11_450, width: 9_000, height: 150, rotation: 0, properties: { publicDimension: '3,750 x 60 m; map geometry is abstracted' } }),
    rect({ id: 'RWY-2', type: 'Runway', x: 2_000, y: 9_850, width: 9_000, height: 150, rotation: 0, properties: { publicDimension: '3,750 x 60 m; map geometry is abstracted' } }),
    rect({ id: 'RWY-3', type: 'Runway', x: 13_000, y: 1_750, width: 9_500, height: 160, rotation: 0, properties: { publicDimension: '4,000 x 60 m; map geometry is abstracted' } }),
    rect({ id: 'RWY-4', type: 'Runway', x: 13_000, y: 3_350, width: 9_000, height: 150, rotation: 0, properties: { publicDimension: '3,750 x 60 m; map geometry is abstracted' } }),
    rect({ id: 'T1_TRANSPORT_CENTER', type: 'Facility', x: 7_700, y: 5_000, width: 1_150, height: 240, rotation: 0 }),
    rect({ id: 'T2_TRANSPORT_CENTER', type: 'Facility', x: 12_950, y: 7_400, width: 1_350, height: 260, rotation: 0 }),
  ]),

  gates: Object.freeze([
    point({ id: 'T1_GATES_ZONE', type: 'GateZone', x: 8_250, y: 4_450, properties: { representedCount: 163, sourceTypeNote: 'Count is REAL in the facility dataset; exact gate-by-gate geometry is not currently public in this model.' } }),
    point({ id: 'T2_GATES_ZONE', type: 'GateZone', x: 13_250, y: 7_150, properties: { representedCount: 73, sourceTypeNote: 'Count is REAL in the facility dataset; exact gate-by-gate geometry is not currently public in this model.' } }),
    point({ id: 'CONCOURSE_GATES_ZONE', type: 'GateZone', x: 10_250, y: 5_850, properties: { representedCount: 0, note: 'Individual gate count not inferred here.' } }),
  ]),

  passengerFlows: Object.freeze([
    path({ id: 'DEPARTURE_T1', type: 'DepartureFlow', points: [[7_500, 5_450], [8_100, 5_500], [8_650, 5_700], [9_000, 5_950]], properties: { sequence: ['terminal', 'checkIn', 'security', 'immigration', 'gateZone'] } }),
    path({ id: 'DEPARTURE_T2', type: 'DepartureFlow', points: [[12_800, 8_000], [13_350, 8_050], [13_700, 8_250], [13_450, 7_650]], properties: { sequence: ['terminal', 'checkIn', 'security', 'immigration', 'gateZone'] } }),
    path({ id: 'ARRIVAL_T1', type: 'ArrivalFlow', points: [[9_050, 4_950], [8_750, 5_250], [8_550, 5_500], [7_950, 5_450]], properties: { sequence: ['gateZone', 'immigration', 'baggageClaim', 'arrivalHall'] } }),
    path({ id: 'ARRIVAL_T2', type: 'ArrivalFlow', points: [[13_600, 7_050], [13_800, 7_450], [13_750, 7_850], [13_300, 8_050]], properties: { sequence: ['gateZone', 'immigration', 'baggageClaim', 'arrivalHall'] } }),
  ]),

  vehicleFlows: Object.freeze([
    path({ id: 'VEHICLE_T1_ACCESS', type: 'VehicleAccessFlow', points: [[5_400, 4_950], [6_200, 4_950], [7_100, 5_000], [7_850, 5_050]], properties: { roadClass: 'landside-access' } }),
    path({ id: 'VEHICLE_T2_ACCESS', type: 'VehicleAccessFlow', points: [[10_200, 9_250], [11_200, 8_950], [12_000, 8_650], [12_950, 8_250]], properties: { roadClass: 'landside-access' } }),
    path({ id: 'T1_T2_CONNECTOR', type: 'VehicleConnector', points: [[8_200, 5_050], [9_500, 6_100], [10_800, 7_050], [12_700, 8_000]], properties: { roadId: 'T1_T2_CONNECTING_ROADS' } }),
  ]),

  operationalLinks: Object.freeze([
    Object.freeze({ from: 'T1', to: 'APRON_PASSENGER_T1', relation: 'AIRSIDE_ADJACENCY' }),
    Object.freeze({ from: 'T2', to: 'APRON_PASSENGER_T2', relation: 'AIRSIDE_ADJACENCY' }),
    Object.freeze({ from: 'CONCOURSE_A', to: 'T1', relation: 'PASSENGER_TRANSFER' }),
    Object.freeze({ from: 'T1_T2_CONNECTOR', to: 'T1', relation: 'LANDSIDE_CONNECTS' }),
    Object.freeze({ from: 'T1_T2_CONNECTOR', to: 'T2', relation: 'LANDSIDE_CONNECTS' }),
  ]),
});

export function getSpatialObjects(map = INCHEON_SPATIAL_MAP) {
  return [
    ...map.facilities,
    ...map.gates,
    ...map.passengerFlows,
    ...map.vehicleFlows,
  ];
}
