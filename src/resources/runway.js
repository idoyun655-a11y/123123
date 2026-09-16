import { RUNWAY_OPERATION_TIMES_MS, RUNWAY_PRIORITY_WEIGHTS } from './config.js';

export const RUNWAY_STATUSES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  OCCUPIED: 'OCCUPIED',
  CLOSED: 'CLOSED',
  MAINTENANCE: 'MAINTENANCE',
});

export class Runway {
  constructor({
    runwayId,
    name,
    length = null,
    width = null,
    operationType = null,
    status = RUNWAY_STATUSES.AVAILABLE,
    maintenanceStatus = 'NORMAL',
    sourceType = 'REAL',
  }) {
    if (!runwayId || !name) throw new TypeError('runwayId and name are required.');
    if (!Object.values(RUNWAY_STATUSES).includes(status)) throw new RangeError(`Invalid runway status: ${status}`);
    this.runwayId = runwayId;
    this.name = name;
    this.length = length;
    this.width = width;
    this.operationType = operationType;
    this.status = status;
    this.maintenanceStatus = maintenanceStatus;
    this.sourceType = sourceType;
    this.currentFlightId = null;
    this.occupancyStart = null;
    this.occupancyEnd = null;
  }

  isOperational() {
    return this.status !== RUNWAY_STATUSES.CLOSED && this.status !== RUNWAY_STATUSES.MAINTENANCE && this.maintenanceStatus !== 'IN_PROGRESS';
  }

  reserve(flightId, start, end) {
    if (!this.isOperational() || this.status !== RUNWAY_STATUSES.AVAILABLE) return false;
    this.status = RUNWAY_STATUSES.RESERVED;
    this.currentFlightId = flightId;
    this.occupancyStart = new Date(start);
    this.occupancyEnd = new Date(end);
    return true;
  }

  occupy(flightId, at) {
    if (this.currentFlightId !== flightId || this.status !== RUNWAY_STATUSES.RESERVED) return false;
    this.status = RUNWAY_STATUSES.OCCUPIED;
    this.occupancyStart = new Date(at);
    return true;
  }

  release(flightId) {
    if (this.currentFlightId !== flightId) return false;
    this.status = RUNWAY_STATUSES.AVAILABLE;
    this.currentFlightId = null;
    this.occupancyStart = null;
    this.occupancyEnd = null;
    return true;
  }
}

export const RUNWAY_REQUEST_TYPES = Object.freeze({ LANDING: 'LANDING', DEPARTURE: 'DEPARTURE' });

export function calculateRunwayPriority(flight, requestedAt, requestType, now = requestedAt) {
  const nowMs = new Date(now).getTime();
  const requestedMs = new Date(requestedAt).getTime();
  const scheduledValue = requestType === RUNWAY_REQUEST_TYPES.LANDING
    ? (flight.estimatedArrival ?? flight.scheduledArrival)
    : (flight.estimatedDeparture ?? flight.scheduledDeparture);
  const scheduledMs = scheduledValue ? new Date(scheduledValue).getTime() : nowMs;
  const waitingMinutes = Math.max(0, (nowMs - requestedMs) / 60_000);
  const minutesUntilScheduled = Math.max(0, (scheduledMs - nowMs) / 60_000);
  const scheduledUrgency = 1 / (1 + minutesUntilScheduled);
  const emergency = flight.operationalFlags?.emergency ? RUNWAY_PRIORITY_WEIGHTS.emergency : 0;
  const state = flight.status === 'DELAYED' ? RUNWAY_PRIORITY_WEIGHTS.state : 0;
  const delay = (flight.delayMinutes ?? 0) * RUNWAY_PRIORITY_WEIGHTS.delayMinutes;
  return emergency + delay + waitingMinutes * RUNWAY_PRIORITY_WEIGHTS.waitingMinutes + scheduledUrgency * RUNWAY_PRIORITY_WEIGHTS.scheduledTime + state;
}

export function operationDuration(requestType) {
  return requestType === RUNWAY_REQUEST_TYPES.LANDING ? RUNWAY_OPERATION_TIMES_MS.landing : RUNWAY_OPERATION_TIMES_MS.departure;
}
