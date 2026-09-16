import { FACILITY_CONFIG, FACILITY_DATA_POLICY, FACILITY_SERVICE_ROLE } from './config.js';
import { EQUIPMENT_STATUSES, EQUIPMENT_TYPES, FACILITY_STATUSES, Facility, Equipment, MaintenanceTask, MAINTENANCE_STATUS, MAINTENANCE_TYPES } from './model.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const asDate = (value, fallback = Date.now()) => {
  const date = new Date(value ?? fallback);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date: ${value}`);
  return date;
};

export class FacilitySystem {
  constructor(simulation, { queueEngine = null, employeeSystem = null, baggageSystem = null, groundHandlingSystem = null, gateSystem = null, runwaySystem = null, config = FACILITY_CONFIG, random = Math.random } = {}) {
    if (!simulation || typeof simulation.schedule !== 'function') throw new TypeError('SimulationCore-compatible instance is required.');
    Object.assign(this, { simulation, queueEngine, employeeSystem, baggageSystem, groundHandlingSystem, gateSystem, runwaySystem, config, random });
    this.facilities = new Map();
    this.equipment = new Map();
    this.maintenance = new Map();
    this.queueBindings = new Map();
    this.flightImpactLog = [];
    this.sequence = 0;
  }

  attachQueueEngine(engine) { this.queueEngine = engine; this.syncAllQueueCapacities(); return engine; }
  attachEmployeeSystem(system) { this.employeeSystem = system; this.syncAllQueueCapacities(); return system; }
  attachBaggageSystem(system) { this.baggageSystem = system; system?.attachFacilitySystem?.(this); return system; }
  attachGroundHandlingSystem(system) { this.groundHandlingSystem = system; system?.attachFacilitySystem?.(this); return system; }
  attachGateSystem(system) { this.gateSystem = system; return system; }
  attachRunwaySystem(system) { this.runwaySystem = system; return system; }

  addFacility(input) {
    const facility = input instanceof Facility ? input : new Facility(input);
    if (this.facilities.has(facility.facilityId)) throw new Error(`Facility already exists: ${facility.facilityId}`);
    this.facilities.set(facility.facilityId, facility);
    this._recalculateFacility(facility.facilityId);
    return facility;
  }
  addFacilities(items = []) { return items.map((item) => this.addFacility(item)); }
  getFacility(id) { return this.facilities.get(id) ?? null; }
  listFacilities() { return [...this.facilities.values()]; }

  addEquipment(input) {
    const equipment = input instanceof Equipment ? input : new Equipment(input);
    if (this.equipment.has(equipment.equipmentId)) throw new Error(`Equipment already exists: ${equipment.equipmentId}`);
    const facility = this.facilities.get(equipment.facilityId);
    if (!facility) throw new Error(`Unknown facility: ${equipment.facilityId}`);
    const defaults = this.config.equipmentDefaults[equipment.equipmentType] ?? this.config.equipmentDefaults.default;
    if (input?.reliability == null) equipment.reliability = defaults.reliability;
    if (input?.capacity == null) equipment.capacity = defaults.capacity;
    equipment.efficiency = input?.efficiency == null ? this.efficiencyForHealth(equipment.health) : equipment.efficiency;
    equipment.maintenanceIntervalHours = input?.maintenanceIntervalHours ?? defaults.maintenanceIntervalHours ?? this.config.maintenance.defaultIntervalHours;
    equipment.maintenanceIntervalDays = input?.maintenanceIntervalDays ?? null;
    this.equipment.set(equipment.equipmentId, equipment);
    facility.equipmentIds.push(equipment.equipmentId);
    equipment.failureProbability = this._calculateFailureProbability(equipment);
    this._recalculateFacility(facility.facilityId);
    this._syncEquipmentImpact(equipment);
    return equipment;
  }
  addEquipments(items = []) { return items.map((item) => this.addEquipment(item)); }
  getEquipment(id) { return this.equipment.get(id) ?? null; }
  listEquipment() { return [...this.equipment.values()]; }
  getEquipmentForFacility(id) { const facility = this.getFacility(id); return facility ? facility.equipmentIds.map((equipmentId) => this.getEquipment(equipmentId)).filter(Boolean) : []; }

  bindQueue({ queueId, facilityId, equipmentTypes = [], baseServerCount = null, serviceRateMultiplierFloor = 0.1 } = {}) {
    if (!queueId || !facilityId) throw new TypeError('queueId and facilityId are required.');
    if (!this.facilities.has(facilityId)) throw new Error(`Unknown facility: ${facilityId}`);
    this.queueBindings.set(queueId, { queueId, facilityId, equipmentTypes: [...equipmentTypes], baseServerCount, serviceRateMultiplierFloor });
    return this.syncQueueCapacity(queueId);
  }

  bindStandardQueues() {
    const q = this.config.queueBindings;
    const bindings = [
      [q.CHECK_IN, 'CHECK_IN_ZONE', [EQUIPMENT_TYPES.CHECK_IN_COUNTER]],
      [q.SECURITY, 'SECURITY_ZONE', [EQUIPMENT_TYPES.SECURITY_LANE, EQUIPMENT_TYPES.XRAY_MACHINE]],
      [q.DEPARTURE_IMMIGRATION, 'DEPARTURE_IMMIGRATION_ZONE', [EQUIPMENT_TYPES.IT_SYSTEM]],
      [q.ARRIVAL_IMMIGRATION, 'ARRIVAL_IMMIGRATION_ZONE', [EQUIPMENT_TYPES.IT_SYSTEM]],
      [q.BAGGAGE_DROP, 'BAGGAGE_FACILITY', [EQUIPMENT_TYPES.CONVEYOR]],
      [q.BAGGAGE_SCREENING, 'BAGGAGE_FACILITY', [EQUIPMENT_TYPES.XRAY_MACHINE]],
      [q.BAGGAGE_SORTING, 'BAGGAGE_FACILITY', [EQUIPMENT_TYPES.BAGGAGE_SORTER]],
      [q.BAGGAGE_TRANSFER_SORTING, 'BAGGAGE_FACILITY', [EQUIPMENT_TYPES.BAGGAGE_SORTER]],
      [q.BAGGAGE_LOADING, 'BAGGAGE_FACILITY', [EQUIPMENT_TYPES.BAGGAGE_CART, EQUIPMENT_TYPES.CONVEYOR]],
      [q.BAGGAGE_UNLOAD, 'BAGGAGE_FACILITY', [EQUIPMENT_TYPES.BAGGAGE_CART, EQUIPMENT_TYPES.CONVEYOR]],
    ];
    for (const [queueId, facilityId, types] of bindings) if (this.facilities.has(facilityId) && this.queueEngine?.getQueue(queueId)) this.bindQueue({ queueId, facilityId, equipmentTypes: types });
  }
  syncAllQueueCapacities() { for (const queueId of this.queueBindings.keys()) this.syncQueueCapacity(queueId); }

  syncQueueCapacity(queueId) {
    const binding = this.queueBindings.get(queueId);
    const queue = this.queueEngine?.getQueue(queueId);
    if (!binding || !queue) return null;
    const facility = this.getFacility(binding.facilityId);
    if (!facility) return null;
    const equipment = this.getEquipmentForFacility(binding.facilityId).filter((item) => !binding.equipmentTypes.length || binding.equipmentTypes.includes(item.equipmentType));
    const equipmentCapacity = equipment.length ? equipment.filter((item) => item.isAvailable()).reduce((sum, item) => sum + item.capacity, 0) : queue.configuredServerCount;
    const base = binding.baseServerCount ?? queue.configuredServerCount;
    const staffCapacity = this._staffCapacity(facility.facilityId, base);
    const operationalFactor = this.getFacilityOperationalFactor(facility);
    const equipmentEfficiency = equipment.length ? this._weightedEfficiency(equipment.filter((item) => item.isAvailable())) : 1;
    const effectiveServerCount = Math.max(0, Math.floor(Math.min(base, equipmentCapacity, staffCapacity) * operationalFactor));
    const serviceRateMultiplier = Math.max(binding.serviceRateMultiplierFloor, operationalFactor * equipmentEfficiency * this._staffingFactor(staffCapacity, base));
    return this.queueEngine.updateServiceCapacity(queueId, { serverCount: effectiveServerCount, serviceRateMultiplier });
  }

  calculateFacilityCapacity(facilityId) {
    const facility = this._requireFacility(facilityId);
    const equipment = this.getEquipmentForFacility(facilityId);
    const available = equipment.filter((item) => item.isAvailable());
    const equipmentAvailability = equipment.length ? available.reduce((sum, item) => sum + item.capacity, 0) / Math.max(facility.maxCapacity, 1) : 1;
    const equipmentEfficiency = equipment.length ? this._weightedEfficiency(available) : 1;
    const staffingFactor = this._staffingFactor(this._staffCapacity(facilityId, facility.maxCapacity), facility.maxCapacity);
    const operationalFactor = this.getFacilityOperationalFactor(facility);
    const effectiveCapacity = Math.max(0, Math.floor(facility.maxCapacity * Math.min(1, equipmentAvailability) * equipmentEfficiency * staffingFactor * operationalFactor));
    return { baseCapacity: facility.maxCapacity, equipmentAvailability: Math.min(1, equipmentAvailability), equipmentEfficiency, staffingFactor, operationalFactor, effectiveCapacity };
  }

  getFacilityOperationalFactor(facility) {
    if (!facility || [FACILITY_STATUSES.CLOSED, FACILITY_STATUSES.MAINTENANCE, FACILITY_STATUSES.FAILED].includes(facility.operatingStatus)) return 0;
    if (facility.health >= this.config.health.degradedThreshold) return 1;
    if (facility.health >= this.config.health.partiallyOperationalThreshold) return 0.85;
    if (facility.health >= this.config.health.failedThreshold) return 0.6;
    return 0.15;
  }

  recordUtilization(facilityId, actualUsage) {
    const facility = this._requireFacility(facilityId);
    facility.utilization = clamp(actualUsage / Math.max(1, facility.availableCapacity), 0, 1);
    for (const equipment of this.getEquipmentForFacility(facilityId)) equipment.utilization = facility.utilization;
    return facility.utilization;
  }

  updateEquipmentHealth(equipmentId, health, { at = this.simulation.getSnapshot().currentTime, hours = 0 } = {}) {
    const equipment = this._requireEquipment(equipmentId);
    if (hours > 0) equipment.operatingHours += hours;
    const before = equipment.status;
    equipment.setHealth(health);
    equipment.efficiency = this.efficiencyForHealth(equipment.health);
    equipment.failureProbability = this._calculateFailureProbability(equipment);
    if (equipment.health <= 0) equipment.status = EQUIPMENT_STATUSES.FAILED;
    else if (equipment.health < this.config.health.degradedThreshold && equipment.status === EQUIPMENT_STATUSES.OPERATIONAL) equipment.status = EQUIPMENT_STATUSES.DEGRADED;
    else if (equipment.health >= this.config.health.degradedThreshold && equipment.status === EQUIPMENT_STATUSES.DEGRADED) equipment.status = EQUIPMENT_STATUSES.OPERATIONAL;
    this._recalculateFacility(equipment.facilityId);
    this._syncEquipmentImpact(equipment);
    this.simulation.logger.info('EquipmentHealthChangedEvent', { equipmentId, health: equipment.health, at: asDate(at).toISOString() });
    if (before !== EQUIPMENT_STATUSES.FAILED && equipment.status === EQUIPMENT_STATUSES.FAILED) this.createCorrectiveMaintenance(equipmentId, { at });
    return equipment;
  }

  advanceOperatingHours(hours, { at = this.simulation.getSnapshot().currentTime } = {}) {
    if (!Number.isFinite(hours) || hours < 0) throw new RangeError('hours must be non-negative.');
    for (const equipment of this.equipment.values()) {
      if (!equipment.isAvailable()) continue;
      const decay = hours * this.config.health.decayPerOperatingHour * (1 + equipment.utilization * this.config.health.utilizationDecayMultiplier);
      equipment.operatingHours += hours;
      this.updateEquipmentHealth(equipment.equipmentId, equipment.health - decay, { at });
      if (this.isMaintenanceDue(equipment, at)) equipment.maintenanceDue = true;
    }
    return this.evaluateFailures({ at });
  }

  efficiencyForHealth(health) { return this.config.health.efficiencyByHealth.find((row) => health >= row.minHealth)?.efficiency ?? 0.15; }
  isMaintenanceDue(equipment, at = this.simulation.getSnapshot().currentTime) {
    if (equipment.nextMaintenance && asDate(at) >= equipment.nextMaintenance) return true;
    if (equipment.maintenanceIntervalHours && equipment.operatingHours >= equipment.maintenanceIntervalHours) return true;
    if (equipment.maintenanceIntervalDays && equipment.lastMaintenance) return asDate(at).getTime() - equipment.lastMaintenance.getTime() >= equipment.maintenanceIntervalDays * 86400000;
    return equipment.maintenanceDue;
  }

  evaluateFailures({ at = this.simulation.getSnapshot().currentTime } = {}) {
    const failures = [];
    for (const equipment of this.equipment.values()) {
      if (!equipment.isAvailable()) continue;
      equipment.failureProbability = this._calculateFailureProbability(equipment);
      if (this.random() < equipment.failureProbability) failures.push(this.failEquipment(equipment.equipmentId, { at, reason: 'probabilistic reliability model' }));
    }
    return failures;
  }

  failEquipment(equipmentId, { at = this.simulation.getSnapshot().currentTime, reason = 'failure' } = {}) {
    const equipment = this._requireEquipment(equipmentId);
    if (equipment.status === EQUIPMENT_STATUSES.FAILED) return equipment;
    equipment.status = EQUIPMENT_STATUSES.FAILED;
    equipment.failureCount += 1;
    equipment.failureReason = reason;
    equipment.failureStartedAt = asDate(at);
    this._recalculateFacility(equipment.facilityId);
    this._syncEquipmentImpact(equipment);
    const task = this.createCorrectiveMaintenance(equipmentId, { at });
    this.simulation.logger.info('EquipmentFailureEvent', { equipmentId, facilityId: equipment.facilityId, maintenanceId: task.maintenanceId, at: equipment.failureStartedAt.toISOString() });
    return equipment;
  }

  createMaintenance(input) {
    const equipment = this._requireEquipment(input.equipmentId);
    const task = input instanceof MaintenanceTask ? input : new MaintenanceTask({ ...input, facilityId: input.facilityId ?? equipment.facilityId, status: input.status ?? MAINTENANCE_STATUS.PENDING });
    if (this.maintenance.has(task.maintenanceId)) throw new Error(`Maintenance task already exists: ${task.maintenanceId}`);
    this.maintenance.set(task.maintenanceId, task);
    const facility = this.getFacility(task.facilityId);
    if (facility) facility.maintenancePriority = Math.max(facility.maintenancePriority, task.priority);
    if (task.scheduledAt) this.simulation.schedule({ at: task.scheduledAt, type: 'maintenance.scheduled', payload: { maintenanceId: task.maintenanceId }, handler: ({ event }) => this.startMaintenance(task.maintenanceId, event.at) });
    return task;
  }

  createPreventiveMaintenance(equipmentId, { at = this.simulation.getSnapshot().currentTime, priority = 0 } = {}) {
    const equipment = this._requireEquipment(equipmentId);
    return this.createMaintenance({ maintenanceId: `M-${++this.sequence}`, equipmentId, facilityId: equipment.facilityId, maintenanceType: MAINTENANCE_TYPES.PREVENTIVE, priority, requiredStaff: this.config.maintenance.defaultRequiredStaff, duration: this.config.maintenance.preventiveMinutes, scheduledAt: asDate(at), status: MAINTENANCE_STATUS.SCHEDULED });
  }
  createCorrectiveMaintenance(equipmentId, { at = this.simulation.getSnapshot().currentTime } = {}) {
    const equipment = this._requireEquipment(equipmentId);
    return this.createMaintenance({ maintenanceId: `M-${++this.sequence}`, equipmentId, facilityId: equipment.facilityId, maintenanceType: MAINTENANCE_TYPES.CORRECTIVE, priority: this.calculateMaintenancePriority(equipmentId), requiredStaff: this.config.maintenance.defaultRequiredStaff, duration: this.config.maintenance.correctiveMinutes, scheduledAt: null, status: MAINTENANCE_STATUS.PENDING });
  }
  assignMaintenance(maintenanceId, employeeIds = []) { const task = this._requireMaintenance(maintenanceId); task.assignEmployees(employeeIds); if ([MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.DELAYED].includes(task.status)) this.startMaintenance(maintenanceId); return task; }

  autoAssignMaintenance(maintenanceId) {
    const task = this._requireMaintenance(maintenanceId);
    if (!this.employeeSystem?.listEmployees) return task;
    const ids = this.employeeSystem.listEmployees().filter((employee) => employee.isOperational() && FACILITY_SERVICE_ROLE.maintenance.has(employee.roleId) && (!employee.currentFacilityId || employee.currentFacilityId === task.facilityId)).sort((a, b) => (this.employeeSystem.effectiveProductivity(b.employeeId) ?? 0) - (this.employeeSystem.effectiveProductivity(a.employeeId) ?? 0)).slice(0, task.requiredStaff).map((employee) => employee.employeeId);
    if (ids.length) task.assignEmployees(ids);
    return task;
  }

  startMaintenance(maintenanceId, at = this.simulation.getSnapshot().currentTime) {
    const task = this._requireMaintenance(maintenanceId);
    if ([MAINTENANCE_STATUS.COMPLETED, MAINTENANCE_STATUS.CANCELLED, MAINTENANCE_STATUS.IN_PROGRESS].includes(task.status)) return task;
    if (!task.assignedEmployees.length && this.employeeSystem) this.autoAssignMaintenance(maintenanceId);
    const staffingFactor = this._maintenanceStaffingFactor(task);
    if (staffingFactor <= 0) { task.status = MAINTENANCE_STATUS.DELAYED; this._scheduleMaintenanceRetry(task, at); return task; }
    const equipment = this._requireEquipment(task.equipmentId);
    equipment.status = EQUIPMENT_STATUSES.MAINTENANCE;
    task.status = staffingFactor < 1 ? MAINTENANCE_STATUS.DELAYED : MAINTENANCE_STATUS.IN_PROGRESS;
    task.startedAt = asDate(at);
    const duration = task.duration / Math.max(0.01, staffingFactor);
    this.simulation.schedule({ at: new Date(task.startedAt.getTime() + duration * 60000), type: 'maintenance.completed', payload: { maintenanceId }, handler: ({ event }) => this.completeMaintenance(maintenanceId, event.at) });
    this._recalculateFacility(equipment.facilityId);
    this._syncEquipmentImpact(equipment);
    this.simulation.logger.info('MaintenanceStartedEvent', { maintenanceId, equipmentId: task.equipmentId, at: task.startedAt.toISOString() });
    return task;
  }

  completeMaintenance(maintenanceId, at = this.simulation.getSnapshot().currentTime) {
    const task = this._requireMaintenance(maintenanceId);
    const equipment = this._requireEquipment(task.equipmentId);
    const completedAt = asDate(at);
    const elapsed = task.startedAt ? Math.max(0, (completedAt - task.startedAt) / 60000) : 0;
    task.completedAt = completedAt;
    task.status = MAINTENANCE_STATUS.COMPLETED;
    equipment.lastMaintenance = completedAt;
    equipment.maintenanceDue = false;
    equipment.operatingHours *= 0.25;
    equipment.setHealth(100);
    equipment.efficiency = 1;
    equipment.status = EQUIPMENT_STATUSES.OPERATIONAL;
    equipment.totalMaintenanceMinutes += elapsed;
    if (equipment.failureStartedAt) equipment.downtimeMinutes += Math.max(0, (completedAt - equipment.failureStartedAt) / 60000);
    equipment.failureStartedAt = null;
    equipment.nextMaintenance = new Date(completedAt.getTime() + (equipment.maintenanceIntervalHours ?? this.config.maintenance.defaultIntervalHours) * 3600000);
    this._recalculateFacility(equipment.facilityId);
    this._syncEquipmentImpact(equipment);
    this._resumeBoundServices(equipment.facilityId);
    this.simulation.logger.info('MaintenanceCompletedEvent', { maintenanceId, equipmentId: task.equipmentId, at: completedAt.toISOString() });
    return task;
  }

  calculateMaintenancePriority(equipmentId) {
    const equipment = this._requireEquipment(equipmentId);
    const facility = this._requireFacility(equipment.facilityId);
    const w = this.config.maintenance.priorityWeights;
    const safety = [EQUIPMENT_TYPES.SECURITY_LANE, EQUIPMENT_TYPES.XRAY_MACHINE, EQUIPMENT_TYPES.BOARDING_BRIDGE].includes(equipment.equipmentType) ? w.safetyWeight : 0;
    const operational = equipment.capacity * w.operationalImpact;
    const utilization = equipment.utilization * w.utilizationWeight;
    const severity = (1 - equipment.health / 100) * w.failureSeverity;
    const passenger = [EQUIPMENT_TYPES.CHECK_IN_COUNTER, EQUIPMENT_TYPES.SECURITY_LANE, EQUIPMENT_TYPES.ESCALATOR, EQUIPMENT_TYPES.ELEVATOR].includes(equipment.equipmentType) ? w.passengerImpact : 0;
    const flight = [EQUIPMENT_TYPES.BOARDING_BRIDGE, EQUIPMENT_TYPES.BAGGAGE_SORTER, EQUIPMENT_TYPES.TOW_TRACTOR, EQUIPMENT_TYPES.FUELING_EQUIPMENT].includes(equipment.equipmentType) ? w.flightImpact : 0;
    return Math.round((safety + operational + utilization + severity + passenger + flight + facility.maintenancePriority) * 100) / 100;
  }

  getGroundEquipmentFactor(facilityId, taskType = null) {
    const types = normalizeGroundTypes(taskType);
    const equipment = this.getEquipmentForFacility(facilityId).filter((item) => !types || types.includes(item.equipmentType));
    if (!equipment.length) return 1;
    const total = equipment.reduce((sum, item) => sum + item.capacity, 0);
    const available = equipment.filter((item) => item.isAvailable()).reduce((sum, item) => sum + item.capacity * item.efficiency, 0);
    return Math.min(1, available / Math.max(1, total));
  }

  getFailedEquipment() { return this.listEquipment().filter((item) => item.status === EQUIPMENT_STATUSES.FAILED); }
  listMaintenance() { return [...this.maintenance.values()]; }
  getMaintenance(id) { return this.maintenance.get(id) ?? null; }
  getMaintenanceQueue() { return this.listMaintenance().filter((task) => [MAINTENANCE_STATUS.SCHEDULED, MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.DELAYED].includes(task.status)).sort((a, b) => b.priority - a.priority); }
  getFacilityStatus(id) { const facility = this._requireFacility(id); return { ...facility, ...this.calculateFacilityCapacity(id) }; }
  getEquipmentStatus(id) { return this._requireEquipment(id); }

  statistics() {
    const facilities = this.listFacilities();
    const equipment = this.listEquipment();
    const maintenance = this.listMaintenance();
    const completed = maintenance.filter((task) => task.status === MAINTENANCE_STATUS.COMPLETED && task.startedAt && task.completedAt);
    const avg = (items, fn) => items.length ? items.reduce((sum, item) => sum + fn(item), 0) / items.length : 0;
    return {
      facilities: {
        totalFacilities: facilities.length,
        operationalFacilities: facilities.filter((f) => f.operatingStatus === FACILITY_STATUSES.OPERATIONAL).length,
        degradedFacilities: facilities.filter((f) => [FACILITY_STATUSES.DEGRADED, FACILITY_STATUSES.PARTIALLY_OPERATIONAL].includes(f.operatingStatus)).length,
        maintenanceFacilities: facilities.filter((f) => f.operatingStatus === FACILITY_STATUSES.MAINTENANCE).length,
        failedFacilities: facilities.filter((f) => f.operatingStatus === FACILITY_STATUSES.FAILED).length,
        closedFacilities: facilities.filter((f) => f.operatingStatus === FACILITY_STATUSES.CLOSED).length,
        facilities: facilities.map((f) => ({ facilityId: f.facilityId, health: f.health, utilization: f.utilization, availableCapacity: f.availableCapacity, effectiveCapacity: this.calculateFacilityCapacity(f.facilityId).effectiveCapacity, operatingStatus: f.operatingStatus, maintenanceStatus: f.maintenanceStatus })),
      },
      equipment: {
        totalEquipment: equipment.length,
        operationalEquipment: equipment.filter((e) => e.status === EQUIPMENT_STATUSES.OPERATIONAL).length,
        degradedEquipment: equipment.filter((e) => e.status === EQUIPMENT_STATUSES.DEGRADED).length,
        maintenanceEquipment: equipment.filter((e) => e.status === EQUIPMENT_STATUSES.MAINTENANCE).length,
        failedEquipment: equipment.filter((e) => e.status === EQUIPMENT_STATUSES.FAILED).length,
        offlineEquipment: equipment.filter((e) => e.status === EQUIPMENT_STATUSES.OFFLINE).length,
        averageHealth: avg(equipment, (e) => e.health),
        averageUtilization: avg(equipment, (e) => e.utilization),
        failureCount: equipment.reduce((sum, e) => sum + e.failureCount, 0),
        maintenanceCount: maintenance.length,
        preventiveMaintenanceCount: maintenance.filter((m) => m.maintenanceType === MAINTENANCE_TYPES.PREVENTIVE).length,
        correctiveMaintenanceCount: maintenance.filter((m) => m.maintenanceType === MAINTENANCE_TYPES.CORRECTIVE).length,
        averageRepairTime: avg(completed.filter((m) => m.maintenanceType === MAINTENANCE_TYPES.CORRECTIVE), (m) => (m.completedAt - m.startedAt) / 60000),
        averageMaintenanceTime: avg(completed, (m) => (m.completedAt - m.startedAt) / 60000),
      },
      maintenance: {
        pendingMaintenance: maintenance.filter((m) => m.status === MAINTENANCE_STATUS.PENDING).length,
        activeMaintenance: maintenance.filter((m) => m.status === MAINTENANCE_STATUS.IN_PROGRESS).length,
        completedMaintenance: maintenance.filter((m) => m.status === MAINTENANCE_STATUS.COMPLETED).length,
        delayedMaintenance: maintenance.filter((m) => m.status === MAINTENANCE_STATUS.DELAYED).length,
        maintenanceBacklog: maintenance.filter((m) => [MAINTENANCE_STATUS.SCHEDULED, MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.DELAYED].includes(m.status)).length,
        averageMaintenanceDuration: avg(completed, (m) => (m.completedAt - m.startedAt) / 60000),
        equipmentDowntime: equipment.reduce((sum, e) => sum + e.downtimeMinutes, 0),
        facilityDowntime: 0,
      },
      dataPolicy: FACILITY_DATA_POLICY,
    };
  }

  _recalculateFacility(facilityId) {
    const facility = this._requireFacility(facilityId);
    const equipment = this.getEquipmentForFacility(facilityId);
    const available = equipment.filter((item) => item.isAvailable());
    const rawCapacity = available.reduce((sum, item) => sum + item.capacity * item.efficiency, 0);
    facility.availableCapacity = equipment.length ? Math.min(facility.maxCapacity, Math.max(0, Math.floor(rawCapacity))) : facility.maxCapacity;
    const availabilityRatio = equipment.length ? available.reduce((sum, item) => sum + item.capacity, 0) / Math.max(1, equipment.reduce((sum, item) => sum + item.capacity, 0)) : 1;
    if (facility.operatingStatus !== FACILITY_STATUSES.CLOSED && facility.maintenanceStatus !== 'IN_PROGRESS') {
      if (equipment.length && availabilityRatio <= 0) facility.operatingStatus = FACILITY_STATUSES.FAILED;
      else if (facility.health < this.config.health.failedThreshold) facility.operatingStatus = FACILITY_STATUSES.PARTIALLY_OPERATIONAL;
      else if (equipment.length && availabilityRatio < 1) facility.operatingStatus = FACILITY_STATUSES.DEGRADED;
      else if (this.getFacilityOperationalFactor(facility) < 1) facility.operatingStatus = FACILITY_STATUSES.DEGRADED;
      else facility.operatingStatus = FACILITY_STATUSES.OPERATIONAL;
    }
    return facility;
  }

  _staffCapacity(facilityId, fallback) {
    if (!this.employeeSystem?.listEmployees) return fallback;
    const employees = this.employeeSystem.listEmployees().filter((employee) => employee.isOperational() && employee.currentFacilityId === facilityId);
    return employees.length ? employees.reduce((sum, employee) => sum + (this.employeeSystem.effectiveProductivity(employee.employeeId) ?? 0), 0) : 0;
  }
  _staffingFactor(staffCapacity, base) { return base > 0 ? Math.min(1, staffCapacity / base) : 1; }
  _weightedEfficiency(items) { return items.length ? items.reduce((sum, item) => sum + item.efficiency * item.capacity, 0) / Math.max(1, items.reduce((sum, item) => sum + item.capacity, 0)) : 0; }
  _calculateFailureProbability(equipment) {
    const r = this.config.reliability;
    const ageFactor = 1 + Math.max(0, equipment.age) * r.ageFactorPerYear;
    const utilizationFactor = 1 + equipment.utilization * r.utilizationFactor;
    const conditionFactor = 1 + (1 - equipment.health / 100) * r.conditionFactor;
    const maintenanceFactor = equipment.maintenanceDue ? r.maintenanceFactor : 1;
    return Math.min(1, r.baseFailureRatePerHour * ageFactor * utilizationFactor * conditionFactor * maintenanceFactor * Math.max(0.01, 1 / Math.max(0.01, equipment.reliability)));
  }
  _maintenanceStaffingFactor(task) {
    if (!task.requiredStaff || !this.employeeSystem?.listEmployees) return this.employeeSystem ? 0 : 1;
    const staff = task.assignedEmployees.map((id) => this.employeeSystem.getEmployee?.(id)).filter((employee) => employee?.isOperational());
    if (!staff.length) return 0;
    const capacity = staff.reduce((sum, employee) => sum + (this.employeeSystem.effectiveProductivity(employee.employeeId) ?? 0), 0);
    return Math.min(1, capacity / task.requiredStaff);
  }
  _scheduleMaintenanceRetry(task, at) { this.simulation.schedule({ at: new Date(asDate(at).getTime() + 60000), type: 'maintenance.retry', payload: { maintenanceId: task.maintenanceId }, handler: ({ event }) => this.startMaintenance(task.maintenanceId, event.at) }); }
  _syncEquipmentImpact(equipment) {
    for (const queueId of this.queueBindings.keys()) if (this.queueBindings.get(queueId)?.facilityId === equipment.facilityId) this.syncQueueCapacity(queueId);
    if (equipment.equipmentType === EQUIPMENT_TYPES.BOARDING_BRIDGE && this.gateSystem) {
      const gateId = equipment.facilityId.startsWith('GATE_') ? equipment.facilityId.slice(5) : null;
      const gate = gateId ? this.gateSystem.getGate?.(gateId) : null;
      if (gate && equipment.status === EQUIPMENT_STATUSES.FAILED) gate.status = 'BLOCKED';
      if (gate && equipment.status === EQUIPMENT_STATUSES.OPERATIONAL && gate.status === 'BLOCKED') gate.status = 'AVAILABLE';
    }
    if (equipment.facilityId.startsWith('RUNWAY_') && this.runwaySystem) {
      const runway = this.runwaySystem.getRunway?.(equipment.facilityId.slice(7));
      if (runway && equipment.status === EQUIPMENT_STATUSES.FAILED) runway.status = 'MAINTENANCE';
      if (runway && equipment.status === EQUIPMENT_STATUSES.OPERATIONAL && runway.status === 'MAINTENANCE') runway.status = 'AVAILABLE';
    }
    this.flightImpactLog.push({ equipmentId: equipment.equipmentId, facilityId: equipment.facilityId, status: equipment.status, at: new Date(this.simulation.getSnapshot().currentTime) });
    if (this.flightImpactLog.length > 1000) this.flightImpactLog.shift();
  }
  _resumeBoundServices(facilityId) { for (const queueId of this.queueBindings.keys()) if (this.queueBindings.get(queueId)?.facilityId === facilityId) this.syncQueueCapacity(queueId); }
  _requireFacility(id) { const facility = this.facilities.get(id); if (!facility) throw new Error(`Unknown facility: ${id}`); return facility; }
  _requireEquipment(id) { const equipment = this.equipment.get(id); if (!equipment) throw new Error(`Unknown equipment: ${id}`); return equipment; }
  _requireMaintenance(id) { const task = this.maintenance.get(id); if (!task) throw new Error(`Unknown maintenance task: ${id}`); return task; }
}

function normalizeGroundTypes(taskType) {
  if (!taskType) return null;
  const key = String(taskType).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return ({
    BAGGAGELOAD: [EQUIPMENT_TYPES.BAGGAGE_CART, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    BAGGAGEUNLOAD: [EQUIPMENT_TYPES.BAGGAGE_CART, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    CATERING: [EQUIPMENT_TYPES.CATERING_VEHICLE, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    REFUELING: [EQUIPMENT_TYPES.FUELING_EQUIPMENT, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    PUSHBACK: [EQUIPMENT_TYPES.TOW_TRACTOR, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    BOARDINGSUPPORT: [EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
  })[key];
}
