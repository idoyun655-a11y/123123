export const PASSENGER_ARRIVAL_MODEL = Object.freeze({
  sourceType: 'ESTIMATED',
  windowBeforeDepartureMinutes: 120,
  earlyTailMinutes: 30,
  distribution: 'PIECEWISE',
  segments: Object.freeze([
    Object.freeze({ startOffset: -120, endOffset: -90, weight: 0.10 }),
    Object.freeze({ startOffset: -90, endOffset: -60, weight: 0.20 }),
    Object.freeze({ startOffset: -60, endOffset: -30, weight: 0.35 }),
    Object.freeze({ startOffset: -30, endOffset: -10, weight: 0.25 }),
    Object.freeze({ startOffset: -10, endOffset: 0, weight: 0.10 }),
  ]),
});

export const PASSENGER_SERVICE_CONFIG = Object.freeze({
  checkIn: Object.freeze({ serverCount: 10, capacity: 5000, serviceTimeMinutes: Object.freeze([2, 5]) }),
  security: Object.freeze({ serverCount: 8, capacity: 5000, serviceTimeMinutes: Object.freeze([0.75, 2]) }),
  departureImmigration: Object.freeze({ serverCount: 8, capacity: 5000, serviceTimeMinutes: Object.freeze([0.5, 1.5]) }),
  arrivalImmigration: Object.freeze({ serverCount: 6, capacity: 5000, serviceTimeMinutes: Object.freeze([0.5, 1.5]) }),
  transferProcess: Object.freeze({ serverCount: 4, capacity: 2000, serviceTimeMinutes: Object.freeze([1, 3]) }),
});

export const PASSENGER_KPI_SOURCE_POLICY = 'Service rates are GAME defaults for simulation and must not be presented as verified ICN operational rates.';
