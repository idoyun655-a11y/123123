export const GROUND_DATA_POLICY = Object.freeze({ sourceType: 'GAME', note: 'Ground handling task durations, staffing and resource capacities are game simulation defaults, not verified airline/ICN procedures.' });
export const GROUND_CONFIG = Object.freeze({
  handover: Object.freeze({ minutes: 0 }),
  tasks: Object.freeze({
    AircraftArrival: Object.freeze({ durationMinutes: 3, requiredStaff: 1, required: true, roleIds: ['RampCoordinator', 'GroundHandler'] }),
    ChocksParking: Object.freeze({ durationMinutes: 2, requiredStaff: 2, required: true, roleIds: ['RampCoordinator', 'GroundHandler'] }),
    PassengerDisembark: Object.freeze({ durationMinutes: 12, requiredStaff: 4, required: true, roleIds: ['GroundHandler'] }),
    BaggageUnload: Object.freeze({ durationMinutes: 12, requiredStaff: 4, required: true, roleIds: ['BaggageHandler', 'GroundHandler'] }),
    Cleaning: Object.freeze({ durationMinutes: 10, requiredStaff: 4, required: true, roleIds: ['GroundHandler'] }),
    Catering: Object.freeze({ durationMinutes: 10, requiredStaff: 3, required: false, roleIds: ['GroundHandler'] }),
    Refueling: Object.freeze({ durationMinutes: 15, requiredStaff: 3, required: false, roleIds: ['GroundHandler'] }),
    BoardingSupport: Object.freeze({ durationMinutes: 10, requiredStaff: 3, required: true, roleIds: ['GroundHandler', 'RampCoordinator'] }),
    BaggageLoad: Object.freeze({ durationMinutes: 10, requiredStaff: 4, required: true, roleIds: ['BaggageHandler', 'GroundHandler'] }),
    Pushback: Object.freeze({ durationMinutes: 5, requiredStaff: 2, required: true, roleIds: ['RampCoordinator', 'GroundHandler'] }),
  }),
  taskDefaults: Object.freeze({ priority: 0 }),
});
