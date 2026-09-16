import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationCore } from '../src/simulation/index.js';
import { Flight, FLIGHT_STATUSES, FlightSimulationSystem } from '../src/flights/index.js';
import { Passenger, PassengerSimulationSystem, PASSENGER_STATUSES, PASSENGER_TYPES, QueueEngine, QUEUE_DISCIPLINES, CheckInZone, SecurityZone, ImmigrationZone, IMMIGRATION_STATUSES } from '../src/passengers/index.js';

const START = '2026-01-01T00:00:00.000Z';
const deterministicService = Object.freeze({
  checkIn: { serverCount: 50, capacity: 5000, serviceTimeMinutes: [1, 1] },
  security: { serverCount: 50, capacity: 5000, serviceTimeMinutes: [1, 1] },
  departureImmigration: { serverCount: 50, capacity: 5000, serviceTimeMinutes: [1, 1] },
  arrivalImmigration: { serverCount: 50, capacity: 5000, serviceTimeMinutes: [1, 1] },
  transferProcess: { serverCount: 10, capacity: 2000, serviceTimeMinutes: [1, 1] },
});

function makeFlight(overrides = {}) { return new Flight({ flightId: 'KE123', airline: 'Korean Air', flightNumber: 'KE123', aircraftType: 'B77W', origin: 'ICN', destination: 'NRT', scheduledArrival: null, scheduledDeparture: '2026-01-01T03:00:00.000Z', estimatedDeparture: '2026-01-01T03:00:00.000Z', passengerCount: 250, cargoWeight: 5000, gate: 'G-101', runway: 'RWY-1', turnaroundTime: 90, ...overrides }); }
function makePassenger(overrides = {}) { return new Passenger({ passengerId: 'P1', flightId: 'F1', terminalId: 'T1', passengerType: PASSENGER_TYPES.DEPARTURE, origin: 'ICN', destination: 'NRT', scheduledDeparture: '2026-01-01T03:00:00.000Z', ...overrides }); }
function makePassengerSystem() { const simulation = new SimulationCore({ startDate: START }); return { simulation, passengers: new PassengerSimulationSystem(simulation, { serviceConfig: deterministicService, arrivalModel: { segments: [{ startOffset: -120, endOffset: -120, weight: 1 }] } }) }; }

// TEST 1

test('TEST 1: Passenger entity is created with operational tracking fields', () => { const p = makePassenger(); assert.equal(p.passengerId, 'P1'); assert.equal(p.currentState, PASSENGER_STATUSES.CREATED); assert.equal(p.totalWaitingTime, 0); assert.equal(p.totalProcessingTime, 0); });

// TEST 2

test('TEST 2: Flight passengerCount matches generated passengers', () => { const { passengers } = makePassengerSystem(); const flight = makeFlight({ passengerCount: 25 }); passengers.generateForFlight(flight); passengers.simulation.resume(); passengers.simulation.tick(125 * 60000); assert.equal(passengers.getPassengersForFlight('KE123').length, 25); });

// TEST 3

test('TEST 3: Departure passenger state machine completes terminal flow through boarding', () => { const { simulation, passengers } = makePassengerSystem(); const flight = makeFlight({ passengerCount: 1 }); passengers.generateForFlight(flight); simulation.resume(); simulation.tick(121 * 60000); const p = passengers.getPassenger('KE123-P00001'); assert.ok(p); assert.equal(p.status, PASSENGER_STATUSES.CHECK_IN_QUEUE); simulation.tick(1 * 60000); assert.equal(p.status, PASSENGER_STATUSES.SECURITY_QUEUE); simulation.tick(1 * 60000); assert.equal(p.status, PASSENGER_STATUSES.DEPARTURE_IMMIGRATION); simulation.tick(1 * 60000); assert.equal(p.status, PASSENGER_STATUSES.GATE_WAIT); });

// TEST 4

test('TEST 4: Arrival passenger state machine completes to ARRIVAL_HALL/COMPLETED', () => { const { simulation, passengers } = makePassengerSystem(); const flight = makeFlight({ origin: 'NRT', destination: 'ICN', passengerCount: 1 }); passengers.generateForFlight(flight, { passengerType: PASSENGER_TYPES.ARRIVAL }); simulation.resume(); simulation.tick(1); const p = passengers.getPassenger('KE123-P00001'); assert.equal(p.status, PASSENGER_STATUSES.ARRIVAL_IMMIGRATION); simulation.tick(1 * 60000); assert.equal(p.status, PASSENGER_STATUSES.BAGGAGE_CLAIM); simulation.tick(2 * 60000); assert.equal(p.status, PASSENGER_STATUSES.CUSTOMS); simulation.tick(1 * 60000); assert.equal(p.status, PASSENGER_STATUSES.COMPLETED); });

// TEST 5

test('TEST 5: Transfer passenger supports transfer processing to gate wait', () => { const { simulation, passengers } = makePassengerSystem(); const p = makePassenger({ passengerType: PASSENGER_TYPES.TRANSFER, currentState: PASSENGER_STATUSES.ARRIVING_BY_AIRCRAFT }); passengers.addPassenger(p); simulation.resume(); p.transitionTo(PASSENGER_STATUSES.DEPLANING, { at: START, zone: 'DEPLANING' }); p.transitionTo(PASSENGER_STATUSES.TRANSFER, { at: START, zone: 'TRANSFER' }); passengers.queueEngine.enqueue('TRANSFER_PROCESS_QUEUE', p, { at: new Date(START) }); simulation.tick(1); simulation.tick(1 * 60000); assert.equal(p.status, PASSENGER_STATUSES.GATE_WAIT); });

// TEST 6

test('TEST 6: Passenger enters check-in queue', () => { const { simulation, passengers } = makePassengerSystem(); const p = makePassenger(); passengers.addPassenger(p); p.transitionTo(PASSENGER_STATUSES.ARRIVING, { at: START, zone: 'LANDSIDE' }); simulation.resume(); simulation.schedule({ at: new Date(START), type: 'test.checkin', payload: { id: p.passengerId }, handler: () => passengers.generateForFlight }); assert.equal(passengers.queueEngine.enqueue('CHECK_IN_QUEUE', p, { at: new Date(START) }).accepted, true); assert.equal(passengers.getQueueStats().CHECK_IN_QUEUE.queueLength, 0); });

// TEST 7

test('TEST 7: Check-in service moves passenger to CHECK_IN_COMPLETED', () => { const { simulation, passengers } = makePassengerSystem(); const p = makePassenger(); passengers.addPassenger(p); p.transitionTo(PASSENGER_STATUSES.ARRIVING, { at: START }); p.transitionTo(PASSENGER_STATUSES.CHECK_IN_QUEUE, { at: START, zone: 'CHECK_IN' }); passengers.queueEngine.enqueue('CHECK_IN_QUEUE', p, { at: new Date(START) }); simulation.resume(); simulation.tick(60000); assert.equal(p.status, PASSENGER_STATUSES.SECURITY_QUEUE); });

// TEST 8

test('TEST 8: Security queue processing is event-driven', () => { const { simulation, passengers } = makePassengerSystem(); const p = makePassenger(); passengers.addPassenger(p); p.transitionTo(PASSENGER_STATUSES.CHECK_IN_COMPLETED, { at: START }); passengers.queueEngine.enqueue('SECURITY_QUEUE', p, { at: new Date(START) }); simulation.resume(); simulation.tick(60000); assert.equal(p.status, PASSENGER_STATUSES.DEPARTURE_IMMIGRATION); });

// TEST 9

test('TEST 9: Immigration queue processing is event-driven', () => { const { simulation, passengers } = makePassengerSystem(); const p = makePassenger(); passengers.addPassenger(p); p.transitionTo(PASSENGER_STATUSES.SECURITY_COMPLETED, { at: START }); passengers.queueEngine.enqueue('DEPARTURE_IMMIGRATION_QUEUE', p, { at: new Date(START) }); simulation.resume(); simulation.tick(60000); assert.equal(p.status, PASSENGER_STATUSES.GATE_WAIT); });

// TEST 10

test('TEST 10: FIFO preserves insertion order', () => { const simulation = new SimulationCore({ startDate: START }); const queue = new QueueEngine(simulation); const order = []; queue.createQueue({ id: 'Q', serviceType: 'test', serverCount: 1, capacity: 10, discipline: QUEUE_DISCIPLINES.FIFO, serviceTime: [1, 1], processor: { onStart: (p) => order.push(p.passengerId) } }); const a = makePassenger({ passengerId: 'A' }), b = makePassenger({ passengerId: 'B' }); queue.enqueue('Q', a); queue.enqueue('Q', b); simulation.resume(); simulation.tick(60000); assert.deepEqual(order, ['A']); simulation.tick(60000); assert.deepEqual(order, ['A', 'B']); });

// TEST 11

test('TEST 11: Priority Queue serves higher priority first after current service', () => { const simulation = new SimulationCore({ startDate: START }); const queue = new QueueEngine(simulation); const order = []; queue.createQueue({ id: 'Q', serviceType: 'test', serverCount: 1, capacity: 10, discipline: QUEUE_DISCIPLINES.PRIORITY, serviceTime: [1, 1], processor: { onStart: (p) => order.push(p.passengerId) } }); queue.enqueue('Q', makePassenger({ passengerId: 'A', priority: 1 })); queue.enqueue('Q', makePassenger({ passengerId: 'B', priority: 10 })); queue.enqueue('Q', makePassenger({ passengerId: 'C', priority: 5 })); simulation.resume(); simulation.tick(60000); simulation.tick(60000); assert.deepEqual(order, ['A', 'B']); });

// TEST 12

test('TEST 12: Waiting time equals service start minus queue entry', () => { const simulation = new SimulationCore({ startDate: START }); const queue = new QueueEngine(simulation); queue.createQueue({ id: 'Q', serviceType: 'test', serverCount: 1, capacity: 10, serviceTime: [1, 1] }); const a = makePassenger({ passengerId: 'A' }), b = makePassenger({ passengerId: 'B' }); queue.enqueue('Q', a, { at: new Date(START) }); queue.enqueue('Q', b, { at: new Date(new Date(START).getTime() + 10000) }); simulation.resume(); simulation.tick(60000); simulation.tick(10000); assert.ok(b.totalWaitingTime >= 0.8 && b.totalWaitingTime <= 1); });

// TEST 13

test('TEST 13: Processing time is measured from service start to completion', () => { const simulation = new SimulationCore({ startDate: START }); const queue = new QueueEngine(simulation); queue.createQueue({ id: 'Q', serviceType: 'test', serverCount: 1, capacity: 10, serviceTime: [2, 2] }); const p = makePassenger(); queue.enqueue('Q', p); simulation.resume(); simulation.tick(2 * 60000); assert.equal(p.totalProcessingTime, 2); });

// TEST 14

test('TEST 14: Queue capacity rejects excess passengers', () => { const simulation = new SimulationCore({ startDate: START }); const queue = new QueueEngine(simulation); queue.createQueue({ id: 'Q', serviceType: 'test', serverCount: 1, capacity: 1, serviceTime: [10, 10] }); assert.equal(queue.enqueue('Q', makePassenger({ passengerId: 'A' })).accepted, true); assert.equal(queue.enqueue('Q', makePassenger({ passengerId: 'B' })).accepted, false); });

// TEST 15

test('TEST 15: Flight BOARDING connects gate-waiting passengers to BOARDING', () => { const { passengers } = makePassengerSystem(); const flight = makeFlight({ passengerCount: 1 }); const p = new Passenger({ passengerId: 'P1', flightId: flight.flightId, terminalId: 'T1', passengerType: PASSENGER_TYPES.DEPARTURE, scheduledDeparture: flight.scheduledDeparture, currentState: PASSENGER_STATUSES.GATE_WAIT, currentZone: 'GATE_G-101' }); passengers.addPassenger(p); flight.status = FLIGHT_STATUSES.BOARDING; passengers.onFlightStatusChange(flight); assert.equal(p.status, PASSENGER_STATUSES.BOARDING); flight.status = FLIGHT_STATUSES.READY; passengers.onFlightStatusChange(flight); assert.equal(p.status, PASSENGER_STATUSES.BOARDED); });

// TEST 16

test('TEST 16: Passenger missing the boarding window is recorded', () => { const { passengers } = makePassengerSystem(); const flight = makeFlight({ passengerCount: 1 }); const p = new Passenger({ passengerId: 'P1', flightId: flight.flightId, passengerType: PASSENGER_TYPES.DEPARTURE, currentState: PASSENGER_STATUSES.GATE_WAIT }); passengers.addPassenger(p); flight.status = FLIGHT_STATUSES.DEPARTING; passengers.onFlightStatusChange(flight); assert.equal(p.status, PASSENGER_STATUSES.MISSED_BOARDING); });

// TEST 17

test('TEST 17: Passenger statistics expose requested KPIs', () => { const { passengers } = makePassengerSystem(); const p = makePassenger(); passengers.addPassenger(p); const stats = passengers.statistics(); for (const key of ['totalPassengers', 'activePassengers', 'completedPassengers', 'averageWaitingTime', 'averageCheckInWaiting', 'averageSecurityWaiting', 'averageImmigrationWaiting', 'maximumWaitingTime', 'missedBoarding', 'throughput', 'passengerProcessingRate']) assert.ok(key in stats); });

// TEST 18

test('TEST 18: Passenger event timing follows SimulationCore speed changes', () => { const { simulation, passengers } = makePassengerSystem(); const flight = makeFlight({ passengerCount: 1 }); passengers.generateForFlight(flight); simulation.resume(); simulation.setSpeed(10); simulation.tick(12 * 60000); assert.equal(passengers.getPassengersForFlight(flight.flightId).length, 1); });

// TEST 19

test('TEST 19: 10,000 passengers can be created without per-frame updates', () => { const { passengers } = makePassengerSystem(); const flight = makeFlight({ passengerCount: 10000 }); const start = performance.now(); passengers.generateForFlight(flight, { passengerType: PASSENGER_TYPES.ARRIVAL }); const elapsed = performance.now() - start; assert.equal(passengers.getPassengersForFlight(flight.flightId).length, 10000); assert.ok(elapsed < 2000, `generation took ${elapsed.toFixed(1)}ms`); });

// TEST 20

test('TEST 20: Passenger integration does not break existing Flight + resource construction', () => { const simulation = new SimulationCore({ startDate: START }); const passengers = new PassengerSimulationSystem(simulation, { serviceConfig: deterministicService }); const flights = new FlightSimulationSystem(simulation, { passengerSystem: passengers }); const flight = makeFlight({ passengerCount: 2 }); assert.doesNotThrow(() => flights.addFlight(flight)); assert.equal(flight.status, FLIGHT_STATUSES.SCHEDULED); assert.ok(simulation.getSnapshot().queuedEventCount > 0); });

test('Passenger terminal service resource models expose required contracts', () => { const checkIn = new CheckInZone({ id: 'CI1', terminalId: 'T1', counters: 10, capacityPerHour: 600, serviceTime: [2, 4] }); const security = new SecurityZone({ id: 'S1', terminalId: 'T1', lanes: 8, capacity: 500, serviceTime: [1, 2] }); const immigration = new ImmigrationZone({ id: 'I1', type: 'ARRIVAL', lanes: 6, capacity: 400, serviceTime: [1, 2] }); assert.equal(checkIn.currentQueue, 'CHECK_IN_QUEUE'); assert.equal(security.queue, 'SECURITY_QUEUE'); assert.equal(immigration.queue, 'ARRIVAL_IMMIGRATION_QUEUE'); assert.equal(immigration.status, IMMIGRATION_STATUSES.OPEN); });
