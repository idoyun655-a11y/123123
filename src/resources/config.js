export const GATE_ASSIGNMENT_WEIGHTS = Object.freeze({
  aircraftCompatibility: 40,
  terminalCompatibility: 20,
  connection: 10,
  airlinePreference: 5,
  distance: 10,
  congestionPenalty: 15,
  conflictPenalty: 1000,
});

export const RUNWAY_PRIORITY_WEIGHTS = Object.freeze({
  emergency: 1000,
  delayMinutes: 2,
  waitingMinutes: 1,
  scheduledTime: 0.001,
  state: 10,
});

export const RUNWAY_OPERATION_TIMES_MS = Object.freeze({
  landing: 5 * 60_000,
  departure: 5 * 60_000,
});

export const RESOURCE_RETRY_INTERVAL_MS = 60_000;
