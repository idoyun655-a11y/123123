import { INCHEON_AIRPORT_DATA } from '../data/incheon.js';
import { INCHEON_SPATIAL_MAP } from '../data/spatial.js';
import { Gate } from './gate.js';
import { Runway } from './runway.js';

const T1_GATE_COUNT = 163;
const T2_GATE_COUNT = 73;

function makeEstimatedGate(gateId, terminalId, index, count, center) {
  const columns = Math.ceil(Math.sqrt(count));
  const spacing = 28;
  const row = Math.floor(index / columns);
  const column = index % columns;
  return new Gate({
    gateId,
    terminalId,
    location: { x: center.x + column * spacing, y: center.y + row * spacing },
    gateType: null,
    compatibleAircraft: null,
    internationalDomestic: null,
    jetBridge: null,
    busGate: null,
    capacity: { stands: 1 },
    sourceType: 'ESTIMATED',
    properties: {
      sourceTypeNote: 'Individual gate geometry/capability is not individually published in the current public dataset.',
      representation: 'Simulated gate resource derived from public passenger apron stand totals.',
    },
  });
}

export const INCHEON_GATE_RESOURCES = Object.freeze([
  ...Array.from({ length: T1_GATE_COUNT }, (_, index) => makeEstimatedGate(`T1-GATE-${String(index + 1).padStart(3, '0')}`, 'T1', index, T1_GATE_COUNT, INCHEON_SPATIAL_MAP.gates[0])),
  ...Array.from({ length: T2_GATE_COUNT }, (_, index) => makeEstimatedGate(`T2-GATE-${String(index + 1).padStart(3, '0')}`, 'T2', index, T2_GATE_COUNT, INCHEON_SPATIAL_MAP.gates[1])),
]);

export const INCHEON_RUNWAY_RESOURCES = Object.freeze(
  INCHEON_AIRPORT_DATA.runways.map((runway) => new Runway({
    runwayId: runway.id,
    name: runway.name,
    length: runway.size?.length ?? null,
    width: runway.size?.width ?? null,
    operationType: null,
    status: 'AVAILABLE',
    maintenanceStatus: 'NORMAL',
  })),
);

export const RESOURCE_DATA_POLICY = Object.freeze({
  gateInventoryCount: 'REAL total passenger apron stands (236); individual gate identity, geometry and capability are ESTIMATED.',
  runwayDimensions: 'REAL public dimensions; operationType is intentionally left null because a verified public mapping is not established in this dataset.',
});
