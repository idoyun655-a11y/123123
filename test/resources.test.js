import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationCore } from '../src/simulation/index.js';
import { Flight, FLIGHT_STATUSES, FlightSimulationSystem } from '../src/flights/index.js';
import { Gate, GATE_STATUSES, GateSystem, Runway, RUNWAY_REQUEST_TYPES, RUNWAY_STATUSES, RunwaySystem } from '../src/resources/index.js';

const START = '2026-01-01T00:00:00.000Z';
const atMinutes = (minutes) => new Date(Date.parse(START) + minutes * 60_000);

function makeFlight(id, overrides = {}) {
  return new Flight({
    flightId: id,
    airline: 'Korean Air',
    flightNumber: id,
    aircraftType: 'B77W',
    origin: 'NRT',
    destination: 'ICN',
    scheduledArrival: atMinutes(10),
    scheduledDeparture: atMinutes(100),
    passengerCount: 300,
    cargoWeight: 12000,
    turnaroundTime: 90,
    gateRequirements: { terminalId: 'T1', aircraftSize: 'LARGE', requiresJetBridge: true },
    ...overrides,
  });
}

function makeGate(id, overrides = {}) {
  return new Gate({
    gateId: id,
    terminalId: 'T1',
    location: { x: 100, y: 100 },
    gateType: 'CONTACT',
    compatibleAircraft: ['B77W'],
    internationalDomestic: 'INTERNATIONAL',
    jetBridge: true,
    busGate: false,
    properties: { aircraftSizes: ['LARGE', 'HEAVY'] },
    ...overrides,
  });
}

function makeRunway(id, overrides = {}) {
  return new Runway({ runwayId: id, name: id, length: 4000, width: 60, ...overrides });
}

test('TEST 1: one flight receives a compatible gate', () => {
  const sim = new SimulationCore({ startDate: START });
  const gates = new GateSystem(sim);
  gates.addGate(makeGate('G1'));
  const flight = makeFlight('F1');
  const result = gates.assignBestGate(flight);
  assert.equal(result.assigned, true);
  assert.equal(flight.gate, 'G1');
  assert.equal(gates.getGate('G1').status, GATE_STATUSES.RESERVED);
});

test('TEST 2: incompatible aircraft cannot receive the gate', () => {
  const sim = new SimulationCore({ startDate: START });
  const gates = new GateSystem(sim);
  gates.addGate(makeGate('G1', { compatibleAircraft: ['A320'], properties: { aircraftSizes: ['MEDIUM'] } }));
  const flight = makeFlight('F1');
  const result = gates.assignBestGate(flight);
  assert.equal(result.assigned, false);
});

test('TEST 3: overlapping reservations are detected as gate conflict', () => {
  const sim = new SimulationCore({ startDate: START });
  const gates = new GateSystem(sim);
  const gate = makeGate('G1');
  gates.addGate(gate);
  gate.reserve('F1', atMinutes(10), atMinutes(70));
  assert.equal(gates.checkReservationConflict('G1', atMinutes(30), atMinutes(90), 'F2'), true);
});

test('TEST 4: flight is automatically assigned to another compatible gate', () => {
  const sim = new SimulationCore({ startDate: START });
  const gates = new GateSystem(sim);
  const occupied = makeGate('G1');
  occupied.reserve('OTHER', atMinutes(10), atMinutes(70));
  gates.addGates([occupied, makeGate('G2')]);
  const flight = makeFlight('F1');
  const result = gates.assignBestGate(flight);
  assert.equal(result.assigned, true);
  assert.equal(flight.gate, 'G2');
});

test('TEST 5: when all gates are unavailable, the flight enters gate waiting', () => {
  const sim = new SimulationCore({ startDate: START });
  const gates = new GateSystem(sim);
  gates.addGate(makeGate('G1', { status: GATE_STATUSES.BLOCKED }));
  const flight = makeFlight('F1');
  const result = gates.waitForGate(flight);
  assert.equal(result.waiting, true);
  assert.deepEqual(gates.getWaitingFlights(), ['F1']);
  assert.ok(flight.delayMinutes > 0);
});

test('TEST 6: runway is allocated immediately when available', () => {
  const sim = new SimulationCore({ startDate: START });
  const runways = new RunwaySystem(sim);
  runways.addRunway(makeRunway('RWY-1'));
  const flight = makeFlight('F1');
  const result = runways.requestLanding(flight);
  assert.equal(result.assigned, true);
  assert.equal(flight.runway, 'RWY-1');
  assert.equal(runways.getRunway('RWY-1').status, RUNWAY_STATUSES.OCCUPIED);
});

test('TEST 7: occupied runway places the next flight into LandingQueue', () => {
  const sim = new SimulationCore({ startDate: START });
  const runways = new RunwaySystem(sim);
  runways.addRunway(makeRunway('RWY-1'));
  const first = makeFlight('F1');
  const second = makeFlight('F2', { scheduledArrival: atMinutes(11) });
  runways.requestLanding(first);
  const result = runways.requestLanding(second);
  assert.equal(result.queued, true);
  assert.equal(runways.getLandingQueue().length, 1);
});

test('TEST 8: LandingQueue is processed after runway release', () => {
  const sim = new SimulationCore({ startDate: START });
  const runways = new RunwaySystem(sim);
  runways.addRunway(makeRunway('RWY-1'));
  const first = makeFlight('F1');
  const second = makeFlight('F2', { scheduledArrival: atMinutes(11) });
  let started = false;
  runways.requestLanding(first);
  runways.requestLanding(second, { onStart: () => { started = true; } });
  sim.resume();
  sim.tick(5 * 60_000);
  assert.equal(started, true);
  assert.equal(runways.getLandingQueue().length, 0);
});

test('TEST 9: DepartureQueue is processed after runway release', () => {
  const sim = new SimulationCore({ startDate: START });
  const runways = new RunwaySystem(sim);
  runways.addRunway(makeRunway('RWY-1'));
  const landing = makeFlight('F1');
  const departure = makeFlight('F2', { scheduledArrival: null, scheduledDeparture: atMinutes(20) });
  runways.requestLanding(landing);
  let started = false;
  runways.requestDeparture(departure, { onStart: () => { started = true; } });
  sim.resume();
  sim.tick(5 * 60_000);
  assert.equal(started, true);
  assert.equal(runways.getDepartureQueue().length, 0);
});

test('TEST 10: runway conflict prevents simultaneous use of one runway', () => {
  const runway = makeRunway('RWY-1');
  assert.equal(runway.reserve('F1', atMinutes(0), atMinutes(5)), true);
  assert.equal(runway.reserve('F2', atMinutes(0), atMinutes(5)), false);
  assert.equal(runway.currentFlightId, 'F1');
});

test('TEST 11: gate capacity delay propagates to flight delayMinutes', () => {
  const sim = new SimulationCore({ startDate: START });
  const gates = new GateSystem(sim);
  const gate = makeGate('G1');
  gate.reserve('OTHER', atMinutes(10), atMinutes(70));
  gates.addGate(gate);
  const flight = makeFlight('F1');
  const result = gates.prepareFlightGate(flight);
  assert.equal(result.assigned, true);
  assert.equal(flight.delayMinutes, 60);
  assert.equal(flight.estimatedArrival.toISOString(), atMinutes(70).toISOString());
  assert.equal(flight.gate, 'G1');
});

test('TEST 12: runway queue delay propagates to flight delayMinutes', () => {
  const sim = new SimulationCore({ startDate: START });
  const runways = new RunwaySystem(sim);
  runways.addRunway(makeRunway('RWY-1'));
  const first = makeFlight('F1');
  const second = makeFlight('F2');
  runways.requestLanding(first);
  const queued = runways.requestLanding(second);
  assert.equal(queued.queued, true);
  sim.resume();
  sim.tick(5 * 60_000);
  assert.equal(second.delayMinutes, 5);
});

test('TEST 13: simulation speed change preserves resource event timing in simulation time', () => {
  const sim = new SimulationCore({ startDate: START, speed: 2 });
  const gates = new GateSystem(sim);
  const runways = new RunwaySystem(sim);
  gates.addGate(makeGate('G1'));
  runways.addRunway(makeRunway('RWY-1'));
  const flights = new FlightSimulationSystem(sim, { gateSystem: gates, runwaySystem: runways });
  const flight = makeFlight('F1', { scheduledArrival: atMinutes(10), scheduledDeparture: atMinutes(100) });
  flights.addFlight(flight);
  sim.resume();
  sim.tick(5 * 60_000);
  assert.equal(sim.getSnapshot().currentTime.toISOString(), atMinutes(10).toISOString());
  assert.equal(flight.status, FLIGHT_STATUSES.LANDED);
  assert.equal(flight.runway, 'RWY-1');
});
