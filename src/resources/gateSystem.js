import { GATE_ASSIGNMENT_WEIGHTS, RESOURCE_RETRY_INTERVAL_MS } from './config.js';
import { GATE_STATUSES } from './gate.js';

const AIRCRAFT_SIZE_ORDER = Object.freeze({ SMALL: 1, MEDIUM: 2, LARGE: 3, HEAVY: 4 });

export class GateSystem {
  #gates = new Map();
  #waiters = new Map();

  constructor(simulation, { weights = GATE_ASSIGNMENT_WEIGHTS } = {}) {
    if (!simulation || typeof simulation.schedule !== 'function') throw new TypeError('A SimulationCore-compatible instance is required.');
    this.simulation = simulation;
    this.weights = Object.freeze({ ...weights });
  }

  addGate(gate) {
    if (!gate || !gate.gateId) throw new TypeError('A valid Gate is required.');
    if (this.#gates.has(gate.gateId)) throw new Error(`Gate already exists: ${gate.gateId}`);
    this.#gates.set(gate.gateId, gate);
    return gate.gateId;
  }

  addGates(gates) { gates.forEach((gate) => this.addGate(gate)); }
  getGate(gateId) { return this.#gates.get(gateId) ?? null; }
  getGates() { return [...this.#gates.values()]; }

  findCandidates(flight, { start = flight.estimatedArrival ?? flight.scheduledArrival, end = flight.estimatedDeparture ?? flight.scheduledDeparture } = {}) {
    const window = this.#normalizeWindow(flight, start, end);
    return this.getGates()
      .filter((gate) => this.#isCompatible(gate, flight, window))
      .map((gate) => ({ gate, ...this.#score(gate, flight, window) }))
      .sort((a, b) => b.score - a.score);
  }

  assignBestGate(flight, { at = this.simulation.getSnapshot().currentTime, reserve = true } = {}) {
    const candidates = this.findCandidates(flight);
    if (candidates.length === 0) {
      return { assigned: false, gate: null, candidates: [], waitUntil: this.#earliestAvailability(flight, at), reason: 'NO_CANDIDATE_GATE' };
    }
    const winner = candidates[0];
    if (reserve) {
      const { start, end } = this.#normalizeWindow(flight);
      if (!winner.gate.reserve(flight.flightId, start, end)) {
        return { assigned: false, gate: null, candidates, waitUntil: this.#earliestAvailability(flight, at), reason: 'RESERVATION_CONFLICT' };
      }
      flight.assignGate(winner.gate.gateId);
      this.simulation.logger.info('FlightGateAssignedEvent', {
        flightId: flight.flightId,
        gateId: winner.gate.gateId,
        score: winner.score,
      });
    }
    return { assigned: true, gate: winner.gate, candidates, waitUntil: null, score: winner.score, scoreBreakdown: winner.breakdown };
  }

  prepareFlightGate(flight, { at = this.simulation.getSnapshot().currentTime } = {}) {
    let result = this.assignBestGate(flight, { at });
    if (result.assigned) return result;
    const expected = flight.estimatedArrival ?? flight.scheduledArrival;
    if (expected && result.waitUntil && result.waitUntil.getTime() > expected.getTime()) {
      const delayMinutes = Math.ceil((result.waitUntil.getTime() - expected.getTime()) / 60_000);
      flight.recordDelay(delayMinutes, { at, reason: 'gate capacity wait' });
      result = this.assignBestGate(flight, { at });
    }
    if (!result.assigned && result.waitUntil) this.#scheduleRetry(flight, result.waitUntil);
    return result;
  }

  waitForGate(flight, onAssigned) {
    const immediate = this.assignBestGate(flight);
    if (immediate.assigned) {
      onAssigned?.(immediate);
      return immediate;
    }
    const current = this.#waiters.get(flight.flightId);
    if (current) current.onAssigned = onAssigned;
    else this.#waiters.set(flight.flightId, { flight, onAssigned });
    const now = this.simulation.getSnapshot().currentTime;
    const waitUntil = immediate.waitUntil ?? new Date(now.getTime() + RESOURCE_RETRY_INTERVAL_MS);
    const waitMinutes = Math.ceil(Math.max(0, waitUntil.getTime() - now.getTime()) / 60_000);
    if (waitMinutes > 0) flight.recordDelay(waitMinutes, { at: now, reason: 'gate waiting' });
    this.#scheduleRetry(flight, waitUntil);
    return { ...immediate, waiting: true, waitUntil };
  }

  checkReservationConflict(gateId, start, end, flightId = null) {
    const gate = this.#requireGate(gateId);
    return gate.conflicts(start, end, flightId);
  }

  occupyGate(flightId, at = this.simulation.getSnapshot().currentTime) {
    const flightGate = this.#findGateByFlight(flightId);
    if (!flightGate || !flightGate.occupy(flightId, at)) return false;
    this.simulation.logger.info('GateOccupiedEvent', { flightId, gateId: flightGate.gateId });
    return true;
  }

  setBoarding(flightId) {
    const gate = this.#findGateByFlight(flightId);
    if (!gate || !gate.setBoarding(flightId)) return false;
    this.simulation.logger.info('GateBoardingEvent', { flightId, gateId: gate.gateId });
    return true;
  }

  releaseGate(flightId, at = this.simulation.getSnapshot().currentTime) {
    const gate = this.#findGateByFlight(flightId);
    if (!gate) return false;
    const released = gate.release(flightId);
    if (released) {
      this.simulation.logger.info('GateReleasedEvent', { flightId, gateId: gate.gateId, simulationTime: new Date(at).toISOString() });
      this.processWaiting(at);
    }
    return released;
  }

  detectConflicts(gateId = null) {
    const gates = gateId ? [this.#requireGate(gateId)] : this.getGates();
    const conflicts = [];
    for (const gate of gates) {
      for (let i = 0; i < gate.reservations.length; i += 1) {
        for (let j = i + 1; j < gate.reservations.length; j += 1) {
          const a = gate.reservations[i];
          const b = gate.reservations[j];
          if (a.startMs < b.endMs && b.startMs < a.endMs) conflicts.push({ gateId: gate.gateId, flightA: a.flightId, flightB: b.flightId });
        }
      }
    }
    return conflicts;
  }

  getWaitingFlights() { return [...this.#waiters.keys()]; }
  getStatus() { return this.getGates().map((gate) => ({ gateId: gate.gateId, status: gate.status, currentFlightId: gate.currentFlightId, estimatedReleaseTime: gate.estimatedReleaseTime })); }

  processWaiting(at = this.simulation.getSnapshot().currentTime) {
    for (const [flightId, waiter] of [...this.#waiters]) {
      const result = this.assignBestGate(waiter.flight, { at });
      if (result.assigned) {
        this.#waiters.delete(flightId);
        waiter.onAssigned?.(result);
      }
    }
  }

  #scheduleRetry(flight, waitUntil) {
    if (this.#waiters.has(flight.flightId) && this.#waiters.get(flight.flightId).retryScheduled) return;
    if (!this.#waiters.has(flight.flightId)) this.#waiters.set(flight.flightId, { flight, onAssigned: null });
    const waiter = this.#waiters.get(flight.flightId);
    waiter.retryScheduled = true;
    const now = this.simulation.getSnapshot().currentTime;
    const requested = new Date(waitUntil);
    const retryAt = requested > now ? requested : new Date(now.getTime() + RESOURCE_RETRY_INTERVAL_MS);
    this.simulation.schedule({
      at: retryAt,
      type: 'gate.assignment.retry',
      payload: { flightId: flight.flightId },
      handler: ({ event }) => {
        const currentWaiter = this.#waiters.get(event.payload.flightId);
        if (!currentWaiter) return;
        currentWaiter.retryScheduled = false;
        const result = this.assignBestGate(currentWaiter.flight, { at: event.at });
        if (result.assigned) {
          this.#waiters.delete(currentWaiter.flight.flightId);
          currentWaiter.onAssigned?.(result);
        } else {
          this.#scheduleRetry(currentWaiter.flight, result.waitUntil ?? new Date(event.at.getTime() + RESOURCE_RETRY_INTERVAL_MS));
        }
      },
    });
  }

  #isCompatible(gate, flight, { start, end }) {
    if (gate.status === GATE_STATUSES.BLOCKED || gate.status === GATE_STATUSES.MAINTENANCE) return false;
    if (gate.maintenanceStatus === 'IN_PROGRESS') return false;
    if (gate.conflicts(start, end, flight.flightId)) return false;

    const requirements = flight.gateRequirements ?? {};
    if (requirements.terminalId && requirements.terminalId !== gate.terminalId) return false;
    if (requirements.gateType && gate.gateType && requirements.gateType !== gate.gateType) return false;
    if (requirements.internationalDomestic && gate.internationalDomestic && requirements.internationalDomestic !== gate.internationalDomestic) return false;
    if (requirements.requiresJetBridge === true && gate.jetBridge !== true) return false;
    if (requirements.requiresBusGate === true && gate.busGate !== true) return false;
    if (Array.isArray(gate.compatibleAircraft) && gate.compatibleAircraft.length > 0 && !gate.compatibleAircraft.includes(flight.aircraftType)) return false;
    if (requirements.aircraftSize && gate.properties?.aircraftSizes && !gate.properties.aircraftSizes.includes(requirements.aircraftSize)) return false;
    return true;
  }

  #score(gate, flight, { start }) {
    const req = flight.gateRequirements ?? {};
    const aircraftScore = this.#aircraftScore(gate, flight);
    const terminalScore = req.terminalId && gate.terminalId === req.terminalId ? 1 : 0;
    const connectionScore = req.connectionTerminalId && gate.terminalId === req.connectionTerminalId ? 1 : 0;
    const airlinePreferenceScore = gate.airlinePreferences.includes(flight.airline) ? 1 : 0;
    const distanceScore = req.preferredLocation && gate.location ? this.#distanceScore(gate.location, req.preferredLocation) : 0;
    const congestionPenalty = gate.status === GATE_STATUSES.RESERVED ? 1 : 0;
    const score = aircraftScore * this.weights.aircraftCompatibility + terminalScore * this.weights.terminalCompatibility + connectionScore * this.weights.connection + airlinePreferenceScore * this.weights.airlinePreference + distanceScore * this.weights.distance - congestionPenalty * this.weights.congestionPenalty;
    return { score, breakdown: { aircraftScore, terminalScore, connectionScore, airlinePreferenceScore, distanceScore, congestionPenalty, conflictPenalty: 0, start: new Date(start) } };
  }

  #aircraftScore(gate, flight) {
    if (Array.isArray(gate.compatibleAircraft) && gate.compatibleAircraft.includes(flight.aircraftType)) return 1;
    const required = flight.gateRequirements?.aircraftSize;
    const supported = gate.properties?.aircraftSizes;
    if (required && Array.isArray(supported)) {
      if (supported.includes(required)) return 1;
      const max = Math.max(...supported.map((size) => AIRCRAFT_SIZE_ORDER[size] ?? 0));
      const need = AIRCRAFT_SIZE_ORDER[required] ?? 0;
      return max >= need ? 0.5 : 0;
    }
    return 0;
  }

  #distanceScore(a, b) {
    const distance = Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
    return 1 / (1 + distance / 1000);
  }

  #normalizeWindow(flight, start = flight.estimatedArrival ?? flight.scheduledArrival, end = flight.estimatedDeparture ?? flight.scheduledDeparture) {
    const startDate = new Date(start ?? this.simulation.getSnapshot().currentTime);
    let endDate = end ? new Date(end) : new Date(startDate.getTime() + Math.max(30, flight.turnaroundTime || 30) * 60_000);
    if (endDate <= startDate) endDate = new Date(startDate.getTime() + Math.max(30, flight.turnaroundTime || 30) * 60_000);
    return { start: startDate, end: endDate };
  }

  #earliestAvailability(flight, at) {
    const now = new Date(at);
    const operational = this.getGates().filter((gate) => gate.isOperational());
    if (operational.length === 0) return new Date(now.getTime() + RESOURCE_RETRY_INTERVAL_MS);
    const start = flight.estimatedArrival ?? flight.scheduledArrival ?? now;
    const end = flight.estimatedDeparture ?? flight.scheduledDeparture ?? new Date(new Date(start).getTime() + Math.max(30, flight.turnaroundTime || 30) * 60_000);
    const candidates = operational.map((gate) => gate.conflicts(start, end, flight.flightId) ? gate.nextAvailableAt(now) : new Date(start));
    return new Date(Math.min(...candidates.map((date) => date.getTime())));
  }

  #findGateByFlight(flightId) { return this.getGates().find((gate) => gate.currentFlightId === flightId || gate.reservations.some((r) => r.flightId === flightId)) ?? null; }
  #requireGate(gateId) { const gate = this.getGate(gateId); if (!gate) throw new Error(`Unknown gate: ${gateId}`); return gate; }
}
