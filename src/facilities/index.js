export {
  FACILITY_TYPES,
  FACILITY_STATUSES,
  EQUIPMENT_TYPES,
  EQUIPMENT_STATUSES,
  MAINTENANCE_TYPES,
  MAINTENANCE_STATUS,
  Facility,
  Equipment,
  MaintenanceTask,
} from './model.js';
export { FACILITY_CONFIG, FACILITY_DATA_POLICY, FACILITY_SERVICE_ROLE } from './config.js';
import { FacilitySystem as BaseFacilitySystem } from './system.js';
import { Equipment, EQUIPMENT_STATUSES, EQUIPMENT_TYPES, FACILITY_STATUSES } from './model.js';

export class FacilitySystem extends BaseFacilitySystem {
  addEquipment(input) {
    const e = input instanceof Equipment ? input : new Equipment(input);
    if (this.equipment.has(e.equipmentId)) throw new Error(`Equipment already exists: ${e.equipmentId}`);
    const f = this.facilities.get(e.facilityId);
    if (!f) throw new Error(`Unknown facility: ${e.facilityId}`);
    const defaults = this.config.equipmentDefaults[e.equipmentType] ?? this.config.equipmentDefaults.default;
    if (input?.reliability == null) e.reliability = defaults.reliability;
    if (input?.capacity == null) e.capacity = defaults.capacity;
    e.efficiency = input?.efficiency == null ? this.efficiencyForHealth(e.health) : e.efficiency;
    e.maintenanceIntervalHours = input?.maintenanceIntervalHours ?? defaults.maintenanceIntervalHours ?? this.config.maintenance.defaultIntervalHours;
    e.maintenanceIntervalDays = input?.maintenanceIntervalDays ?? null;
    this.equipment.set(e.equipmentId, e);
    f.equipmentIds.push(e.equipmentId);
    e.failureProbability = failureProbability(e, this.config);

    const hasIntegrations = this.queueBindings.size || this.gateSystem || this.runwaySystem || this.baggageSystem || this.groundHandlingSystem;
    if (!hasIntegrations) {
      f.availableCapacity = Math.min(f.maxCapacity, Math.max(0, f.availableCapacity) + (e.isAvailable() ? e.capacity * e.efficiency : 0));
    } else {
      const cap = this.calculateFacilityCapacity(f.facilityId);
      f.availableCapacity = cap.effectiveCapacity;
      for (const queueId of this.queueBindings.keys()) this.syncQueueCapacity(queueId);
      syncSpecialEquipment(this, e);
    }
    return e;
  }

  addEquipments(list = []) { return list.map((x) => this.addEquipment(x)); }

  failEquipment(equipmentId, options = {}) {
    const e = super.failEquipment(equipmentId, options);
    this.#syncLightweightImpacts(e);
    return e;
  }

  completeMaintenance(maintenanceId, at) {
    const task = super.completeMaintenance(maintenanceId, at);
    const e = this.getEquipment(task.equipmentId);
    if (e) this.#syncLightweightImpacts(e);
    return task;
  }

  getGroundEquipmentFactor(facilityId, taskType = null) {
    const wanted = normalizeGroundEquipmentTypes(taskType);
    const all = this.getEquipmentForFacility(facilityId).filter((e) => !wanted || wanted.includes(e.equipmentType));
    if (!all.length) return 1;
    const total = all.reduce((s, e) => s + e.capacity, 0);
    const available = all.filter((e) => e.isAvailable()).reduce((s, e) => s + e.capacity * e.efficiency, 0);
    return Math.min(1, available / Math.max(1, total));
  }

  #syncLightweightImpacts(e) {
    const f = this.getFacility(e.facilityId);
    if (f) f.availableCapacity = recomputeAvailableCapacity(this, f);
    for (const queueId of this.queueBindings.keys()) {
      const binding = this.queueBindings.get(queueId);
      if (binding?.facilityId === e.facilityId) this.syncQueueCapacity(queueId);
    }
    syncSpecialEquipment(this, e);
  }
}

function recomputeAvailableCapacity(system, facility) {
  const available = system.getEquipmentForFacility(facility.facilityId)
    .filter((e) => e.isAvailable())
    .reduce((sum, e) => sum + e.capacity * e.efficiency, 0);
  if (!system.getEquipmentForFacility(facility.facilityId).length) return facility.maxCapacity;
  return Math.min(facility.maxCapacity, Math.max(0, Math.floor(available)));
}

function failureProbability(e, config) {
  const r = config.reliability;
  const ageFactor = 1 + Math.max(0, e.age) * r.ageFactorPerYear;
  const utilizationFactor = 1 + Math.max(0, e.utilization) * r.utilizationFactor;
  const conditionFactor = 1 + (1 - e.health / 100) * r.conditionFactor;
  const maintenanceFactor = e.maintenanceDue ? r.maintenanceFactor : 1;
  return Math.min(1, r.baseFailureRatePerHour * ageFactor * utilizationFactor * conditionFactor * maintenanceFactor * Math.max(0.01, 1 / Math.max(e.reliability, 0.01)));
}

function normalizeGroundEquipmentTypes(taskType) {
  if (!taskType) return null;
  const key = String(taskType).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const map = {
    BAGGAGELOAD: [EQUIPMENT_TYPES.BAGGAGE_CART, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    BAGGAGEUNLOAD: [EQUIPMENT_TYPES.BAGGAGE_CART, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    CATERING: [EQUIPMENT_TYPES.CATERING_VEHICLE, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    REFUELING: [EQUIPMENT_TYPES.FUELING_EQUIPMENT, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    PUSHBACK: [EQUIPMENT_TYPES.TOW_TRACTOR, EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
    BOARDINGSUPPORT: [EQUIPMENT_TYPES.GROUND_SUPPORT_EQUIPMENT],
  };
  return map[key] ?? undefined;
}

function syncSpecialEquipment(system, equipment) {
  if (equipment.equipmentType === EQUIPMENT_TYPES.BOARDING_BRIDGE && system.gateSystem) {
    const gateId = equipment.facilityId.startsWith('GATE_') ? equipment.facilityId.slice(5) : null;
    const gate = gateId ? system.gateSystem.getGate?.(gateId) : null;
    if (gate && equipment.status === EQUIPMENT_STATUSES.FAILED) gate.status = 'BLOCKED';
    if (gate && equipment.status === EQUIPMENT_STATUSES.OPERATIONAL && gate.status === 'BLOCKED') gate.status = 'AVAILABLE';
  }
  if (equipment.facilityId.startsWith('RUNWAY_') && system.runwaySystem) {
    const runwayId = equipment.facilityId.slice(7);
    const runway = system.runwaySystem.getRunway?.(runwayId);
    if (runway && equipment.status === EQUIPMENT_STATUSES.FAILED) runway.status = 'MAINTENANCE';
    if (runway && equipment.status === EQUIPMENT_STATUSES.OPERATIONAL && runway.status === 'MAINTENANCE') runway.status = 'AVAILABLE';
  }
}