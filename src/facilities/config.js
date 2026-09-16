export const FACILITY_DATA_POLICY = Object.freeze({
  sourceType: 'MIXED',
  real: ['publicly documented airport facility categories and existing project resource identities'],
  estimated: ['generic capacity mappings where public operating figures are incomplete'],
  game: ['equipment failure rates', 'maintenance intervals', 'repair durations', 'priority weights', 'health decay', 'efficiency curves'],
  note: 'Undisclosed airport internal equipment MTBF, failure rates, repair times, staffing allocation and maintenance algorithms are not represented as REAL data.',
});

export const FACILITY_CONFIG = Object.freeze({
  health: Object.freeze({
    decayPerOperatingHour: 0.08,
    utilizationDecayMultiplier: 0.35,
    degradedThreshold: 80,
    partiallyOperationalThreshold: 50,
    failedThreshold: 20,
    efficiencyByHealth: Object.freeze([
      { minHealth: 80, efficiency: 1.0 },
      { minHealth: 50, efficiency: 0.85 },
      { minHealth: 20, efficiency: 0.60 },
      { minHealth: 0, efficiency: 0.15 },
    ]),
  }),
  reliability: Object.freeze({
    baseFailureRatePerHour: 0.0008,
    ageFactorPerYear: 0.025,
    utilizationFactor: 0.8,
    conditionFactor: 1.8,
    maintenanceFactor: 2.0,
  }),
  maintenance: Object.freeze({
    defaultIntervalHours: 720,
    defaultIntervalDays: 30,
    repairTimeMinutes: 60,
    inspectionMinutes: 30,
    preventiveMinutes: 45,
    correctiveMinutes: 90,
    emergencyMinutes: 120,
    defaultRequiredStaff: 2,
    priorityWeights: Object.freeze({
      safetyWeight: 5,
      operationalImpact: 4,
      utilizationWeight: 2,
      failureSeverity: 5,
      passengerImpact: 3,
      flightImpact: 4,
    }),
  }),
  facility: Object.freeze({
    utilizationDegradationStart: 0.8,
    operatingScheduleDefault: Object.freeze({ type: '24/7' }),
  }),
  queueBindings: Object.freeze({
    CHECK_IN: 'CHECK_IN_QUEUE',
    SECURITY: 'SECURITY_QUEUE',
    DEPARTURE_IMMIGRATION: 'DEPARTURE_IMMIGRATION_QUEUE',
    ARRIVAL_IMMIGRATION: 'ARRIVAL_IMMIGRATION_QUEUE',
    BAGGAGE_DROP: 'BAGGAGE_DROP_QUEUE',
    BAGGAGE_SCREENING: 'BAGGAGE_SCREENING_QUEUE',
    BAGGAGE_SORTING: 'BAGGAGE_SORTING_QUEUE',
    BAGGAGE_TRANSFER_SORTING: 'BAGGAGE_TRANSFER_SORTING_QUEUE',
    BAGGAGE_LOADING: 'BAGGAGE_LOADING_QUEUE',
    BAGGAGE_UNLOAD: 'BAGGAGE_UNLOAD_QUEUE',
  }),
  equipmentDefaults: Object.freeze({
    CheckInCounter: Object.freeze({ capacity: 1, reliability: 0.995, maintenanceIntervalHours: 720 }),
    SecurityLane: Object.freeze({ capacity: 1, reliability: 0.992, maintenanceIntervalHours: 480 }),
    XRayMachine: Object.freeze({ capacity: 1, reliability: 0.99, maintenanceIntervalHours: 360 }),
    BaggageSorter: Object.freeze({ capacity: 1, reliability: 0.985, maintenanceIntervalHours: 360 }),
    Conveyor: Object.freeze({ capacity: 1, reliability: 0.99, maintenanceIntervalHours: 720 }),
    BoardingBridge: Object.freeze({ capacity: 1, reliability: 0.99, maintenanceIntervalHours: 720 }),
    BaggageCart: Object.freeze({ capacity: 1, reliability: 0.98, maintenanceIntervalHours: 240 }),
    TowTractor: Object.freeze({ capacity: 1, reliability: 0.985, maintenanceIntervalHours: 360 }),
    CateringVehicle: Object.freeze({ capacity: 1, reliability: 0.985, maintenanceIntervalHours: 360 }),
    FuelingEquipment: Object.freeze({ capacity: 1, reliability: 0.98, maintenanceIntervalHours: 360 }),
    GroundSupportEquipment: Object.freeze({ capacity: 1, reliability: 0.98, maintenanceIntervalHours: 360 }),
    PowerUnit: Object.freeze({ capacity: 1, reliability: 0.995, maintenanceIntervalHours: 720 }),
    ITSystem: Object.freeze({ capacity: 1, reliability: 0.995, maintenanceIntervalHours: 720 }),
    default: Object.freeze({ capacity: 1, reliability: 0.99, maintenanceIntervalHours: 720 }),
  }),
});

export const FACILITY_SERVICE_ROLE = Object.freeze({
  maintenance: new Set(['MaintenanceTechnician', 'FacilityOperator', 'SystemOperator']),
});
