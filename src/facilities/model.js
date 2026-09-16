export const FACILITY_TYPES = Object.freeze({
  TERMINAL: 'Terminal',
  CHECK_IN_ZONE: 'CheckInZone',
  SECURITY_ZONE: 'SecurityZone',
  IMMIGRATION_ZONE: 'ImmigrationZone',
  BAGGAGE_FACILITY: 'BaggageFacility',
  GATE: 'Gate',
  RUNWAY: 'Runway',
  APRON: 'Apron',
  PARKING: 'Parking',
  CARGO_FACILITY: 'CargoFacility',
});

export const FACILITY_STATUSES = Object.freeze({
  OPERATIONAL: 'OPERATIONAL',
  DEGRADED: 'DEGRADED',
  PARTIALLY_OPERATIONAL: 'PARTIALLY_OPERATIONAL',
  CLOSED: 'CLOSED',
  MAINTENANCE: 'MAINTENANCE',
  FAILED: 'FAILED',
});

export const EQUIPMENT_TYPES = Object.freeze({
  CHECK_IN_COUNTER: 'CheckInCounter',
  SECURITY_LANE: 'SecurityLane',
  XRAY_MACHINE: 'XRayMachine',
  BAGGAGE_SORTER: 'BaggageSorter',
  CONVEYOR: 'Conveyor',
  BOARDING_BRIDGE: 'BoardingBridge',
  ELEVATOR: 'Elevator',
  ESCALATOR: 'Escalator',
  BUS: 'Bus',
  GROUND_SUPPORT_EQUIPMENT: 'GroundSupportEquipment',
  BAGGAGE_CART: 'BaggageCart',
  TOW_TRACTOR: 'TowTractor',
  CATERING_VEHICLE: 'CateringVehicle',
  FUELING_EQUIPMENT: 'FuelingEquipment',
  POWER_UNIT: 'PowerUnit',
  IT_SYSTEM: 'ITSystem',
});

export const EQUIPMENT_STATUSES = Object.freeze({
  OPERATIONAL: 'OPERATIONAL',
  DEGRADED: 'DEGRADED',
  MAINTENANCE: 'MAINTENANCE',
  FAILED: 'FAILED',
  OFFLINE: 'OFFLINE',
  RETIRED: 'RETIRED',
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

export class Facility {
  constructor({
    facilityId,
    facilityType,
    name,
    terminalId = null,
    location = null,
    capacity = 0,
    operatingStatus = FACILITY_STATUSES.OPERATIONAL,
    maintenanceStatus = 'NORMAL',
    condition = 100,
    health = 100,
    reliability = 1,
    utilization = 0,
    availableCapacity = capacity,
    maxCapacity = capacity,
    maintenancePriority = 0,
    equipmentIds = [],
    operatingSchedule = { type: '24/7' },
    sourceType = 'ESTIMATED',
  } = {}) {
    if (!facilityId || !facilityType || !name) throw new TypeError('facilityId, facilityType, and name are required.');
    if (!Object.values(FACILITY_STATUSES).includes(operatingStatus)) throw new RangeError(`Invalid facility status: ${operatingStatus}`);
    this.facilityId = facilityId;
    this.facilityType = facilityType;
    this.name = name;
    this.terminalId = terminalId;
    this.location = location;
    this.capacity = Math.max(0, Number(capacity) || 0);
    this.maxCapacity = Math.max(0, Number(maxCapacity ?? capacity) || 0);
    this.operatingStatus = operatingStatus;
    this.maintenanceStatus = maintenanceStatus;
    this.condition = clamp(condition, 0, 100);
    this.health = clamp(health, 0, 100);
    this.reliability = clamp(reliability, 0, 1);
    this.utilization = clamp(utilization, 0, 1);
    this.availableCapacity = Math.max(0, Number(availableCapacity ?? capacity) || 0);
    this.maintenancePriority = Number(maintenancePriority) || 0;
    this.equipmentIds = [...new Set(equipmentIds)];
    this.operatingSchedule = operatingSchedule ?? { type: '24/7' };
    this.sourceType = sourceType;
  }

  addEquipment(equipmentId) { if (!this.equipmentIds.includes(equipmentId)) this.equipmentIds.push(equipmentId); return equipmentId; }
  removeEquipment(equipmentId) { this.equipmentIds = this.equipmentIds.filter((id) => id !== equipmentId); }
  setHealth(value) { this.health = clamp(value, 0, 100); this.condition = this.health; return this.health; }
  isOpen() { return ![FACILITY_STATUSES.CLOSED, FACILITY_STATUSES.MAINTENANCE, FACILITY_STATUSES.FAILED].includes(this.operatingStatus); }
}

export class Equipment {
  constructor({
    equipmentId,
    facilityId,
    equipmentType,
    status = EQUIPMENT_STATUSES.OPERATIONAL,
    health = 100,
    condition = 100,
    capacity = 1,
    efficiency = 1,
    reliability = 1,
    age = 0,
    operatingHours = 0,
    maintenanceDue = false,
    lastMaintenance = null,
    nextMaintenance = null,
    failureProbability = 0,
    utilization = 0,
    sourceType = 'GAME',
  } = {}) {
    if (!equipmentId || !facilityId || !equipmentType) throw new TypeError('equipmentId, facilityId, and equipmentType are required.');
    if (!Object.values(EQUIPMENT_STATUSES).includes(status)) throw new RangeError(`Invalid equipment status: ${status}`);
    this.equipmentId = equipmentId;
    this.facilityId = facilityId;
    this.equipmentType = equipmentType;
    this.status = status;
    this.health = clamp(health, 0, 100);
    this.condition = clamp(condition, 0, 100);
    this.capacity = Math.max(0, Number(capacity) || 0);
    this.efficiency = clamp(efficiency, 0, 1);
    this.reliability = clamp(reliability, 0, 1);
    this.age = Math.max(0, Number(age) || 0);
    this.operatingHours = Math.max(0, Number(operatingHours) || 0);
    this.maintenanceDue = Boolean(maintenanceDue);
    this.lastMaintenance = lastMaintenance ? new Date(lastMaintenance) : null;
    this.nextMaintenance = nextMaintenance ? new Date(nextMaintenance) : null;
    this.failureProbability = clamp(failureProbability, 0, 1);
    this.utilization = clamp(utilization, 0, 1);
    this.sourceType = sourceType;
    this.failureCount = 0;
    this.downtimeMinutes = 0;
    this.totalMaintenanceMinutes = 0;
  }

  setHealth(value) { this.health = clamp(value, 0, 100); this.condition = this.health; return this.health; }
  setEfficiency(value) { this.efficiency = clamp(value, 0, 1); return this.efficiency; }
  isAvailable() { return [EQUIPMENT_STATUSES.OPERATIONAL, EQUIPMENT_STATUSES.DEGRADED].includes(this.status); }
}

export const MAINTENANCE_TYPES = Object.freeze({ INSPECTION: 'INSPECTION', PREVENTIVE: 'PREVENTIVE', CORRECTIVE: 'CORRECTIVE', EMERGENCY: 'EMERGENCY' });
export const MAINTENANCE_STATUS = Object.freeze({ SCHEDULED: 'SCHEDULED', PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', DELAYED: 'DELAYED', CANCELLED: 'CANCELLED' });

export class MaintenanceTask {
  constructor({
    maintenanceId,
    facilityId = null,
    equipmentId,
    maintenanceType = MAINTENANCE_TYPES.PREVENTIVE,
    priority = 0,
    requiredStaff = 1,
    duration = 30,
    cost = 0,
    scheduledAt = null,
    startedAt = null,
    completedAt = null,
    status = MAINTENANCE_STATUS.SCHEDULED,
    assignedEmployees = [],
  } = {}) {
    if (!maintenanceId || !equipmentId) throw new TypeError('maintenanceId and equipmentId are required.');
    if (!Object.values(MAINTENANCE_TYPES).includes(maintenanceType)) throw new RangeError(`Invalid maintenance type: ${maintenanceType}`);
    if (!Object.values(MAINTENANCE_STATUS).includes(status)) throw new RangeError(`Invalid maintenance status: ${status}`);
    this.maintenanceId = maintenanceId;
    this.facilityId = facilityId;
    this.equipmentId = equipmentId;
    this.maintenanceType = maintenanceType;
    this.priority = Number(priority) || 0;
    this.requiredStaff = Math.max(0, Number(requiredStaff) || 0);
    this.duration = Math.max(0, Number(duration) || 0);
    this.cost = Math.max(0, Number(cost) || 0);
    this.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    this.startedAt = startedAt ? new Date(startedAt) : null;
    this.completedAt = completedAt ? new Date(completedAt) : null;
    this.status = status;
    this.assignedEmployees = [...new Set(assignedEmployees)];
  }

  assignEmployees(employeeIds = []) { this.assignedEmployees = [...new Set(employeeIds)]; return this.assignedEmployees; }
}
