import { QueueEngine } from '../passengers/queue.js';
import { FACILITY_CONFIG, FACILITY_DATA_POLICY, FACILITY_SERVICE_ROLE } from './config.js';
import {
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  FACILITY_STATUSES,
  Facility,
  Equipment,
  MaintenanceTask,
  MAINTENANCE_STATUS,
  MAINTENANCE_TYPES,
} from './model.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const dateValue = (v) => new Date(v ?? Date.now());

export class FacilitySystem {
  constructor(simulation, {
    queueEngine = null,
    employeeSystem = null,
    baggageSystem = null,
    groundHandlingSystem = null,
    gateSystem = null,
    runwaySystem = null,
    config = FACILITY_CONFIG,
    random = Math.random,
  } = {}) {
    if (!simulation || typeof simulation.schedule !== 'function') throw new TypeError('SimulationCore-compatible instance is required.');
    this.simulation = simulation;
    this.queueEngine = queueEngine;
    this.employeeSystem = employeeSystem;
    this.baggageSystem = baggageSystem;
    this.groundHandlingSystem = groundHandlingSystem;
    this.gateSystem = gateSystem;
    this.runwaySystem = runwaySystem;
    this.config = config;
    this.random = random;
    this.facilities = new Map();
    this.equipment = new Map();
    this.maintenance = new Map();
    this.queueBindings = new Map();
    this.flightImpactLog = [];
    this.#seq = 0;
  }
  #seq;

  attachQueueEngine(queueEngine) { this.queueEngine = queueEngine; this.syncAllQueueCapacities(); return queueEngine; }
  attachEmployeeSystem(employeeSystem) { this.employeeSystem = employeeSystem; this.syncAllQueueCapacities(); return employeeSystem; }
  attachBaggageSystem(system) { this.baggageSystem = system; return system; }
  attachGroundHandlingSystem(system) { this.groundHandlingSystem = system; return system; }
  attachGateSystem(system) { this.gateSystem = system; return system; }
  attachRunwaySystem(system) { this.runwaySystem = system; return system; }

  addFacility(input) {
    const f = input instanceof Facility ? input : new Facility(input);
    if (this.facilities.has(f.facilityId)) throw new Error(`Facility already exists: ${f.facilityId}`);
    this.facilities.set(f.facilityId, f);
    this.#recalculateFacility(f.facilityId);
    return f;
  }
  addFacilities(list = []) { return list.map((x) => this.addFacility(x)); }
  getFacility(id) { return this.facilities.get(id) ?? null; }
  listFacilities() { return [...this.facilities.values()]; }

  addEquipment(input) {
    const e = input instanceof Equipment ? input : new Equipment(input);
    if (this.equipment.has(e.equipmentId)) throw new Error(`Equipment already exists: ${e.equipmentId}`);
    const f = this.facilities.get(e.facilityId);
    if (!f) throw new Error(`Unknown facility: ${e.facilityId}`);
    const d = this.config.equipmentDefaults[e.equipmentType] ?? this.config.equipmentDefaults.default;
    if (input?.reliability == null) e.reliability = d.reliability;
    if (input?.capacity == null) e.capacity = d.capacity;
    e.maintenanceIntervalHours = input?.maintenanceIntervalHours ?? d.maintenanceIntervalHours ?? this.config.maintenance.defaultIntervalHours;
    e.maintenanceIntervalDays = input?.maintenanceIntervalDays ?? null;
    this.equipment.set(e.equipmentId, e);
    f.addEquipment(e.equipmentId);
    this.#updateFailureProbability(e);
    this.#recalculateFacility(e.facilityId);
    this.#syncEquipmentImpact(e);
    return e;
  }
  addEquipments(list = []) { return list.map((x) => this.addEquipment(x)); }
  getEquipment(id) { return this.equipment.get(id) ?? null; }
  listEquipment() { return [...this.equipment.values()]; }
  getEquipmentForFacility(facilityId) { const f = this.getFacility(facilityId); return f ? f.equipmentIds.map((id) => this.getEquipment(id)).filter(Boolean) : []; }

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
    for (const [queueId, facilityId, equipmentTypes] of bindings) if (this.facilities.has(facilityId) && this.queueEngine?.getQueue(queueId)) this.bindQueue({ queueId, facilityId, equipmentTypes });
  }

  syncAllQueueCapacities() { for (const queueId of this.queueBindings.keys()) this.syncQueueCapacity(queueId); }

  syncQueueCapacity(queueId) {
    const binding = this.queueBindings.get(queueId);
    const q = this.queueEngine?.getQueue(queueId);
    if (!binding || !q) return null;
    const facility = this.getFacility(binding.facilityId);
    if (!facility) return null;
    const equipment = this.getEquipmentForFacility(binding.facilityId).filter((e) => !binding.equipmentTypes.length || binding.equipmentTypes.includes(e.equipmentType));
    const equipCap = equipment.length ? equipment.filter((e) => e.isAvailable()).reduce((s, e) => s + e.capacity, 0) : q.configuredServerCount;
    const base = binding.baseServerCount ?? q.configuredServerCount;
    const operationalFactor = this.getFacilityOperationalFactor(facility);
    const equipmentEfficiency = equipment.length ? weightedEfficiency(equipment) : 1;
    const staffCap = this.#staffCapacity(facility.facilityId, base);
    const effective = Math.max(0, Math.floor(Math.min(base, equipCap, staffCap) * operationalFactor));
    const serverCount = Math.max(0, effective);
    const rate = Math.max(binding.serviceRateMultiplierFloor, operationalFactor * equipmentEfficiency * this.#staffingFactor(staffCap, base));
    return this.queueEngine.updateServiceCapacity(queueId, { serverCount, serviceRateMultiplier: rate });
  }

  calculateFacilityCapacity(facilityId) {
    const f = this.#requireFacility(facilityId);
    const equipment = this.getEquipmentForFacility(facilityId);
    const available = equipment.filter((e) => e.isAvailable());
    const equipmentAvailability = equipment.length ? available.reduce((s, e) => s + e.capacity, 0) / Math.max(f.maxCapacity, 1) : 1;
    const equipmentEfficiency = equipment.length ? weightedEfficiency(available) : 1;
    const staffingFactor = this.#staffingFactor(this.#staffCapacity(facilityId, f.maxCapacity), f.maxCapacity);
    const operationalFactor = this.getFacilityOperationalFactor(f);
    const capacity = Math.max(0, Math.floor(f.maxCapacity * Math.min(1, equipmentAvailability) * equipmentEfficiency * staffingFactor * operationalFactor));
    return { baseCapacity: f.maxCapacity, equipmentAvailability: Math.min(1, equipmentAvailability), equipmentEfficiency, staffingFactor, operationalFactor, effectiveCapacity: capacity };
  }

  getFacilityOperationalFactor(facility) {
    if (![FACILITY_STATUSES.OPERATIONAL, FACILITY_STATUSES.DEGRADED, FACILITY_STATUSES.PARTIALLY_OPERATIONAL].includes(facility.operatingStatus)) return 0;
    const h = facility.health;
    if (h >= 80) return 1;
    if (h >= 50) return 0.85;
    if (h >= 20) return 0.6;
    return 0.15;
  }

  recordUtilization(facilityId, actualUsage) {
    const f = this.#requireFacility(facilityId);
    const cap = Math.max(1, f.availableCapacity);
    f.utilization = clamp(actualUsage / cap, 0, 1);
    for (const e of this.getEquipmentForFacility(facilityId)) e.utilization = f.utilization;
    return f.utilization;
  }

  updateEquipmentHealth(equipmentId, health, { at = this.simulation.getSnapshot().currentTime, hours = 0 } = {}) {
    const e = this.#requireEquipment(equipmentId);
    if (hours > 0) e.operatingHours += hours;
    e.setHealth(health);
    e.efficiency = this.efficiencyForHealth(e.health);
    this.#updateFailureProbability(e);
    this.#updateEquipmentStatusFromHealth(e);
    this.#recalculateFacility(e.facilityId);
    this.#syncEquipmentImpact(e);
    this.simulation.logger.info('EquipmentHealthChangedEvent', { equipmentId, health: e.health, at: dateValue(at).toISOString() });
    return e;
  }

  advanceOperatingHours(hours, { at = this.simulation.getSnapshot().currentTime } = {}) {
    if (!Number.isFinite(hours) || hours < 0) throw new RangeError('hours must be non-negative.');
    for (const e of this.equipment.values()) {
      if (![EQUIPMENT_STATUSES.OPERATIONAL, EQUIPMENT_STATUSES.DEGRADED].includes(e.status)) continue;
      e.operatingHours += hours;
      const utilizationMultiplier = 1 + e.utilization * this.config.health.utilizationDecayMultiplier;
      const decay = hours * this.config.health.decayPerOperatingHour * utilizationMultiplier;
      this.updateEquipmentHealth(e.equipmentId, e.health - decay, { at });
      if (this.isMaintenanceDue(e, at)) e.maintenanceDue = true;
    }
    this.evaluateFailures({ at });
  }

  efficiencyForHealth(health) { return this.config.health.efficiencyByHealth.find((row) => health >= row.minHealth)?.efficiency ?? 0.15; }

  isMaintenanceDue(equipment, at = this.simulation.getSnapshot().currentTime) {
    if (equipment.nextMaintenance && dateValue(at) >= equipment.nextMaintenance) return true;
    if (equipment.maintenanceIntervalHours && equipment.operatingHours >= equipment.maintenanceIntervalHours) return true;
    if (equipment.maintenanceIntervalDays && equipment.lastMaintenance) return dateValue(at).getTime() - equipment.lastMaintenance.getTime() >= equipment.maintenanceIntervalDays * 86400000;
    return equipment.maintenanceDue;
  }

  evaluateFailures({ at = this.simulation.getSnapshot().currentTime } = {}) {
    const now = dateValue(at);
    const events = [];
    for (const e of this.equipment.values()) {
      if (![EQUIPMENT_STATUSES.OPERATIONAL, EQUIPMENT_STATUSES.DEGRADED].includes(e.status)) continue;
      this.#updateFailureProbability(e);
      if (this.random() < e.failureProbability) events.push(this.failEquipment(e.equipmentId, { at: now, reason: 'probabilistic reliability model' }));
    }
    return events;
  }

  failEquipment(equipmentId, { at = this.simulation.getSnapshot().currentTime, reason = 'failure' } = {}) {
    const e = this.#requireEquipment(equipmentId);
    if (e.status === EQUIPMENT_STATUSES.FAILED) return e;
    e.status = EQUIPMENT_STATUSES.FAILED;
    e.failureCount += 1;
    e.failureReason = reason;
    e.failureStartedAt = dateValue(at);
    this.#recalculateFacility(e.facilityId);
    this.#syncEquipmentImpact(e);
    const maintenance = this.createCorrectiveMaintenance(equipmentId, { at });
    this.simulation.logger.info('EquipmentFailureEvent', { equipmentId, facilityId: e.facilityId, maintenanceId: maintenance.maintenanceId, at: dateValue(at).toISOString() });
    return e;
  }

  createMaintenance(input) {
    const e = this.#requireEquipment(input.equipmentId);
    const f = this.getFacility(input.facilityId ?? e.facilityId);
    const task = input instanceof MaintenanceTask ? input : new MaintenanceTask({
      ...input,
      facilityId: input.facilityId ?? e.facilityId,
      status: input.status ?? MAINTENANCE_STATUS.PENDING,
    });
    if (this.maintenance.has(task.maintenanceId)) throw new Error(`Maintenance task already exists: ${task.maintenanceId}`);
    this.maintenance.set(task.maintenanceId, task);
    e.maintenanceDue = task.maintenanceType !== MAINTENANCE_TYPES.CORRECTIVE ? e.maintenanceDue : false;
    if (f) f.maintenancePriority = Math.max(f.maintenancePriority, task.priority);
    if (task.scheduledAt) this.simulation.schedule({ at: task.scheduledAt, type: 'maintenance.scheduled', payload: { maintenanceId: task.maintenanceId }, handler: ({ event }) => this.startMaintenance(event.payload.maintenanceId, event.at) });
    return task;
  }

  createPreventiveMaintenance(equipmentId, { at = this.simulation.getSnapshot().currentTime, priority = 0 } = {}) {
    const id = `M-${++this.#seq}`;
    const e = this.#requireEquipment(equipmentId);
    return this.createMaintenance({ maintenanceId: id, equipmentId, facilityId: e.facilityId, maintenanceType: MAINTENANCE_TYPES.PREVENTIVE, priority, requiredStaff: this.config.maintenance.defaultRequiredStaff, duration: this.config.maintenance.preventiveMinutes, scheduledAt: dateValue(at), status: MAINTENANCE_STATUS.SCHEDULED });
  }

  createCorrectiveMaintenance(equipmentId, { at = this.simulation.getSnapshot().currentTime } = {}) {
    const id = `M-${++this.#seq}`;
    const e = this.#requireEquipment(equipmentId);
    const priority = this.calculateMaintenancePriority(equipmentId);
    return this.createMaintenance({ maintenanceId: id, equipmentId, facilityId: e.facilityId, maintenanceType: MAINTENANCE_TYPES.CORRECTIVE, priority, requiredStaff: this.config.maintenance.defaultRequiredStaff, duration: this.config.maintenance.correctiveMinutes, scheduledAt: dateValue(at), status: MAINTENANCE_STATUS.PENDING });
  }

  assignMaintenance(maintenanceId, employeeIds = []) {
    const t = this.#requireMaintenance(maintenanceId);
    t.assignEmployees(employeeIds);
    if (t.status === MAINTENANCE_STATUS.PENDING || t.status === MAINTENANCE_STATUS.DELAYED) this.startMaintenance(maintenanceId, this.simulation.getSnapshot().currentTime);
    return t;
  }

  autoAssignMaintenance(maintenanceId) {
    const t = this.#requireMaintenance(maintenanceId);
    if (!this.employeeSystem?.listEmployees) return t;
    const ids = this.employeeSystem.listEmployees().filter((e) => e.isOperational() && FACILITY_SERVICE_ROLE.maintenance.has(e.roleId) && (!e.currentFacilityId || e.currentFacilityId === t.facilityId)).sort((a, b) => (this.employeeSystem.effectiveProductivity(b.employeeId) ?? 0) - (this.employeeSystem.effectiveProductivity(a.employeeId) ?? 0)).slice(0, t.requiredStaff).map((e) => e.employeeId);
    if (ids.length) this.assignMaintenance(maintenanceId, ids);
    return t;
  }

  startMaintenance(maintenanceId, at = this.simulation.getSnapshot().currentTime) {
    const t = this.#requireMaintenance(maintenanceId);
    if ([MAINTENANCE_STATUS.COMPLETED, MAINTENANCE_STATUS.CANCELLED, MAINTENANCE_STATUS.IN_PROGRESS].includes(t.status)) return t;
    const e = this.#requireEquipment(t.equipmentId);
    if (!t.assignedEmployees.length && this.employeeSystem) return this.autoAssignMaintenance(maintenanceId);
    const staffingFactor = this.#maintenanceStaffingFactor(t);
    if (staffingFactor <= 0) { t.status = MAINTENANCE_STATUS.DELAYED; this.#scheduleMaintenanceRetry(t, at); return t; }
    e.status = EQUIPMENT_STATUSES.MAINTENANCE;
    t.status = staffingFactor < 1 ? MAINTENANCE_STATUS.DELAYED : MAINTENANCE_STATUS.IN_PROGRESS;
    t.startedAt = dateValue(at);
    const durationMinutes = t.duration / Math.max(staffingFactor, 0.01);
    this.simulation.schedule({ at: new Date(dateValue(at).getTime() + durationMinutes * 60000), type: 'maintenance.completed', payload: { maintenanceId }, handler: ({ event }) => this.completeMaintenance(maintenanceId, event.at) });
    this.#recalculateFacility(e.facilityId);
    this.#syncEquipmentImpact(e);
    this.simulation.logger.info('MaintenanceStartedEvent', { maintenanceId, equipmentId: t.equipmentId, at: t.startedAt.toISOString() });
    return t;
  }

  completeMaintenance(maintenanceId, at = this.simulation.getSnapshot().currentTime) {
    const t = this.#requireMaintenance(maintenanceId);
    const e = this.#requireEquipment(t.equipmentId);
    const before = t.startedAt ? Math.max(0, (dateValue(at) - t.startedAt) / 60000) : 0;
    t.completedAt = dateValue(at);
    t.status = MAINTENANCE_STATUS.COMPLETED;
    e.lastMaintenance = dateValue(at);
    e.maintenanceDue = false;
    e.operatingHours = Math.max(0, e.operatingHours * 0.25);
    e.setHealth(Math.max(e.health, 100));
    e.efficiency = 1;
    e.status = EQUIPMENT_STATUSES.OPERATIONAL;
    e.totalMaintenanceMinutes += before;
    if (e.failureStartedAt) e.downtimeMinutes += Math.max(0, (dateValue(at) - e.failureStartedAt) / 60000);
    e.failureStartedAt = null;
    e.nextMaintenance = new Date(dateValue(at).getTime() + (e.maintenanceIntervalHours ?? this.config.maintenance.defaultIntervalHours) * 3600000);
    this.#recalculateFacility(e.facilityId);
    this.#syncEquipmentImpact(e);
    this.#resumeBoundServices(e.facilityId);
    this.simulation.logger.info('MaintenanceCompletedEvent', { maintenanceId, equipmentId: e.equipmentId, at: t.completedAt.toISOString() });
    return t;
  }

  calculateMaintenancePriority(equipmentId) {
    const e = this.#requireEquipment(equipmentId);
    const f = this.#requireFacility(e.facilityId);
    const w = this.config.maintenance.priorityWeights;
    const safety = [EQUIPMENT_TYPES.SECURITY_LANE, EQUIPMENT_TYPES.XRAY_MACHINE, EQUIPMENT_TYPES.BOARDING_BRIDGE].includes(e.equipmentType) ? w.safetyWeight : 0;
    const operationalImpact = e.capacity * w.operationalImpact;
    const utilization = e.utilization * w.utilizationWeight;
    const severity = (1 - e.health / 100) * w.failureSeverity;
    const passenger = [EQUIPMENT_TYPES.CHECK_IN_COUNTER, EQUIPMENT_TYPES.SECURITY_LANE, EQUIPMENT_TYPES.ESCALATOR, EQUIPMENT_TYPES.ELEVATOR].includes(e.equipmentType) ? w.passengerImpact : 0;
    const flight = [EQUIPMENT_TYPES.BOARDING_BRIDGE, EQUIPMENT_TYPES.BAGGAGE_SORTER, EQUIPMENT_TYPES.TOW_TRACTOR, EQUIPMENT_TYPES.FUELING_EQUIPMENT].includes(e.equipmentType) ? w.flightImpact : 0;
    return Math.round((safety + operationalImpact + utilization + severity + passenger + flight + f.maintenancePriority) * 100) / 100;
  }

  getGroundEquipmentFactor(facilityId, taskType = null) {
    const equipment = this.getEquipmentForFacility(facilityId).filter((e) => e.isAvailable());
    if (!equipment.length) return 0;
    const relevant = taskType ? equipment.filter((e) => groundTypesForTask(taskType).includes(e.equipmentType)) : equipment;
    if (!relevant.length) return 1;
    return Math.min(1, relevant.reduce((s, e) => s + e.capacity * e.efficiency, 0) / Math.max(1, relevant.reduce((s, e) => s + e.capacity, 0)));
  }

  statistics() {
    const fs = this.listFacilities(); const es = this.listEquipment(); const ms = [...this.maintenance.values()];
    const avg = (items, fn) => items.length ? items.reduce((s, x) => s + fn(x), 0) / items.length : 0;
    return {
      facilities: {
        totalFacilities: fs.length,
        operationalFacilities: fs.filter((x) => x.operatingStatus === FACILITY_STATUSES.OPERATIONAL).length,
        degradedFacilities: fs.filter((x) => x.operatingStatus === FACILITY_STATUSES.DEGRADED || x.operatingStatus === FACILITY_STATUSES.PARTIALLY_OPERATIONAL).length,
        maintenanceFacilities: fs.filter((x) => x.operatingStatus === FACILITY_STATUSES.MAINTENANCE).length,
        failedFacilities: fs.filter((x) => x.operatingStatus === FACILITY_STATUSES.FAILED).length,
        closedFacilities: fs.filter((x) => x.operatingStatus === FACILITY_STATUSES.CLOSED).length,
      },
      equipment: {
        totalEquipment: es.length,
        operationalEquipment: es.filter((x) => x.status === EQUIPMENT_STATUSES.OPERATIONAL).length,
        degradedEquipment: es.filter((x) => x.status === EQUIPMENT_STATUSES.DEGRADED).length,
        maintenanceEquipment: es.filter((x) => x.status === EQUIPMENT_STATUSES.MAINTENANCE).length,
        failedEquipment: es.filter((x) => x.status === EQUIPMENT_STATUSES.FAILED).length,
        offlineEquipment: es.filter((x) => x.status === EQUIPMENT_STATUSES.OFFLINE).length,
        averageHealth: avg(es, (x) => x.health),
        averageUtilization: avg(es, (x) => x.utilization),
        failureCount: es.reduce((s, x) => s + x.failureCount, 0),
        maintenanceCount: ms.length,
        preventiveMaintenanceCount: ms.filter((x) => x.maintenanceType === MAINTENANCE_TYPES.PREVENTIVE).length,
        correctiveMaintenanceCount: ms.filter((x) => x.maintenanceType === MAINTENANCE_TYPES.CORRECTIVE).length,
        averageRepairTime: avg(es.filter((x) => x.failureCount && x.downtimeMinutes), (x) => x.downtimeMinutes),
        averageMaintenanceTime: avg(es.filter((x) => x.totalMaintenanceMinutes), (x) => x.totalMaintenanceMinutes),
      },
      maintenance: {
        pendingMaintenance: ms.filter((x) => x.status === MAINTENANCE_STATUS.PENDING).length,
        activeMaintenance: ms.filter((x) => x.status === MAINTENANCE_STATUS.IN_PROGRESS || x.status === MAINTENANCE_STATUS.DELAYED).length,
        completedMaintenance: ms.filter((x) => x.status === MAINTENANCE_STATUS.COMPLETED).length,
        delayedMaintenance: ms.filter((x) => x.status === MAINTENANCE_STATUS.DELAYED).length,
        maintenanceBacklog: ms.filter((x) => [MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.DELAYED].includes(x.status)).length,
        averageMaintenanceDuration: avg(ms.filter((x) => x.startedAt && x.completedAt), (x) => (x.completedAt - x.startedAt) / 60000),
        equipmentDowntime: es.reduce((s, x) => s + x.downtimeMinutes, 0),
        facilityDowntime: fs.reduce((s, f) => s + this.getEquipmentForFacility(f.facilityId).reduce((s2, e) => s2 + e.downtimeMinutes, 0), 0),
      },
      dataPolicy: FACILITY_DATA_POLICY,
    };
  }

  getFacilityStatus(facilityId) { const f = this.#requireFacility(facilityId); const c = this.calculateFacilityCapacity(facilityId); return { facilityId, health: f.health, utilization: f.utilization, availableCapacity: f.availableCapacity, effectiveCapacity: c.effectiveCapacity, operatingStatus: f.operatingStatus, maintenanceStatus: f.maintenanceStatus }; }
  getFailedEquipment() { return this.listEquipment().filter((e) => e.status === EQUIPMENT_STATUSES.FAILED); }
  getMaintenanceQueue() { return [...this.maintenance.values()].filter((x) => [MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.DELAYED, MAINTENANCE_STATUS.IN_PROGRESS].includes(x.status)).sort((a, b) => b.priority - a.priority); }

  #staffCapacity(facilityId, base) {
    if (!this.employeeSystem?.listEmployees) return base;
    const employees = this.employeeSystem.listEmployees().filter((e) => e.isOperational() && e.currentFacilityId === facilityId);
    if (!employees.length) return 0;
    return employees.reduce((s, e) => s + (this.employeeSystem.effectiveProductivity(e.employeeId) ?? 0), 0);
  }
  #staffingFactor(staffCap, base) { return base > 0 ? clamp(staffCap / base, 0, 1) : 1; }
  #maintenanceStaffingFactor(task) {
    if (!this.employeeSystem) return 1;
    const p = task.assignedEmployees.reduce((s, id) => s + (this.employeeSystem.effectiveProductivity(id) ?? 0), 0);
    return task.requiredStaff ? clamp(p / task.requiredStaff, 0, 2) : 1;
  }
  #scheduleMaintenanceRetry(task, at) { this.simulation.schedule({ at: new Date(dateValue(at).getTime() + 60000), type: 'maintenance.retry', payload: { maintenanceId: task.maintenanceId }, handler: ({ event }) => { this.autoAssignMaintenance(event.payload.maintenanceId); this.startMaintenance(event.payload.maintenanceId, event.at); } }); }
  #updateFailureProbability(e) {
    const r = this.config.reliability;
    const ageFactor = 1 + Math.max(0, e.age) * r.ageFactorPerYear;
    const utilizationFactor = 1 + e.utilization * r.utilizationFactor;
    const conditionFactor = 1 + (1 - e.condition / 100) * r.conditionFactor;
    const maintenanceFactor = e.maintenanceDue ? r.maintenanceFactor : 1;
    e.failureProbability = clamp(r.baseFailureRatePerHour * ageFactor * utilizationFactor * conditionFactor * maintenanceFactor * (1 / Math.max(0.1, e.reliability)), 0, 1);
    return e.failureProbability;
  }
  #updateEquipmentStatusFromHealth(e) {
    if (e.status === EQUIPMENT_STATUSES.MAINTENANCE || e.status === EQUIPMENT_STATUSES.OFFLINE || e.status === EQUIPMENT_STATUSES.RETIRED) return;
    if (e.health < this.config.health.failedThreshold) e.status = EQUIPMENT_STATUSES.FAILED;
    else if (e.health < this.config.health.degradedThreshold) e.status = EQUIPMENT_STATUSES.DEGRADED;
    else e.status = EQUIPMENT_STATUSES.OPERATIONAL;
  }
  #recalculateFacility(facilityId) {
    const f = this.#requireFacility(facilityId);
    const c = this.calculateFacilityCapacity(facilityId);
    f.availableCapacity = c.effectiveCapacity;
    const failed = this.getEquipmentForFacility(facilityId).filter((e) => e.status === EQUIPMENT_STATUSES.FAILED).length;
    if (f.operatingStatus === FACILITY_STATUSES.CLOSED) return f;
    if (f.maintenanceStatus === 'IN_PROGRESS') f.operatingStatus = FACILITY_STATUSES.MAINTENANCE;
    else if (f.health < this.config.health.failedThreshold || (this.getEquipmentForFacility(facilityId).length && c.effectiveCapacity === 0)) f.operatingStatus = FACILITY_STATUSES.FAILED;
    else if (failed || f.health < this.config.health.degradedThreshold || c.effectiveCapacity < f.maxCapacity) f.operatingStatus = c.effectiveCapacity < f.maxCapacity * 0.5 ? FACILITY_STATUSES.PARTIALLY_OPERATIONAL : FACILITY_STATUSES.DEGRADED;
    else f.operatingStatus = FACILITY_STATUSES.OPERATIONAL;
    this.simulation.logger.debug('FacilityCapacityChangedEvent', { facilityId, effectiveCapacity: c.effectiveCapacity });
    return f;
  }
  #syncEquipmentImpact(e) {
    const f = this.#recalculateFacility(e.facilityId);
    for (const queueId of this.queueBindings.keys()) this.syncQueueCapacity(queueId);
    if (e.equipmentType === EQUIPMENT_TYPES.BOARDING_BRIDGE) this.#syncGate(e);
    if (this.runwaySystem && (e.equipmentType === EQUIPMENT_TYPES.IT_SYSTEM || e.equipmentType === EQUIPMENT_TYPES.POWER_UNIT)) this.#syncRunway(e);
    if (this.baggageSystem && [EQUIPMENT_TYPES.BAGGAGE_SORTER, EQUIPMENT_TYPES.CONVEYOR, EQUIPMENT_TYPES.BAGGAGE_CART].includes(e.equipmentType)) this.baggageSystem.syncFacilityCapacity?.(e.facilityId, f.availableCapacity);
    if (this.groundHandlingSystem) this.groundHandlingSystem.syncFacilityCapacity?.(e.facilityId);
    return f;
  }
  #syncGate(e) {
    const gateId = e.facilityId.startsWith('GATE_') ? e.facilityId.slice(5) : e.facilityId;
    const gate = this.gateSystem?.getGate?.(gateId);
    if (!gate) return;
    if (e.status === EQUIPMENT_STATUSES.FAILED || e.status === EQUIPMENT_STATUSES.MAINTENANCE) gate.status = 'BLOCKED';
    else if (gate.status === 'BLOCKED') gate.status = 'AVAILABLE';
  }
  #syncRunway(e) {
    const runwayId = e.facilityId.startsWith('RUNWAY_') ? e.facilityId.slice(7) : e.facilityId;
    const runway = this.runwaySystem?.getRunway?.(runwayId);
    if (!runway) return;
    if (e.status === EQUIPMENT_STATUSES.FAILED || e.status === EQUIPMENT_STATUSES.MAINTENANCE) { runway.status = 'MAINTENANCE'; runway.maintenanceStatus = 'IN_PROGRESS'; }
    else if (runway.status === 'MAINTENANCE') { runway.status = 'AVAILABLE'; runway.maintenanceStatus = 'NORMAL'; }
  }
  #resumeBoundServices(facilityId) { for (const [id, binding] of this.queueBindings) if (binding.facilityId === facilityId) this.syncQueueCapacity(id); }
  #requireFacility(id) { const f = this.facilities.get(id); if (!f) throw new Error(`Unknown facility: ${id}`); return f; }
  #requireEquipment(id) { const e = this.equipment.get(id); if (!e) throw new Error(`Unknown equipment: ${id}`); return e; }
  #requireMaintenance(id) { const t = this.maintenance.get(id); if (!t) throw new Error(`Unknown maintenance: ${id}`); return t; }
}

function weightedEfficiency(items) {
  if (!items.length) return 0;
  const capacity = items.reduce((s, e) => s + e.capacity, 0);
  return capacity ? items.reduce((s, e) => s + e.capacity * e.efficiency, 0) / capacity : 0;
}

function groundTypesForTask(taskType) {
  const map = {
    BAGGAGE_UNLOAD: [EQUIPMENT_TYPES.BAGGAGE_CART, EQUIPMENT_TYPES.CONVEYOR, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    BAGGAGE_LOAD: [EQUIPMENT_TYPES.BAGGAGE_CART, EQUIPMENT_TYPES.CONVEYOR, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    CATERING: [EQUIPMENT_TYPES.CATERING_VEHICLE, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    REFUELING: [EQUIPMENT_TYPES.FUELING_EQUIPMENT, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    PUSHBACK: [EQUIPMENT_TYPES.TOW_TRACTOR, EQUIPMENT_TYPES.POWER_UNIT],
    BOARDING_SUPPORT: [EQUIPMENT_TYPES.BOARDING_BRIDGE, EQUIPMENT_TYPES.BUS],
    PASSENGER_DISEMBARK: [EQUIPMENT_TYPES.BOARDING_BRIDGE, EQUIPMENT_TYPES.BUS],
  };
  return map[taskType] ?? Object.values(EQUIPMENT_TYPES);
}
