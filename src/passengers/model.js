export const PASSENGER_TYPES = Object.freeze({
  DEPARTURE: 'DEPARTURE',
  ARRIVAL: 'ARRIVAL',
  TRANSFER: 'TRANSFER',
});

export const PASSENGER_STATUSES = Object.freeze({
  CREATED: 'CREATED', ARRIVING: 'ARRIVING', CHECK_IN_QUEUE: 'CHECK_IN_QUEUE', CHECK_IN: 'CHECK_IN', CHECK_IN_COMPLETED: 'CHECK_IN_COMPLETED', SECURITY_QUEUE: 'SECURITY_QUEUE', SECURITY_CHECK: 'SECURITY_CHECK', SECURITY_COMPLETED: 'SECURITY_COMPLETED', DEPARTURE_IMMIGRATION: 'DEPARTURE_IMMIGRATION', AIRSIDE: 'AIRSIDE', GATE_WAIT: 'GATE_WAIT', BOARDING: 'BOARDING', BOARDED: 'BOARDED',
  ARRIVING_BY_AIRCRAFT: 'ARRIVING_BY_AIRCRAFT', DEPLANING: 'DEPLANING', ARRIVAL_IMMIGRATION: 'ARRIVAL_IMMIGRATION', BAGGAGE_CLAIM: 'BAGGAGE_CLAIM', CUSTOMS: 'CUSTOMS', ARRIVAL_HALL: 'ARRIVAL_HALL', COMPLETED: 'COMPLETED', TRANSFER: 'TRANSFER', TRANSFER_PROCESS: 'TRANSFER_PROCESS', MISSED_BOARDING: 'MISSED_BOARDING', NOT_BOARDED: 'NOT_BOARDED',
});

const ALLOWED = Object.freeze({
  DEPARTURE: Object.freeze({ CREATED: 'ARRIVING', ARRIVING: 'CHECK_IN_QUEUE', CHECK_IN_QUEUE: 'CHECK_IN', CHECK_IN: 'CHECK_IN_COMPLETED', CHECK_IN_COMPLETED: 'SECURITY_QUEUE', SECURITY_QUEUE: 'SECURITY_CHECK', SECURITY_CHECK: 'SECURITY_COMPLETED', SECURITY_COMPLETED: 'DEPARTURE_IMMIGRATION', DEPARTURE_IMMIGRATION: 'AIRSIDE', AIRSIDE: 'GATE_WAIT', GATE_WAIT: 'BOARDING', BOARDING: 'BOARDED' }),
  ARRIVAL: Object.freeze({ ARRIVING_BY_AIRCRAFT: 'DEPLANING', DEPLANING: 'ARRIVAL_IMMIGRATION', ARRIVAL_IMMIGRATION: 'BAGGAGE_CLAIM', BAGGAGE_CLAIM: 'CUSTOMS', CUSTOMS: 'ARRIVAL_HALL', ARRIVAL_HALL: 'COMPLETED' }),
  TRANSFER: Object.freeze({ ARRIVING_BY_AIRCRAFT: 'TRANSFER', TRANSFER: 'TRANSFER_PROCESS', TRANSFER_PROCESS: 'GATE_WAIT', GATE_WAIT: 'BOARDING', BOARDING: 'BOARDED' }),
});

export class Passenger {
  constructor({ passengerId, flightId, terminalId = null, passengerType = PASSENGER_TYPES.DEPARTURE, origin = null, destination = null, arrivalTime = null, scheduledDeparture = null, currentState = null, currentZone = null, priority = 0, connectionTime = null, status = null }) {
    if (!passengerId || !flightId) throw new TypeError('passengerId and flightId are required.');
    if (!Object.values(PASSENGER_TYPES).includes(passengerType)) throw new RangeError(`Invalid passengerType: ${passengerType}`);
    this.passengerId = passengerId;
    this.flightId = flightId;
    this.terminalId = terminalId;
    this.passengerType = passengerType;
    this.origin = origin;
    this.destination = destination;
    this.arrivalTime = toDate(arrivalTime);
    this.scheduledDeparture = toDate(scheduledDeparture);
    this.currentState = currentState ?? initialState(passengerType);
    this.currentZone = currentZone;
    this.queueEntryTime = null;
    this.processingStartTime = null;
    this.processingEndTime = null;
    this.totalWaitingTime = 0;
    this.totalProcessingTime = 0;
    this.connectionTime = connectionTime;
    this.priority = Number.isFinite(priority) ? priority : 0;
    this.status = status ?? this.currentState;
    this.history = [];
  }

  transitionTo(nextState, { at = null, zone = this.currentZone, reason = null, force = false } = {}) {
    const type = this.passengerType === PASSENGER_TYPES.TRANSFER ? PASSENGER_TYPES.TRANSFER : this.passengerType === PASSENGER_TYPES.ARRIVAL ? PASSENGER_TYPES.ARRIVAL : PASSENGER_TYPES.DEPARTURE;
    if (!force && ALLOWED[type][this.currentState] !== nextState) throw new Error(`Invalid passenger transition ${this.currentState} -> ${nextState}`);
    this.currentState = nextState; this.status = nextState; this.currentZone = zone;
    this.history.push({ state: nextState, at: toDate(at), zone, reason });
  }

  enterQueue(at) { this.queueEntryTime = toDate(at); this.processingStartTime = null; this.processingEndTime = null; }
  startProcessing(at) { this.processingStartTime = toDate(at); if (this.queueEntryTime) this.totalWaitingTime += Math.max(0, (this.processingStartTime - this.queueEntryTime) / 60000); }
  finishProcessing(at) { this.processingEndTime = toDate(at); if (this.processingStartTime) this.totalProcessingTime += Math.max(0, (this.processingEndTime - this.processingStartTime) / 60000); }
  markMissedBoarding(at, reason = 'boarding deadline missed') { this.transitionTo(PASSENGER_STATUSES.MISSED_BOARDING, { at, reason, force: true }); }

  toJSON() { return { ...this, arrivalTime: iso(this.arrivalTime), scheduledDeparture: iso(this.scheduledDeparture), queueEntryTime: iso(this.queueEntryTime), processingStartTime: iso(this.processingStartTime), processingEndTime: iso(this.processingEndTime) }; }
}

function initialState(type) { return type === PASSENGER_TYPES.ARRIVAL || type === PASSENGER_TYPES.TRANSFER ? PASSENGER_STATUSES.ARRIVING_BY_AIRCRAFT : PASSENGER_STATUSES.CREATED; }
function toDate(value) { if (value === null || value === undefined) return null; const d = new Date(value); if (Number.isNaN(d.getTime())) throw new TypeError(`Invalid date: ${value}`); return d; }
function iso(value) { return value ? value.toISOString() : null; }
