export const GATE_STATUSES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  OCCUPIED: 'OCCUPIED',
  BOARDING: 'BOARDING',
  BLOCKED: 'BLOCKED',
  MAINTENANCE: 'MAINTENANCE',
});

const ACTIVE_RESERVATION_STATUSES = new Set([GATE_STATUSES.RESERVED, GATE_STATUSES.OCCUPIED, GATE_STATUSES.BOARDING]);

export class Gate {
  constructor({
    gateId,
    terminalId,
    location = null,
    gateType = null,
    compatibleAircraft = null,
    internationalDomestic = null,
    jetBridge = null,
    busGate = null,
    capacity = null,
    status = GATE_STATUSES.AVAILABLE,
    currentFlightId = null,
    occupiedSince = null,
    estimatedReleaseTime = null,
    maintenanceStatus = 'NORMAL',
    sourceType = 'ESTIMATED',
    properties = {},
    airlinePreferences = [],
  }) {
    if (!gateId || !terminalId) throw new TypeError('gateId and terminalId are required.');
    if (!Object.values(GATE_STATUSES).includes(status)) throw new RangeError(`Invalid gate status: ${status}`);
    this.gateId = gateId;
    this.terminalId = terminalId;
    this.location = location;
    this.gateType = gateType;
    this.compatibleAircraft = compatibleAircraft;
    this.internationalDomestic = internationalDomestic;
    this.jetBridge = jetBridge;
    this.busGate = busGate;
    this.capacity = capacity;
    this.status = status;
    this.currentFlightId = currentFlightId;
    this.occupiedSince = occupiedSince;
    this.estimatedReleaseTime = estimatedReleaseTime;
    this.maintenanceStatus = maintenanceStatus;
    this.sourceType = sourceType;
    this.properties = Object.freeze({ ...properties });
    this.airlinePreferences = Object.freeze([...airlinePreferences]);
    this.reservations = [];
  }

  isOperational() {
    return this.maintenanceStatus !== 'IN_PROGRESS' && this.status !== GATE_STATUSES.MAINTENANCE && this.status !== GATE_STATUSES.BLOCKED;
  }

  conflicts(start, end, excludeFlightId = null) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return this.reservations.some((reservation) => {
      if (reservation.flightId === excludeFlightId) return false;
      if (!ACTIVE_RESERVATION_STATUSES.has(reservation.status)) return false;
      return startMs < reservation.endMs && endMs > reservation.startMs;
    });
  }

  reserve(flightId, start, end) {
    if (!this.isOperational()) return false;
    if (this.conflicts(start, end, flightId)) return false;
    this.reservations.push({ flightId, startMs: new Date(start).getTime(), endMs: new Date(end).getTime(), status: GATE_STATUSES.RESERVED });
    this.#refreshAggregateStatus();
    this.estimatedReleaseTime = new Date(end);
    return true;
  }

  occupy(flightId, at) {
    const reservation = this.reservations.find((item) => item.flightId === flightId && ACTIVE_RESERVATION_STATUSES.has(item.status));
    if (!reservation) return false;
    reservation.status = GATE_STATUSES.OCCUPIED;
    this.status = GATE_STATUSES.OCCUPIED;
    this.currentFlightId = flightId;
    this.occupiedSince = new Date(at);
    return true;
  }

  setBoarding(flightId) {
    const reservation = this.reservations.find((item) => item.flightId === flightId && ACTIVE_RESERVATION_STATUSES.has(item.status));
    if (!reservation) return false;
    reservation.status = GATE_STATUSES.BOARDING;
    this.status = GATE_STATUSES.BOARDING;
    this.currentFlightId = flightId;
    return true;
  }

  release(flightId) {
    const before = this.reservations.length;
    this.reservations = this.reservations.filter((item) => item.flightId !== flightId);
    if (before === this.reservations.length) return false;
    this.currentFlightId = null;
    this.occupiedSince = null;
    this.estimatedReleaseTime = null;
    this.#refreshAggregateStatus();
    return true;
  }

  nextAvailableAt(now) {
    const currentMs = new Date(now).getTime();
    const future = this.reservations.filter((item) => ACTIVE_RESERVATION_STATUSES.has(item.status) && item.endMs > currentMs);
    if (future.length === 0) return new Date(now);
    return new Date(Math.min(...future.map((item) => item.endMs)));
  }

  #refreshAggregateStatus() {
    if (this.status === GATE_STATUSES.BLOCKED || this.status === GATE_STATUSES.MAINTENANCE) return;
    const active = this.reservations.filter((item) => ACTIVE_RESERVATION_STATUSES.has(item.status));
    if (active.some((item) => item.status === GATE_STATUSES.BOARDING)) {
      this.status = GATE_STATUSES.BOARDING;
      this.currentFlightId = active.find((item) => item.status === GATE_STATUSES.BOARDING)?.flightId ?? null;
    } else if (active.some((item) => item.status === GATE_STATUSES.OCCUPIED)) {
      this.status = GATE_STATUSES.OCCUPIED;
      this.currentFlightId = active.find((item) => item.status === GATE_STATUSES.OCCUPIED)?.flightId ?? null;
    } else if (active.length > 0) {
      this.status = GATE_STATUSES.RESERVED;
      this.currentFlightId = null;
      this.estimatedReleaseTime = new Date(Math.min(...active.map((item) => item.endMs)));
    } else {
      this.status = GATE_STATUSES.AVAILABLE;
      this.currentFlightId = null;
    }
  }
}
