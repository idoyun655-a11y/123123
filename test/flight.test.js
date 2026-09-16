import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationCore } from '../src/simulation/index.js';
import { Flight, FLIGHT_STATUSES, FlightSimulationSystem } from '../src/flights/index.js';

const START = '2026-01-01T00:00:00.000Z';

function makeFlight(overrides = {}) {
  return new Flight({
    flightId: 'KE001', airline: 'Korean Air', flightNumber: 'KE001', aircraftType: 'B77W',
    origin: 'NRT', destination: 'ICN',
    scheduledArrival: '2026-01-01T00:10:00.000Z',
    scheduledDeparture: '2026-01-01T01:10:00.000Z',
    passengerCount: 300, cargoWeight: 12000, gate: 'GATE-T2-01', runway: 'RWY-3', turnaroundTime: 60,
    ...overrides,
  });
}

test('flight model exposes required fields and starts scheduled', () => {
  const flight = makeFlight();
  assert.equal(flight.status, FLIGHT_STATUSES.SCHEDULED);
  for (const field of ['flightId', 'airline', 'flightNumber', 'aircraftType', 'origin', 'destination', 'scheduledArrival', 'estimatedArrival', 'scheduledDeparture', 'estimatedDeparture', 'passengerCount', 'cargoWeight', 'gate', 'runway', 'turnaroundTime', 'delayMinutes', 'status']) {
    assert.ok(field in flight, `missing field ${field}`);
  }
});

test('arrival lifecycle follows simulation time', () => {
  const simulation = new SimulationCore({ startDate: START });
  const flights = new FlightSimulationSystem(simulation);
  const flight = makeFlight();
  flights.addFlight(flight);
  simulation.resume();

  simulation.tick(10_000);
  assert.equal(flight.status, FLIGHT_STATUSES.SCHEDULED);
  simulation.tick(5 * 60_000);
  assert.equal(flight.status, FLIGHT_STATUSES.APPROACHING);
  simulation.tick(5 * 60_000);
  assert.equal(flight.status, FLIGHT_STATUSES.LANDED);
  simulation.tick(10 * 60_000);
  assert.equal(flight.status, FLIGHT_STATUSES.AT_GATE);
  simulation.tick(30 * 60_000);
  assert.equal(flight.status, FLIGHT_STATUSES.BOARDING);
  simulation.tick(30 * 60_000);
  assert.equal(flight.status, FLIGHT_STATUSES.READY);
});

test('departure lifecycle reaches airborne', () => {
  const simulation = new SimulationCore({ startDate: START });
  const flights = new FlightSimulationSystem(simulation);
  const flight = makeFlight({ scheduledArrival: null });
  flight.transitionTo(FLIGHT_STATUSES.READY, { at: START });
  flights.addFlight(flight);
  simulation.resume();

  simulation.tick(70 * 60_000);
  assert.equal(flight.status, FLIGHT_STATUSES.DEPARTING);
  simulation.tick(5 * 60_000);
  assert.equal(flight.status, FLIGHT_STATUSES.AIRBORNE);
});

test('delay updates estimated times and marks flight delayed', () => {
  const flight = makeFlight();
  flight.recordDelay(20, { reason: 'test delay' });
  assert.equal(flight.status, FLIGHT_STATUSES.DELAYED);
  assert.equal(flight.estimatedArrival.toISOString(), '2026-01-01T00:30:00.000Z');
  assert.equal(flight.estimatedDeparture.toISOString(), '2026-01-01T01:30:00.000Z');
});

test('cancelled flight cannot re-enter the lifecycle', () => {
  const simulation = new SimulationCore({ startDate: START });
  const flights = new FlightSimulationSystem(simulation);
  const flight = makeFlight();
  flights.addFlight(flight);
  assert.equal(flights.cancelFlight('KE001'), true);
  assert.throws(() => flight.transitionTo(FLIGHT_STATUSES.SCHEDULED), /terminal flight/);
});
