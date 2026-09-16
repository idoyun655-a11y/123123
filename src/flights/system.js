import { FLIGHT_STATUSES } from './model.js';

const EVENT_TOLERANCE_MS = 1;

export class FlightSimulationSystem {
  #flights = new Map();
  #scheduledEventIds = new Map();

  constructor(simulation, { gateSystem = null, runwaySystem = null } = {}) {
    if (!simulation || typeof simulation.schedule !== 'function') throw new TypeError('A SimulationCore-compatible instance is required.');
    this.simulation = simulation;
    this.gateSystem = gateSystem;
    this.runwaySystem = runwaySystem;
  }

  addFlight(flight) {
    if (!flight || !flight.flightId) throw new TypeError('A valid Flight is required.');
    if (this.#flights.has(flight.flightId)) throw new Error(`Flight already exists: ${flight.flightId}`);
    this.#flights.set(flight.flightId, flight);
    if (this.gateSystem) this.gateSystem.prepareFlightGate(flight);
    this.#scheduleInitialLifecycle(flight);
    return flight.flightId;
  }

  getFlight(flightId) { return this.#flights.get(flightId) ?? null; }
  getFlights() { return [...this.#flights.values()]; }

  cancelFlight(flightId, reason = 'cancelled') {
    const flight = this.#requireFlight(flightId);
    if (flight.status === FLIGHT_STATUSES.CANCELLED) return false;
    flight.transitionTo(FLIGHT_STATUSES.CANCELLED, { at: this.simulation.getSnapshot().currentTime, reason });
    this.gateSystem?.releaseGate(flightId);
    this.runwaySystem?.cancelRequests(flightId);
    return true;
  }

  #scheduleInitialLifecycle(flight) {
    if (flight.scheduledArrival) {
      const approachHandler = ({ event }) => {
        const current = this.#requireFlight(event.payload.flightId);
        const expected = current.estimatedArrival ?? current.scheduledArrival;
        if (!expected) return;
        if (this.#isStale(event.at, expected)) {
          if (expected.getTime() > event.at.getTime()) this.#scheduleAt(current, expected, 'flight.approach', approachHandler);
          return;
        }
        if (current.status === FLIGHT_STATUSES.SCHEDULED || current.status === FLIGHT_STATUSES.DELAYED) {
          current.transitionTo(FLIGHT_STATUSES.APPROACHING, { at: event.at, reason: 'estimated arrival reached' });
          this.#requestLanding(current);
        }
      };
      this.#scheduleAt(flight, flight.estimatedArrival ?? flight.scheduledArrival, 'flight.approach', approachHandler);
    }

    if (flight.scheduledDeparture) {
      const departureHandler = ({ event }) => {
        const current = this.#requireFlight(event.payload.flightId);
        const expected = current.estimatedDeparture ?? current.scheduledDeparture;
        if (!expected) return;
        if (this.#isStale(event.at, expected)) {
          if (expected.getTime() > event.at.getTime()) this.#scheduleAt(current, expected, 'flight.departure', departureHandler);
          return;
        }
        if ([FLIGHT_STATUSES.READY, FLIGHT_STATUSES.AT_GATE, FLIGHT_STATUSES.BOARDING, FLIGHT_STATUSES.DELAYED].includes(current.status)) {
          this.#requestDeparture(current);
        }
      };
      this.#scheduleAt(flight, flight.estimatedDeparture ?? flight.scheduledDeparture, 'flight.departure', departureHandler);
    }
  }

  #requestLanding(flight) {
    if (!this.runwaySystem) {
      this.#scheduleLandingEvent(flight, flight.estimatedArrival ?? flight.scheduledArrival);
      return;
    }
    this.runwaySystem.requestLanding(flight, {
      onStart: ({ at }) => {
        if (flight.status !== FLIGHT_STATUSES.CANCELLED) {
          flight.transitionTo(FLIGHT_STATUSES.LANDED, { at, reason: 'runway landing slot started' });
          this.#scheduleGroundPhases(flight, at);
        }
      },
    });
  }

  #requestDeparture(flight) {
    if (!this.runwaySystem) {
      flight.transitionTo(FLIGHT_STATUSES.DEPARTING, { at: this.simulation.getSnapshot().currentTime, reason: 'scheduled departure reached' });
      this.gateSystem?.releaseGate(flight.flightId);
      const airborneAt = new Date(this.simulation.getSnapshot().currentTime.getTime() + 5 * 60_000);
      this.#scheduleAt(flight, airborneAt, 'flight.airborne', ({ event }) => {
        if (flight.status === FLIGHT_STATUSES.DEPARTING) flight.transitionTo(FLIGHT_STATUSES.AIRBORNE, { at: event.at, reason: 'departure completed' });
      });
      return;
    }
    this.runwaySystem.requestDeparture(flight, {
      onStart: ({ at }) => {
        if (flight.status === FLIGHT_STATUSES.CANCELLED) return;
        this.gateSystem?.releaseGate(flight.flightId, at);
        flight.transitionTo(FLIGHT_STATUSES.DEPARTING, { at, reason: 'runway departure slot started' });
      },
      onRelease: ({ at }) => {
        if (flight.status === FLIGHT_STATUSES.DEPARTING) flight.transitionTo(FLIGHT_STATUSES.AIRBORNE, { at, reason: 'runway occupancy completed' });
      },
    });
  }

  #scheduleLandingEvent(flight, arrivalTime) {
    const landedAt = new Date(arrivalTime.getTime() + 5 * 60_000);
    this.#scheduleAt(flight, landedAt, 'flight.landed', ({ event }) => {
      const current = this.#requireFlight(event.payload.flightId);
      const expectedArrival = current.estimatedArrival ?? current.scheduledArrival;
      if (!expectedArrival) return;
      const expectedLandedAt = new Date(expectedArrival.getTime() + 5 * 60_000);
      if (this.#isStale(event.at, expectedLandedAt)) {
        if (expectedLandedAt.getTime() > event.at.getTime()) this.#scheduleLandingEvent(current, expectedArrival);
        return;
      }
      if (current.status === FLIGHT_STATUSES.APPROACHING || current.status === FLIGHT_STATUSES.DELAYED) {
        current.transitionTo(FLIGHT_STATUSES.LANDED, { at: event.at, reason: 'arrival completed' });
        this.#scheduleGroundPhases(current, event.at);
      }
    });
  }

  #scheduleGroundPhases(flight, landedAt) {
    const taxiAt = new Date(landedAt.getTime() + 5 * 60_000);
    this.#scheduleAt(flight, taxiAt, 'flight.taxiing', ({ event }) => {
      const current = this.#requireFlight(event.payload.flightId);
      if (current.status === FLIGHT_STATUSES.LANDED) current.transitionTo(FLIGHT_STATUSES.TAXIING, { at: event.at, reason: 'post-landing taxi started' });
    });

    const gateAt = new Date(landedAt.getTime() + 15 * 60_000);
    this.#scheduleAt(flight, gateAt, 'flight.at_gate', ({ event }) => {
      const current = this.#requireFlight(event.payload.flightId);
      if (this.gateSystem) {
        if (this.gateSystem.occupyGate(current.flightId, event.at)) {
          current.transitionTo(FLIGHT_STATUSES.AT_GATE, { at: event.at, reason: 'gate occupied' });
          return;
        }
        this.gateSystem.waitForGate(current, () => {
          if (current.status !== FLIGHT_STATUSES.CANCELLED) current.transitionTo(FLIGHT_STATUSES.AT_GATE, { at: this.simulation.getSnapshot().currentTime, reason: 'gate assigned after waiting' });
          this.gateSystem.occupyGate(current.flightId);
        });
        return;
      }
      if (current.status === FLIGHT_STATUSES.TAXIING || current.status === FLIGHT_STATUSES.LANDED) current.transitionTo(FLIGHT_STATUSES.AT_GATE, { at: event.at, reason: 'gate arrival' });
    });

    const boardingAt = new Date(landedAt.getTime() + Math.max(15, flight.turnaroundTime - 45) * 60_000);
    this.#scheduleAt(flight, boardingAt, 'flight.boarding', ({ event }) => {
      const current = this.#requireFlight(event.payload.flightId);
      if (current.status === FLIGHT_STATUSES.AT_GATE) {
        this.gateSystem?.setBoarding(current.flightId);
        current.transitionTo(FLIGHT_STATUSES.BOARDING, { at: event.at, reason: 'turnaround boarding phase' });
      }
    });

    const readyAt = new Date(landedAt.getTime() + Math.max(15, flight.turnaroundTime - 15) * 60_000);
    this.#scheduleAt(flight, readyAt, 'flight.ready', ({ event }) => {
      const current = this.#requireFlight(event.payload.flightId);
      if (current.status === FLIGHT_STATUSES.BOARDING || current.status === FLIGHT_STATUSES.AT_GATE) current.transitionTo(FLIGHT_STATUSES.READY, { at: event.at, reason: 'turnaround completed' });
    });
  }

  #scheduleAt(flight, at, type, handler) {
    const eventId = this.simulation.schedule({ at, type, payload: { flightId: flight.flightId }, handler });
    if (!this.#scheduledEventIds.has(flight.flightId)) this.#scheduledEventIds.set(flight.flightId, []);
    this.#scheduledEventIds.get(flight.flightId).push(eventId);
    return eventId;
  }

  #isStale(eventAt, expectedAt) { return Math.abs(eventAt.getTime() - expectedAt.getTime()) > EVENT_TOLERANCE_MS; }
  #requireFlight(flightId) { const flight = this.#flights.get(flightId); if (!flight) throw new Error(`Unknown flight: ${flightId}`); return flight; }
}
