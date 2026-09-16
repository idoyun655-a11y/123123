import { PASSENGER_ARRIVAL_MODEL, PASSENGER_SERVICE_CONFIG } from './config.js';
import { PASSENGER_STATUSES, PASSENGER_TYPES, Passenger } from './model.js';
import { QueueEngine, QUEUE_DISCIPLINES } from './queue.js';

const TERMINAL_KNOWN = new Set(['T1', 'T2']);

export class PassengerSimulationSystem {
  #passengers = new Map();
  #flightPassengers = new Map();
  #generationBatches = new Map();

  constructor(simulation, { queueEngine = null, arrivalModel = PASSENGER_ARRIVAL_MODEL, serviceConfig = PASSENGER_SERVICE_CONFIG } = {}) {
    if (!simulation || typeof simulation.schedule !== 'function') throw new TypeError('A SimulationCore-compatible instance is required.');
    this.simulation = simulation;
    this.arrivalModel = arrivalModel;
    this.serviceConfig = serviceConfig;
    this.queueEngine = queueEngine ?? new QueueEngine(simulation);
    this.#createDefaultQueues();
  }

  addPassenger(passenger) { if (!(passenger instanceof Passenger)) throw new TypeError('Passenger instance required.'); if (this.#passengers.has(passenger.passengerId)) throw new Error(`Passenger already exists: ${passenger.passengerId}`); this.#passengers.set(passenger.passengerId, passenger); if (!this.#flightPassengers.has(passenger.flightId)) this.#flightPassengers.set(passenger.flightId, new Set()); this.#flightPassengers.get(passenger.flightId).add(passenger.passengerId); return passenger.passengerId; }
  getPassenger(id) { return this.#passengers.get(id) ?? null; }
  getPassengers() { return [...this.#passengers.values()]; }
  getPassengersForFlight(flightId) { return [...(this.#flightPassengers.get(flightId) ?? [])].map((id) => this.getPassenger(id)).filter(Boolean); }
  getQueue(id) { return this.queueEngine.getQueue(id); }
  getQueueStats() { return Object.fromEntries(this.queueEngine.listQueues().map((q) => [q.id, this.queueEngine.stats(q.id)])); }

  generateForFlight(flight, { passengerType = inferPassengerType(flight), terminalId = flight.terminalId ?? null, count = flight.passengerCount } = {}) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError('Passenger count must be a non-negative integer.');
    if (count === 0) return [];
    const ids = [];
    const departure = passengerType === PASSENGER_TYPES.DEPARTURE;
    const scheduledDeparture = flight.scheduledDeparture ?? flight.estimatedDeparture;
    if (departure && scheduledDeparture) {
      const batches = distributeArrivalTimes(count, scheduledDeparture, this.arrivalModel);
      for (let i = 0; i < batches.length; i += 1) {
        const times = batches[i];
        this.#scheduleGenerationBatch(flight, passengerType, terminalId, times, i);
      }
    } else {
      ids.push(...this.#createBatchNow(flight, passengerType, terminalId, count, this.simulation.getSnapshot().currentTime));
    }
    this.#generationBatches.set(flight.flightId, { count, passengerType, terminalId });
    return ids;
  }

  onFlightStatusChange(flight) {
    const status = flight.status;
    if (status === 'LANDED' && inferPassengerType(flight) === PASSENGER_TYPES.ARRIVAL && !this.#flightPassengers.has(flight.flightId)) this.generateForFlight(flight, { passengerType: PASSENGER_TYPES.ARRIVAL });
    if (status === 'BOARDING') this.#startBoarding(flight);
    if (status === 'READY' || status === 'DEPARTING' || status === 'AIRBORNE') this.#closeBoarding(flight);
  }

  statistics() {
    const passengers = this.getPassengers();
    const completed = passengers.filter((p) => [PASSENGER_STATUSES.BOARDED, PASSENGER_STATUSES.COMPLETED].includes(p.status)).length;
    const missed = passengers.filter((p) => p.status === PASSENGER_STATUSES.MISSED_BOARDING).length;
    const totalWaiting = passengers.reduce((s, p) => s + p.totalWaitingTime, 0);
    const totalProcessing = passengers.reduce((s, p) => s + p.totalProcessingTime, 0);
    const active = passengers.length - completed - missed;
    const facilityWait = (ids) => aggregateQueueWait(this.queueEngine, ids);
    return {
      totalPassengers: passengers.length,
      activePassengers: Math.max(0, active),
      completedPassengers: completed,
      averageWaitingTime: passengers.length ? totalWaiting / passengers.length : 0,
      averageCheckInWaiting: facilityWait(['CHECK_IN_QUEUE']),
      averageSecurityWaiting: facilityWait(['SECURITY_QUEUE']),
      averageImmigrationWaiting: facilityWait(['DEPARTURE_IMMIGRATION_QUEUE', 'ARRIVAL_IMMIGRATION_QUEUE']),
      maximumWaitingTime: Math.max(0, ...passengers.map((p) => p.totalWaitingTime)),
      missedBoarding: missed,
      throughput: this.queueEngine.listQueues().reduce((s, q) => s + q.completed, 0),
      passengerProcessingRate: this.#processingRate(),
      queues: this.getQueueStats(),
      totalWaitingMinutes: totalWaiting,
      totalProcessingMinutes: totalProcessing,
    };
  }

  #createDefaultQueues() {
    this.queueEngine.createQueue({ id: 'CHECK_IN_QUEUE', serviceType: 'checkin', serverCount: this.serviceConfig.checkIn.serverCount, capacity: this.serviceConfig.checkIn.capacity, discipline: QUEUE_DISCIPLINES.FIFO, serviceTime: this.serviceConfig.checkIn.serviceTimeMinutes, zone: 'CHECK_IN' });
    this.queueEngine.createQueue({ id: 'SECURITY_QUEUE', serviceType: 'security', serverCount: this.serviceConfig.security.serverCount, capacity: this.serviceConfig.security.capacity, discipline: QUEUE_DISCIPLINES.FIFO, serviceTime: this.serviceConfig.security.serviceTimeMinutes, zone: 'SECURITY' });
    this.queueEngine.createQueue({ id: 'DEPARTURE_IMMIGRATION_QUEUE', serviceType: 'departure-immigration', serverCount: this.serviceConfig.departureImmigration.serverCount, capacity: this.serviceConfig.departureImmigration.capacity, discipline: QUEUE_DISCIPLINES.FIFO, serviceTime: this.serviceConfig.departureImmigration.serviceTimeMinutes, zone: 'DEPARTURE_IMMIGRATION' });
    this.queueEngine.createQueue({ id: 'ARRIVAL_IMMIGRATION_QUEUE', serviceType: 'arrival-immigration', serverCount: this.serviceConfig.arrivalImmigration.serverCount, capacity: this.serviceConfig.arrivalImmigration.capacity, discipline: QUEUE_DISCIPLINES.FIFO, serviceTime: this.serviceConfig.arrivalImmigration.serviceTimeMinutes, zone: 'ARRIVAL_IMMIGRATION' });
    this.queueEngine.createQueue({ id: 'TRANSFER_PROCESS_QUEUE', serviceType: 'transfer', serverCount: this.serviceConfig.transferProcess.serverCount, capacity: this.serviceConfig.transferProcess.capacity, discipline: QUEUE_DISCIPLINES.PRIORITY, serviceTime: this.serviceConfig.transferProcess.serviceTimeMinutes, zone: 'TRANSFER' });
  }

  #scheduleGenerationBatch(flight, type, terminalId, times, batchIndex) {
    const at = new Date(Math.max(...times.map((x) => x.getTime())));
    this.simulation.schedule({ at, type: 'passenger.generation.batch', payload: { flightId: flight.flightId, type, terminalId, times: times.map((x) => x.toISOString()), batchIndex }, handler: ({ event }) => {
      const current = this.simulation.getSnapshot().currentTime;
      const creationTime = new Date(current);
      const created = this.#createBatch(flight, type, terminalId, event.payload.times.map((x) => new Date(x)), creationTime);
      this.simulation.logger.info('PassengerGenerationBatchEvent', { flightId: flight.flightId, count: created.length, batchIndex: event.payload.batchIndex });
    });
  }

  #createBatchNow(flight, type, terminalId, count, at) { return this.#createBatch(flight, type, terminalId, Array.from({ length: count }, () => new Date(at)), at).map((p) => p.passengerId); }
  #createBatch(flight, type, terminalId, times, creationAt) {
    const created = [];
    const startIndex = this.getPassengersForFlight(flight.flightId).length;
    times.forEach((time, offset) => {
      const passenger = new Passenger({ passengerId: `${flight.flightId}-P${String(startIndex + offset + 1).padStart(4, '0')}`, flightId: flight.flightId, terminalId: terminalId ?? inferTerminal(flight), passengerType: type, origin: flight.origin, destination: flight.destination, arrivalTime: time, scheduledDeparture: flight.scheduledDeparture, currentState: type === PASSENGER_TYPES.DEPARTURE ? PASSENGER_STATUSES.CREATED : PASSENGER_STATUSES.ARRIVING_BY_AIRCRAFT, currentZone: type === PASSENGER_TYPES.DEPARTURE ? 'LANDSIDE' : 'AIRCRAFT', connectionTime: flight.connectionTime ?? null, priority: flight.operationalFlags?.emergency ? 100 : 0 });
      this.addPassenger(passenger); created.push(passenger);
      if (type === PASSENGER_TYPES.DEPARTURE) {
        passenger.transitionTo(PASSENGER_STATUSES.ARRIVING, { at: creationAt, zone: 'LANDSIDE' });
        this.simulation.schedule({ at: new Date(Math.max(creationAt.getTime(), time.getTime())), type: 'passenger.checkin.queue', payload: { passengerId: passenger.passengerId }, handler: ({ event }) => this.#enterCheckIn(event.payload.passengerId, event.at) });
      } else if (type === PASSENGER_TYPES.ARRIVAL) {
        this.simulation.schedule({ at: creationAt, type: 'passenger.deplaning', payload: { passengerId: passenger.passengerId }, handler: ({ event }) => { const p = this.getPassenger(event.payload.passengerId); if (p?.currentState === PASSENGER_STATUSES.ARRIVING_BY_AIRCRAFT) p.transitionTo(PASSENGER_STATUSES.DEPLANING, { at: event.at, zone: 'DEPLANING' }); this.#enterArrivalImmigration(p?.passengerId, event.at); } });
      }
    });
    return created;
  }

  #enterCheckIn(id, at) { const p = this.getPassenger(id); if (!p || p.status !== PASSENGER_STATUSES.ARRIVING) return; p.transitionTo(PASSENGER_STATUSES.CHECK_IN_QUEUE, { at, zone: 'CHECK_IN' }); const r = this.queueEngine.enqueue('CHECK_IN_QUEUE', p, { at }); if (!r.accepted) { p.markMissedBoarding(at, 'check-in queue capacity exceeded'); return; } }

  #enterSecurity(id, at) { const p = this.getPassenger(id); if (!p || p.status !== PASSENGER_STATUSES.CHECK_IN_COMPLETED) return; p.transitionTo(PASSENGER_STATUSES.SECURITY_QUEUE, { at, zone: 'SECURITY' }); this.queueEngine.enqueue('SECURITY_QUEUE', p, { at }); }
  #enterDepartureImmigration(id, at) { const p = this.getPassenger(id); if (!p || p.status !== PASSENGER_STATUSES.SECURITY_COMPLETED) return; p.transitionTo(PASSENGER_STATUSES.DEPARTURE_IMMIGRATION, { at, zone: 'DEPARTURE_IMMIGRATION' }); this.queueEngine.enqueue('DEPARTURE_IMMIGRATION_QUEUE', p, { at }); }
  #enterArrivalImmigration(id, at) { const p = this.getPassenger(id); if (!p || p.status !== PASSENGER_STATUSES.DEPLANING) return; p.transitionTo(PASSENGER_STATUSES.ARRIVAL_IMMIGRATION, { at, zone: 'ARRIVAL_IMMIGRATION' }); this.queueEngine.enqueue('ARRIVAL_IMMIGRATION_QUEUE', p, { at }); }
  #enterTransfer(id, at) { const p = this.getPassenger(id); if (!p || p.status !== PASSENGER_STATUSES.TRANSFER) return; p.transitionTo(PASSENGER_STATUSES.TRANSFER_PROCESS, { at, zone: 'TRANSFER' }); this.queueEngine.enqueue('TRANSFER_PROCESS_QUEUE', p, { at }); }

  #startBoarding(flight) {
    for (const p of this.getPassengersForFlight(flight.flightId)) {
      if (p.status === PASSENGER_STATUSES.GATE_WAIT) p.transitionTo(PASSENGER_STATUSES.BOARDING, { at: this.simulation.getSnapshot().currentTime, zone: `GATE_${flight.gate ?? 'UNKNOWN'}` });
    }
  }
  #closeBoarding(flight) {
    const now = this.simulation.getSnapshot().currentTime;
    for (const p of this.getPassengersForFlight(flight.flightId)) {
      if (p.status === PASSENGER_STATUSES.BOARDING || p.status === PASSENGER_STATUSES.GATE_WAIT) p.markMissedBoarding(now, flight.status === 'AIRBORNE' ? 'flight departed' : 'boarding deadline reached');
    }
  }
  #processingRate() { const total = this.getPassengers().filter((p) => [PASSENGER_STATUSES.COMPLETED, PASSENGER_STATUSES.BOARDED].includes(p.status)).length; const start = this.getPassengers().map((p) => p.arrivalTime?.getTime()).filter(Number.isFinite); if (!total || !start.length) return 0; const elapsed = Math.max(1, (this.simulation.getSnapshot().currentTime.getTime() - Math.min(...start)) / 3_600_000); return total / elapsed; }
}

function inferPassengerType(flight) { if (flight.passengerType && Object.values(PASSENGER_TYPES).includes(flight.passengerType)) return flight.passengerType; if (String(flight.destination).toUpperCase() === 'ICN') return PASSENGER_TYPES.ARRIVAL; return PASSENGER_TYPES.DEPARTURE; }
function inferTerminal(flight) { return TERMINAL_KNOWN.has(flight.terminalId) ? flight.terminalId : null; }
function distributeArrivalTimes(count, scheduledDeparture, model) { const rng = Math.random; const segments = model.segments; const output = []; const totalWeight = segments.reduce((s, x) => s + x.weight, 0); for (const segment of segments) { const portion = Math.floor(count * segment.weight / totalWeight); for (let i = 0; i < portion; i += 1) output.push(randomSegmentTime(scheduledDeparture, segment, rng)); }
  while (output.length < count) { const segment = segments[segments.length - 1]; output.push(randomSegmentTime(scheduledDeparture, segment, rng)); } return output.sort((a, b) => a - b);
}
function randomSegmentTime(scheduled, segment, rng) { const start = new Date(new Date(scheduled).getTime() + segment.startOffset * 60_000); const end = new Date(new Date(scheduled).getTime() + segment.endOffset * 60_000); return new Date(start.getTime() + rng() * (end.getTime() - start.getTime())); }
function aggregateQueueWait(engine, ids) { const stats = ids.map((id) => engine.getQueue(id) ? engine.stats(id) : null).filter(Boolean); if (!stats.length) return 0; const completed = stats.reduce((s, x) => s + x.throughput, 0); return completed ? stats.reduce((s, x) => s + x.averageWaitingTime * x.throughput, 0) / completed : 0; }
