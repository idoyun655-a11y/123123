import { FLIGHT_STATUSES } from './model.js';

export class FlightSimulationSystem {
  #flights = new Map();
  #scheduledEventIds = new Map();

  constructor(simulation) {
    if (!simulation || typeof simulation.schedule !== 'function') {
      throw new TypeError('A SimulationCore-compatible instance is required.');
    }
    this.simulation = simulation;
  }

  addFlight(flight) {
    if (!flight || !flight.flightId) throw new TypeError('A valid Flight is required.');
    if (this.#flights.has(flight.flightId)) throw new Error(`Flight already exists: ${flight.flightId}`);
    this.#flights.set(flight.flightId, flight);
    this.#scheduleInitialLifecycle(flight);
    return flight.flightId;
  }

  getFlight(flightId) { return this.#flights.get(flightId) ?? null; }
  getFlights() { return [...this.#flights.values()]; }

  cancelFlight(flightId, reason = 'cancelled') {
    const flight = this.#requireFlight(flightId);
    if (flight.status === FLIGHT_STATUSES.CANCELLED) return false;
    flight.transitionTo(FLIGHT_STATUSES.CANCELLED, { at: this.simulation.getSnapshot().currentTime, reason });
    return true;
  }

  #scheduleInitialLifecycle(flight) {
    if (flight.scheduledArrival) {
      this.#scheduleAt(flight, flight.estimatedArrival ?? flight.scheduledArrival, 'flight.approach', ({ event }) => {
        const current = this.#requireFlight(event.payload.flightId);
        if (current.status === FLIGHT_STATUSES.SCHEDULED || current.status === FLIGHT_STATUSES.DELAYED) {
          current.transitionTo(FLIGHT_STATUSES.APPROACHING, { at: event.at, reason: 'scheduled arrival reached' });
        }
      });

      const landedAt = new Date((flight.estimatedArrival ?? flight.scheduledArrival).getTime());
      landedAt.setMinutes(landedAt.getMinutes() + 5);
      this.#scheduleAt(flight, landedAt, 'flight.landed', ({ event }) => {
        const current = this.#requireFlight(event.payload.flightId);
        if (current.status === FLIGHT_STATUSES.APPROACHING || current.status === FLIGHT_STATUSES.DELAYED) {
          current.transitionTo(FLIGHT_STATUSES.LANDED, { at: event.at, reason: 'arrival event completed' });
          this.#scheduleGroundPhases(current, event.at);
        }
      });
    }

    if (flight.scheduledDeparture) {
      this.#scheduleAt(flight, flight.estimatedDeparture ?? flight.scheduledDeparture, 'flight.departure', ({ event }) => {
        const current = this.#requireFlight(event.payload.flightId);
        if (current.status === FLIGHT_STATUSES.READY || current.status === FLIGHT_STATUSES.AT_GATE || current.status === FLIGHT_STATUSES.BOARDING || current.status === FLIGHT_STATUSES.DELAYED) {
          current.transitionTo(FLIGHT_STATUSES.DEPARTING, { at: event.at, reason: 'scheduled departure reached' });
          const airborneAt = new Date(event.at.getTime() + 5 * 60_000);
          this.#scheduleAt(current, airborneAt, 'flight.airborne', ({ event: airborneEvent }) => {
            const latest = this.#requireFlight(airborneEvent.payload.flightId);
            if (latest.status === FLIGHT_STATUSES.DEPARTING) {
              latest.transitionTo(FLIGHT_STATUSES.AIRBORNE, { at: airborneEvent.at, reason: 'departure completed' });
            }
          });
        }
      });
    }
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
      if (current.status === FLIGHT_STATUSES.TAXIING || current.status === FLIGHT_STATUSES.LANDED) current.transitionTo(FLIGHT_STATUSES.AT_GATE, { at: event.at, reason: 'gate arrival' });
    });

    const boardingAt = new Date(landedAt.getTime() + Math.max(15, flight.turnaroundTime - 45) * 60_000);
    this.#scheduleAt(flight, boardingAt, 'flight.boarding', ({ event }) => {
      const current = this.#requireFlight(event.payload.flightId);
      if (current.status === FLIGHT_STATUSES.AT_GATE) current.transitionTo(FLIGHT_STATUSES.BOARDING, { at: event.at, reason: 'turnaround boarding phase' });
    });

    const readyAt = new Date(landedAt.getTime() + Math.max(15, flight.turnaroundTime - 15) * 60_000);
    this.#scheduleAt(flight, readyAt, 'flight.ready', ({ event }) => {
      const current = this.#requireFlight(event.payload.flightId);
      if (current.status === FLIGHT_STATUSES.BOARDING || current.status === FLIGHT_STATUSES.AT_GATE) current.transitionTo(FLIGHT_STATUSES.READY, { at: event.at, reason: 'turnaround completed' });
    });
  }

  #scheduleAt(flight, at, type, handler) {
    const eventId = this.simulation.schedule({
      at,
      type,
      payload: { flightId: flight.flightId },
      handler,
    });
    if (!this.#scheduledEventIds.has(flight.flightId)) this.#scheduledEventIds.set(flight.flightId, []);
    this.#scheduledEventIds.get(flight.flightId).push(eventId);
    return eventId;
  }

  #requireFlight(flightId) {
    const flight = this.#flights.get(flightId);
    if (!flight) throw new Error(`Unknown flight: ${flightId}`);
    return flight;
  }
}
