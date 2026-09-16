const upper = (v) => String(v ?? '').toUpperCase();
const countBy = (items, key) => items.reduce((m, x) => { const k = upper(x[key]); m[k] = (m[k] ?? 0) + 1; return m; }, {});

export function buildOperationsViewModel(query, alertCenter) {
  const state = query.simulationState();
  const flights = query.flights(); const gates = query.gates(); const runways = query.runways();
  const passengers = query.passengers(); const baggage = query.baggage(); const tasks = query.groundTasks();
  const employees = query.employees(); const facilities = query.facilities(); const equipment = query.equipment();
  const queues = query.queues();
  const kpi = query.kpis();
  return {
    state, kpi,
    flights: flights.slice(0, 250), gates: gates.slice(0, 500), runways, passengers: passengers.slice(0, 500),
    baggage: baggage.slice(0, 500), tasks: tasks.slice(0, 500), employees: employees.slice(0, 500),
    facilities, equipment: equipment.slice(0, 1000), queues,
    counts: { flightStatus: countBy(flights, 'status'), gateStatus: countBy(gates, 'status'), runwayStatus: countBy(runways, 'status'), equipmentStatus: countBy(equipment, 'status'), taskStatus: countBy(tasks, 'status') },
    alerts: alertCenter.list(),
    timestamp: Date.now()
  };
}

export function createTimeSeries() { return { passengerThroughput: [], averageQueue: [], flightDelay: [], baggageDelay: [], staffing: [], equipmentFailure: [] }; }
export function appendTimeSeries(series, vm, at = Date.now()) {
  const point = (value) => ({ at, value: Number.isFinite(value) ? value : 0 });
  series.passengerThroughput.push(point(vm.kpi.totalPassengers));
  series.averageQueue.push(point(vm.queues.reduce((n, q) => n + Number(q.waitingCount ?? q.length ?? 0), 0)));
  series.flightDelay.push(point(vm.kpi.delayedFlights)); series.baggageDelay.push(point(vm.baggage.filter(b => upper(b.status) === 'DELAYED').length));
  series.staffing.push(point(vm.kpi.employees)); series.equipmentFailure.push(point(vm.kpi.failedEquipment));
  for (const key of Object.keys(series)) if (series[key].length > 240) series[key].splice(0, series[key].length - 240);
  return series;
}
