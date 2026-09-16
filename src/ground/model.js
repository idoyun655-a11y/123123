export const GROUND_TASK_TYPES = Object.freeze({ AIRCRAFT_ARRIVAL: 'AircraftArrival', CHOCKS_PARKING: 'ChocksParking', PASSENGER_DISEMBARK: 'PassengerDisembark', BAGGAGE_UNLOAD: 'BaggageUnload', CATERING: 'Catering', CLEANING: 'Cleaning', REFUELING: 'Refueling', BOARDING_SUPPORT: 'BoardingSupport', BAGGAGE_LOAD: 'BaggageLoad', PUSHBACK: 'Pushback' });
export const GROUND_TASK_STATUS = Object.freeze({ PENDING: 'PENDING', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', DELAYED: 'DELAYED', CANCELLED: 'CANCELLED' });
export const GROUND_RESOURCE_TYPES = Object.freeze({ GROUND_HANDLER: 'GroundHandler', RAMP_COORDINATOR: 'RampCoordinator', CLEANING_CREW: 'CleaningCrew', CATERING_CREW: 'CateringCrew', REFUELING_CREW: 'RefuelingCrew', BAGGAGE_CREW: 'BaggageCrew' });
export const GROUND_RESOURCE_STATUS = Object.freeze({ AVAILABLE: 'AVAILABLE', ASSIGNED: 'ASSIGNED', WORKING: 'WORKING', OFF_DUTY: 'OFF_DUTY', UNAVAILABLE: 'UNAVAILABLE' });

export class GroundTask {
  constructor({ taskId, flightId, gateId = null, facilityId = null, taskType, requiredStaff = 0, assignedEmployees = [], startTime = null, estimatedEndTime = null, actualEndTime = null, status = GROUND_TASK_STATUS.PENDING, priority = 0, dependencies = [], required = true } = {}) {
    if (!taskId || !flightId || !taskType) throw new TypeError('taskId, flightId and taskType are required.');
    this.taskId = taskId; this.flightId = flightId; this.gateId = gateId; this.facilityId = facilityId; this.taskType = taskType; this.requiredStaff = Math.max(0, Number(requiredStaff) || 0); this.assignedEmployees = [...assignedEmployees]; this.startTime = toDate(startTime); this.estimatedEndTime = toDate(estimatedEndTime); this.actualEndTime = toDate(actualEndTime); this.status = status; this.priority = Number(priority) || 0; this.dependencies = [...dependencies]; this.required = required; this.delayMinutes = 0; this.history = [];
  }
  setStatus(status, at = null, reason = null) { if (!Object.values(GROUND_TASK_STATUS).includes(status)) throw new RangeError(`Invalid ground task status: ${status}`); this.status = status; this.history.push({ status, at: toDate(at), reason }); return status; }
  toJSON() { return { ...this, startTime: iso(this.startTime), estimatedEndTime: iso(this.estimatedEndTime), actualEndTime: iso(this.actualEndTime) }; }
}
export class GroundResource {
  constructor({ resourceId, type, capacity = 1, currentTask = null, status = GROUND_RESOURCE_STATUS.AVAILABLE, location = null, employeeIds = [] } = {}) { if (!resourceId || !type) throw new TypeError('resourceId and type are required.'); this.resourceId = resourceId; this.type = type; this.capacity = Math.max(1, Number(capacity) || 1); this.currentTask = currentTask; this.status = status; this.location = location; this.employeeIds = [...employeeIds]; }
}
function toDate(value) { if (value === null || value === undefined) return null; const d = new Date(value); if (Number.isNaN(d.getTime())) throw new TypeError(`Invalid date: ${value}`); return d; }
function iso(value) { return value ? value.toISOString() : null; }
