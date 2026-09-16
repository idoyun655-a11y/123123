export const FLIGHT_STATUSES = Object.freeze({
  SCHEDULED: 'SCHEDULED',
  APPROACHING: 'APPROACHING',
  LANDED: 'LANDED',
  TAXIING: 'TAXIING',
  AT_GATE: 'AT_GATE',
  BOARDING: 'BOARDING',
  READY: 'READY',
  DEPARTING: 'DEPARTING',
  AIRBORNE: 'AIRBORNE',
  DELAYED: 'DELAYED',
  CANCELLED: 'CANCELLED',
});

const TERMINAL_STATUSES = new Set([FLIGHT_STATUSES.AIRBORNE, FLIGHT_STATUSES.CANCELLED]);

export class Flight {
  constructor({
    flightId,
    airline,
    flightNumber,
    aircraftType,
    origin,
    destination,
    scheduledArrival = null,
    estimatedArrival = null,
    scheduledDeparture = null,
    estimatedDeparture = null,
    passengerCount = 0,
    cargoWeight = 0,
    gate = null,
    runway = null,
    turnaroundTime = 0,
    delayMinutes = 0,
    status = FLIGHT_STATUSES.SCHEDULED,
  }) {
    if (!flightId || !airline || !flightNumber || !aircraftType || !origin || !destination) {
      throw new TypeError('flightId, airline, flightNumber, aircraftType, origin, and destination are required.');
    }
    if (!Object.values(FLIGHT_STATUSES).includes(status)) throw new RangeError(`Invalid flight status: ${status}`);
    if (!Number.isFinite(passengerCount) || passengerCount < 0) throw new RangeError('passengerCount must be non-negative.');
    if (!Number.isFinite(cargoWeight) || cargoWeight < 0) throw new RangeError('cargoWeight must be non-negative.');
    if (!Number.isFinite(turnaroundTime) || turnaroundTime < 0) throw new RangeError('turnaroundTime must be non-negative.');
    if (!Number.isFinite(delayMinutes) || delayMinutes < 0) throw new RangeError('delayMinutes must be non-negative.');

    this.flightId = flightId;
    this.airline = airline;
    this.flightNumber = flightNumber;
    this.aircraftType = aircraftType;
    this.origin = origin;
    this.destination = destination;
    this.scheduledArrival = toDateOrNull(scheduledArrival);
    this.estimatedArrival = toDateOrNull(estimatedArrival);
    this.scheduledDeparture = toDateOrNull(scheduledDeparture);
    this.estimatedDeparture = toDateOrNull(estimatedDeparture);
    this.passengerCount = passengerCount;
    this.cargoWeight = cargoWeight;
    this.gate = gate;
    this.runway = runway;
    this.turnaroundTime = turnaroundTime;
    this.delayMinutes = delayMinutes;
    this.status = status;
    this.statusHistory = [];
  }

  transitionTo(nextStatus, { at, reason = null } = {}) {
    if (!Object.values(FLIGHT_STATUSES).includes(nextStatus)) throw new RangeError(`Invalid flight status: ${nextStatus}`);
    if (TERMINAL_STATUSES.has(this.status) && this.status !== nextStatus) {
      throw new Error(`Cannot transition terminal flight ${this.flightId} from ${this.status} to ${nextStatus}.`);
    }
    const time = at ? new Date(at) : null;
    if (time && Number.isNaN(time.getTime())) throw new TypeError('Transition time must be a valid date.');
    this.status = nextStatus;
    this.statusHistory.push({ status: nextStatus, at: time, reason });
  }

  recordDelay(minutes, { at = null, reason = null } = {}) {
    if (!Number.isFinite(minutes) || minutes < 0) throw new RangeError('Delay minutes must be non-negative.');
    this.delayMinutes = minutes;
    if (minutes > 0) this.status = FLIGHT_STATUSES.DELAYED;
    if (this.scheduledArrival) this.estimatedArrival = addMinutes(this.scheduledArrival, minutes);
    if (this.scheduledDeparture) this.estimatedDeparture = addMinutes(this.scheduledDeparture, minutes);
    this.statusHistory.push({ status: FLIGHT_STATUSES.DELAYED, at: at ? new Date(at) : null, reason });
  }

  assignGate(gateId) { this.gate = gateId; }
  assignRunway(runwayId) { this.runway = runwayId; }

  toJSON() {
    return {
      flightId: this.flightId,
      airline: this.airline,
      flightNumber: this.flightNumber,
      aircraftType: this.aircraftType,
      origin: this.origin,
      destination: this.destination,
      scheduledArrival: dateToIso(this.scheduledArrival),
      estimatedArrival: dateToIso(this.estimatedArrival),
      scheduledDeparture: dateToIso(this.scheduledDeparture),
      estimatedDeparture: dateToIso(this.estimatedDeparture),
      passengerCount: this.passengerCount,
      cargoWeight: this.cargoWeight,
      gate: this.gate,
      runway: this.runway,
      turnaroundTime: this.turnaroundTime,
      delayMinutes: this.delayMinutes,
      status: this.status,
      statusHistory: this.statusHistory.map((entry) => ({ ...entry, at: dateToIso(entry.at) })),
    };
  }
}

function toDateOrNull(value) {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date value: ${value}`);
  return date;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

function dateToIso(date) { return date ? date.toISOString() : null; }
