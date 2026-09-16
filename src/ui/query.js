const arrayOf = (value) => Array.isArray(value) ? value : [];
const valuesOf = (system, keys = []) => {
  for (const key of keys) {
    if (!system) continue;
    const value = typeof system[key] === 'function' ? system[key]() : system[key];
    if (Array.isArray(value)) return value;
    if (value instanceof Map) return [...value.values()];
    if (value && typeof value === 'object') return Object.values(value);
  }
  return [];
};

export class OperationsQuery {
  constructor({ simulation, systems = {}, dataRegistry = null } = {}) {
    this.simulation = simulation;
    this.systems = systems;
    this.dataRegistry = dataRegistry;
  }

  simulationState() { return this.simulation?.getSnapshot?.() ?? this.simulation?.state ?? { status: 'paused', speed: 1, currentTime: new Date(), queuedEventCount: 0 }; }
  flights() { return valuesOf(this.systems.flight, ['listFlights', 'getFlights', 'flights']); }
  gates() { return valuesOf(this.systems.gate, ['listGates', 'getGates', 'gates']); }
  runways() { return valuesOf(this.systems.runway, ['listRunways', 'getRunways', 'runways']); }
  passengers() { return valuesOf(this.systems.passenger, ['listPassengers', 'getPassengers', 'passengers']); }
  baggage() { return valuesOf(this.systems.baggage, ['listBaggage', 'getAllBaggage', 'baggage']); }
  groundTasks() { return valuesOf(this.systems.ground, ['listTasks', 'getTasks', 'tasks']); }
  employees() { return valuesOf(this.systems.employee, ['listEmployees', 'getEmployees', 'employees']); }
  facilities() { return valuesOf(this.systems.facility, ['listFacilities', 'getFacilities', 'facilities']); }
  equipment() { return valuesOf(this.systems.facility, ['listEquipment', 'getEquipment', 'equipment']); }
  maintenance() { return valuesOf(this.systems.facility, ['listMaintenanceTasks', 'getMaintenanceTasks', 'maintenanceTasks']); }
  queues() { return valuesOf(this.systems.queue, ['listQueues', 'getQueues', 'queues']); }

  kpis() {
    const flights = this.flights(); const passengers = this.passengers(); const bags = this.baggage();
    const tasks = this.groundTasks(); const employees = this.employees(); const facilities = this.facilities(); const equipment = this.equipment();
    const delayed = flights.filter(f => ['DELAYED', 'DELAY'].includes(String(f.status ?? f.state).toUpperCase())).length;
    const active = passengers.filter(p => !['COMPLETED', 'CLAIMED'].includes(String(p.status ?? '').toUpperCase())).length;
    const failed = equipment.filter(e => String(e.status ?? '').toUpperCase() === 'FAILED').length;
    const maintenance = this.maintenance().filter(m => !['COMPLETED', 'CANCELLED'].includes(String(m.status ?? '').toUpperCase())).length;
    return { activeFlights: flights.length, delayedFlights: delayed, totalPassengers: passengers.length, activePassengers: active,
      totalBaggage: bags.length, activeGroundTasks: tasks.filter(t => !['COMPLETED', 'CANCELLED'].includes(String(t.status ?? '').toUpperCase())).length,
      employees: employees.length, failedEquipment: failed, maintenanceQueue: maintenance,
      facilities: facilities.length, capacityLoss: facilities.reduce((n, f) => n + Math.max(0, Number(f.maxCapacity ?? f.capacity ?? 0) - Number(f.availableCapacity ?? f.capacity ?? 0)), 0) };
  }

  search(query) {
    const q = String(query ?? '').trim().toLowerCase(); if (!q) return [];
    const sources = [
      ['Flight', this.flights()], ['Gate', this.gates()], ['Runway', this.runways()], ['Passenger', this.passengers()],
      ['Baggage', this.baggage()], ['Employee', this.employees()], ['Facility', this.facilities()], ['Equipment', this.equipment()], ['Ground Task', this.groundTasks()]
    ];
    return sources.flatMap(([type, items]) => items.filter(item => JSON.stringify(item).toLowerCase().includes(q)).slice(0, 10).map(item => ({ type, item })));
  }

  metadata(key) { return this.dataRegistry?.get?.(key, { withMetadata: true }) ?? null; }
}

export const createOperationsQuery = (options) => new OperationsQuery(options);
