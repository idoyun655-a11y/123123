export const BAGGAGE_DATA_POLICY = Object.freeze({ sourceType: 'GAME', note: 'Baggage generation, service times, cutoff and routing values are game simulation defaults, not verified ICN operational rates.' });
export const BAGGAGE_CONFIG = Object.freeze({
  generation: Object.freeze({
    checkedProbabilityByPassengerType: Object.freeze({ DEPARTURE: 0.78, ARRIVAL: 0, TRANSFER: 0.30 }),
    noneProbability: 0.10,
    oneProbability: 0.78,
    multipleProbability: 0.12,
    maxPieces: 3,
    weightKg: Object.freeze([8, 23]),
    carryOnProbability: 0.65,
    specialProbability: 0.02,
  }),
  queues: Object.freeze({
    drop: Object.freeze({ serverCount: 6, capacity: 10000, serviceTimeMinutes: [1, 2] }),
    screening: Object.freeze({ serverCount: 4, capacity: 10000, serviceTimeMinutes: [0.5, 1.5] }),
    sorting: Object.freeze({ serverCount: 6, capacity: 10000, serviceTimeMinutes: [0.5, 2] }),
    transferSorting: Object.freeze({ serverCount: 3, capacity: 10000, serviceTimeMinutes: [0.5, 2] }),
  }),
  loading: Object.freeze({ cutoffMinutes: 25, serverCount: 6, capacity: 10000, serviceTimeMinutes: [1, 3] }),
  unloading: Object.freeze({ serverCount: 6, capacity: 10000, serviceTimeMinutes: [1, 3] }),
  delivery: Object.freeze({ claimTransferMinutes: 2 }),
  routing: Object.freeze({ correctRouteProbability: 0.995, transferPriority: 30, tightConnectionPriority: 50, specialPriority: 20 }),
  priority: Object.freeze({ base: 0, connectionUrgencyWeight: 1, transferPenaltyWeight: 1, departureUrgencyWeight: 1 }),
});
export const BHS_SERVICE_TYPES = Object.freeze({ DROP: 'baggage-drop', SCREENING: 'baggage-screening', SORTING: 'baggage-sorting', TRANSFER_SORTING: 'baggage-transfer-sorting', LOADING: 'baggage-loading', UNLOADING: 'baggage-unloading' });
