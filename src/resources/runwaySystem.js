import { RUNWAY_PRIORITY_WEIGHTS, RESOURCE_RETRY_INTERVAL_MS } from './config.js';
import { RUNWAY_REQUEST_TYPES, RUNWAY_STATUSES, calculateRunwayPriority, operationDuration } from './runway.js';

export class RunwaySystem {
  #runways = new Map();
  #landingQueue = [];
  #departureQueue = [];
  #sequence = 0;
  #retryScheduled = false;

  constructor(simulation, { weights = RUNWAY_PRIORITY_WEIGHTS } = {}) {
    if (!simulation || typeof simulation.schedule !== 'function') throw new TypeError('A SimulationCore-compatible instance is required.');
    this.simulation = simulation;
    this.weights = Object.freeze({ ...weights });
  }

  addRunway(runway) {
    if (!runway || !runway.runwayId) throw new TypeError('A valid Runway is required.');
    if (this.#runways.has(runway.runwayId)) throw new Error(`Runway already exists: ${runway.runwayId}`);
    this.#runways.set(runway.runwayId, runway);
    return runway.runwayId;
  }

  addRunways(runways) { runways.forEach((runway) => this.addRunway(runway)); }
  getRunway(runwayId) { return this.#runways.get(runwayId) ?? null; }
  getRunways() { return [...this.#runways.values()]; }

  requestLanding(flight, { onStart = null, onRelease = null } = {}) {
    return this.#request(flight, RUNWAY_REQUEST_TYPES.LANDING, onStart, onRelease);
  }

  requestDeparture(flight, { onStart = null, onRelease = null } = {}) {
    return this.#request(flight, RUNWAY_REQUEST_TYPES.DEPARTURE, onStart, onRelease);
  }

  cancelRequests(flightId) {
    const before = this.#landingQueue.length + this.#departureQueue.length;
    this.#landingQueue = this.#landingQueue.filter((request) => request.flight.flightId !== flightId);
    this.#departureQueue = this.#departureQueue.filter((request) => request.flight.flightId !== flightId);
    return before !== this.#landingQueue.length + this.#departureQueue.length;
  }

  getLandingQueue() { return this.#landingQueue.map(this.#queueView); }
  getDepartureQueue() { return this.#departureQueue.map(this.#queueView); }

  getStatus() {
    return this.getRunways().map((runway) => ({ runwayId: runway.runwayId, status: runway.status, currentFlightId: runway.currentFlightId, occupancyStart: runway.occupancyStart, occupancyEnd: runway.occupancyEnd }));
  }

  detectConflicts() {
    return this.getRunways()
      .filter((runway) => runway.status === RUNWAY_STATUSES.OCCUPIED && runway.currentFlightId)
      .map((runway) => ({ runwayId: runway.runwayId, flightId: runway.currentFlightId, occupancyStart: runway.occupancyStart, occupancyEnd: runway.occupancyEnd }));
  }

  #request(flight, type, onStart, onRelease) {
    const now = this.simulation.getSnapshot().currentTime;
    const request = {
      id: `runway-request-${++this.#sequence}`,
      flight,
      type,
      requestedAt: new Date(now),
      scheduledAt: new Date(type === RUNWAY_REQUEST_TYPES.LANDING ? (flight.estimatedArrival ?? flight.scheduledArrival ?? now) : (flight.estimatedDeparture ?? flight.scheduledDeparture ?? now)),
      priority: calculateRunwayPriority(flight, now, type, now),
      onStart,
      onRelease,
    };

    const runway = this.#findAvailableRunway(type);
    if (runway) return this.#startRequest(request, runway);

    this.#queueFor(type).push(request);
    this.#sortQueues(now);
    this.simulation.logger.info('RunwayRequestQueuedEvent', {
      requestId: request.id,
      flightId: flight.flightId,
      requestType: type,
      queue: type === RUNWAY_REQUEST_TYPES.LANDING ? 'LandingQueue' : 'DepartureQueue',
    });
    this.#ensureRetryScheduled(now);
    return { queued: true, requestId: request.id, queue: type === RUNWAY_REQUEST_TYPES.LANDING ? 'LandingQueue' : 'DepartureQueue' };
  }

  #startRequest(request, runway) {
    const now = this.simulation.getSnapshot().currentTime;
    const waitMinutes = Math.max(0, (now.getTime() - request.requestedAt.getTime()) / 60_000);
    if (waitMinutes > 0) request.flight.recordDelay(Math.ceil(waitMinutes), { at: now, reason: `${request.type.toLowerCase()} runway queue` });

    const end = new Date(now.getTime() + operationDuration(request.type));
    if (!runway.reserve(request.flight.flightId, now, end)) {
      this.#queueFor(request.type).push(request);
      this.#ensureRetryScheduled(now);
      return { queued: true, requestId: request.id, queue: request.type === RUNWAY_REQUEST_TYPES.LANDING ? 'LandingQueue' : 'DepartureQueue' };
    }
    runway.occupy(request.flight.flightId, now);

    this.simulation.logger.info('RunwayReservedEvent', { runwayId: runway.runwayId, flightId: request.flight.flightId, requestType: request.type });
    this.simulation.logger.info('RunwayOccupiedEvent', { runwayId: runway.runwayId, flightId: request.flight.flightId, requestType: request.type, occupancyEnd: end.toISOString() });
    request.flight.assignRunway(runway.runwayId);
    request.onStart?.({ runway, flight: request.flight, request, at: now });

    this.simulation.schedule({
      at: end,
      type: 'runway.release',
      payload: { runwayId: runway.runwayId, flightId: request.flight.flightId, requestId: request.id },
      handler: ({ event }) => {
        const released = runway.release(event.payload.flightId);
        if (released) {
          this.simulation.logger.info('RunwayReleasedEvent', { runwayId: runway.runwayId, flightId: event.payload.flightId });
          request.onRelease?.({ runway, flight: request.flight, request, at: event.at });
          this.#processQueues(event.at);
        }
      },
    });
    return { queued: false, assigned: true, runway, requestId: request.id };
  }

  #processQueues(at) {
    this.#retryScheduled = false;
    this.#refreshPriorities(at);
    let progressed = true;
    while (progressed) {
      progressed = false;
      const nextRequests = [...this.#landingQueue, ...this.#departureQueue].sort(RunwaySystem.#compareRequests);
      for (const request of nextRequests) {
        const runway = this.#findAvailableRunway(request.type);
        if (!runway) continue;
        this.#removeRequest(request.id);
        this.#startRequest(request, runway);
        progressed = true;
        break;
      }
    }
    this.#refreshPriorities(at);
    if (this.#landingQueue.length || this.#departureQueue.length) this.#ensureRetryScheduled(at);
  }

  #refreshPriorities(now) {
    for (const request of [...this.#landingQueue, ...this.#departureQueue]) {
      request.priority = calculateRunwayPriority(request.flight, request.requestedAt, request.type, now);
    }
  }

  #ensureRetryScheduled(at) {
    if (this.#retryScheduled || (!this.#landingQueue.length && !this.#departureQueue.length)) return;
    this.#retryScheduled = true;
    this.simulation.schedule({
      at: new Date(new Date(at).getTime() + RESOURCE_RETRY_INTERVAL_MS),
      type: 'runway.queue.retry',
      payload: {},
      handler: ({ event }) => this.#processQueues(event.at),
    });
  }

  #findAvailableRunway(type) {
    return this.getRunways().find((runway) => {
      if (!runway.isOperational() || runway.status !== RUNWAY_STATUSES.AVAILABLE) return false;
      if (!runway.operationType) return true;
      return runway.operationType === 'MIXED' || runway.operationType === type;
    }) ?? null;
  }

  #queueFor(type) { return type === RUNWAY_REQUEST_TYPES.LANDING ? this.#landingQueue : this.#departureQueue; }
  #removeRequest(id) { this.#landingQueue = this.#landingQueue.filter((item) => item.id !== id); this.#departureQueue = this.#departureQueue.filter((item) => item.id !== id); }
  #sortQueues(now) { this.#refreshPriorities(now); this.#landingQueue.sort(RunwaySystem.#compareRequests); this.#departureQueue.sort(RunwaySystem.#compareRequests); }
  #queueView = (request) => ({ id: request.id, flightId: request.flight.flightId, type: request.type, requestedAt: request.requestedAt, scheduledAt: request.scheduledAt, priority: request.priority });

  static #compareRequests(a, b) {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const timeDelta = a.scheduledAt.getTime() - b.scheduledAt.getTime();
    if (timeDelta !== 0) return timeDelta;
    return a.id.localeCompare(b.id);
  }
}
