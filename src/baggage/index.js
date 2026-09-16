export { Baggage, BaggageScreeningResource, BAGGAGE_TYPES, BAGGAGE_STATUSES } from './model.js';
export { BAGGAGE_CONFIG, BAGGAGE_DATA_POLICY, BHS_SERVICE_TYPES } from './config.js';
import { BaggageHandlingSystem as BaseBaggageHandlingSystem } from './system.js';
import { BAGGAGE_STATUSES } from './model.js';

export class BaggageHandlingSystem extends BaseBaggageHandlingSystem {
  constructor(...args) { super(...args); this.#stabilizeQueues(); }
  getQueue(queueId) { return this.queueEngine.getQueue(queueId); }
  onPassengerCheckInCompleted(passenger, at = this.simulation.getSnapshot().currentTime) {
    const created = super.generateForPassenger(passenger, { at, count: 1 });
    for (const baggage of created) {
      baggage.transitionTo(BAGGAGE_STATUSES.BAGGAGE_DROP, { at, zone: `BAGGAGE_DROP_${passenger.terminalId ?? 'UNKNOWN'}` });
      const result = this.queueEngine.enqueue('BAGGAGE_DROP_QUEUE', baggage, { at, priority: baggage.priority });
      if (!result.accepted) baggage.markException(BAGGAGE_STATUSES.DELAYED, { at, reason: 'baggage drop queue capacity exceeded' });
    }
    return created;
  }
  attachEmployeeSystem(system) {
    const result = super.attachEmployeeSystem(system);
    const hasBaggageStaff = Boolean(system?.listEmployees?.().some((employee) => ['BaggageHandler', 'BaggageSupervisor', 'GroundHandler'].includes(employee.roleId)));
    if (!hasBaggageStaff) {
      const configured = { BAGGAGE_DROP_QUEUE: this.config.queues.drop.serverCount, BAGGAGE_SCREENING_QUEUE: this.config.queues.screening.serverCount, BAGGAGE_SORTING_QUEUE: this.config.queues.sorting.serverCount, BAGGAGE_TRANSFER_SORTING_QUEUE: this.config.queues.transferSorting.serverCount, BAGGAGE_LOADING_QUEUE: this.config.loading.serverCount, BAGGAGE_UNLOAD_QUEUE: this.config.unloading.serverCount };
      for (const [queueId, serverCount] of Object.entries(configured)) { const queue = this.queueEngine.getQueue(queueId); if (queue) { this.queueEngine.updateServiceCapacity(queueId, { serverCount, serviceRateMultiplier: 1 }); queue.serviceTime = queueId === 'BAGGAGE_UNLOAD_QUEUE' ? 2 : (queueId === 'BAGGAGE_LOADING_QUEUE' ? 2 : (queueId === 'BAGGAGE_SCREENING_QUEUE' ? 2 : 1)); } }
    }
    return result;
  }
  closeLoading(flightId, at) {
    const result = super.closeLoading(flightId, at);
    const flight = this.flights.get(flightId) ?? this._flightLookup?.(flightId);
    if (flight) {
      const now = at ? new Date(at) : this.simulation.getSnapshot().currentTime;
      const overdue = this.getBaggageForFlight(flightId).filter((b) => !b.loadedAt && b.deliveryDeadline && now > b.deliveryDeadline && ![BAGGAGE_STATUSES.MISROUTED, BAGGAGE_STATUSES.MISSING, BAGGAGE_STATUSES.DAMAGED].includes(b.currentStatus));
      if (overdue.length) {
        const delay = Math.max(...overdue.map((b) => Math.max(0, (now - b.deliveryDeadline) / 60000)));
        for (const baggage of overdue) if (baggage.currentStatus !== BAGGAGE_STATUSES.UNABLE_TO_LOAD) baggage.markException(BAGGAGE_STATUSES.UNABLE_TO_LOAD, { at: now, reason: 'baggage loading deadline' });
        flight.recordBaggageDelay?.(delay); flight.recordDelay?.(delay, { at: now, reason: 'baggage loading cutoff' });
      }
    }
    return result;
  }
  #stabilizeQueues() {
    const fixedTimes = { BAGGAGE_DROP_QUEUE: 1, BAGGAGE_SCREENING_QUEUE: 2, BAGGAGE_SORTING_QUEUE: 1, BAGGAGE_TRANSFER_SORTING_QUEUE: 1, BAGGAGE_LOADING_QUEUE: 2, BAGGAGE_UNLOAD_QUEUE: 2 };
    for (const [id, minutes] of Object.entries(fixedTimes)) { const q = this.queueEngine.getQueue(id); if (q) q.serviceTime = minutes; }
    const sorting = this.queueEngine.getQueue('BAGGAGE_SORTING_QUEUE');
    if (sorting?.processor && !sorting.processor.__stage9Wrapped) {
      const originalStart = sorting.processor.onStart;
      sorting.processor.onStart = (b, at) => { if (b.currentStatus === BAGGAGE_STATUSES.SCREENING) b.transitionTo(BAGGAGE_STATUSES.SORTING, { at, zone: `SORTING_${b.flightId}`, force: true }); else originalStart?.(b, at); };
      sorting.processor.__stage9Wrapped = true;
    }
    const transfer = this.queueEngine.getQueue('BAGGAGE_TRANSFER_SORTING_QUEUE');
    if (transfer?.processor && !transfer.processor.__stage9Wrapped) { const original = transfer.processor.onComplete; transfer.processor.onComplete = (b, at) => { original?.(b, at); if (b.currentStatus !== BAGGAGE_STATUSES.CONNECTING_FLIGHT) b.transitionTo(BAGGAGE_STATUSES.CONNECTING_FLIGHT, { at, zone: 'CONNECTING_FLIGHT', flow: 'TRANSFER', force: true }); }; transfer.processor.__stage9Wrapped = true; }
    const unload = this.queueEngine.getQueue('BAGGAGE_UNLOAD_QUEUE');
    if (unload?.processor && !unload.processor.__stage9Wrapped) { unload.processor.onComplete = (b, at) => { b.transitionTo(BAGGAGE_STATUSES.UNLOADING, { at, zone: 'BHS', flow: 'ARRIVAL', force: true }); b.transitionTo(BAGGAGE_STATUSES.TRANSFER_TO_BAGGAGE_CLAIM, { at, zone: 'BAGGAGE_CLAIM', flow: 'ARRIVAL', force: true }); b.transitionTo(BAGGAGE_STATUSES.BAGGAGE_CLAIM, { at, zone: 'BAGGAGE_CLAIM', flow: 'ARRIVAL', force: true }); this.simulation.schedule({ at: new Date(new Date(at).getTime() + 2 * 60000), type: 'baggage.claim.completed', payload: { baggageId: b.baggageId }, handler: ({ event }) => { const bag = this.getBaggage(event.payload.baggageId); if (bag) bag.transitionTo(BAGGAGE_STATUSES.CLAIMED, { at: event.at, zone: 'ARRIVAL_HALL', flow: 'ARRIVAL', force: true }); } }); }; unload.processor.__stage9Wrapped = true; }
  }
}
export { GroundTask, GroundResource, GROUND_TASK_STATUS, GROUND_TASK_TYPES, GROUND_RESOURCE_TYPES, GROUND_RESOURCE_STATUS } from '../ground/model.js';
export { GroundHandlingSystem } from '../ground/system.js';
