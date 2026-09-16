export { Baggage, BaggageScreeningResource, BAGGAGE_TYPES, BAGGAGE_STATUSES } from './model.js';
export { BAGGAGE_CONFIG, BAGGAGE_DATA_POLICY, BHS_SERVICE_TYPES } from './config.js';
import { BaggageHandlingSystem as BaseBaggageHandlingSystem } from './system.js';
import { BAGGAGE_STATUSES } from './model.js';

export class BaggageHandlingSystem extends BaseBaggageHandlingSystem {
  constructor(...args) {
    super(...args);
    this.#stabilizeQueues();
  }
  getQueue(queueId) { return this.queueEngine.getQueue(queueId); }
  closeLoading(flightId, at) {
    const result = super.closeLoading(flightId, at);
    const flight = this.flights.get(flightId) ?? this._flightLookup?.(flightId);
    if (flight) {
      const now = at ? new Date(at) : this.simulation.getSnapshot().currentTime;
      const deadline = this.loadingDeadline(flight);
      if (deadline && now > deadline) {
        const overdue = this.getBaggageForFlight(flightId).filter((b) => !b.loadedAt && ![BAGGAGE_STATUSES.MISROUTED, BAGGAGE_STATUSES.MISSING, BAGGAGE_STATUSES.DAMAGED].includes(b.currentStatus));
        if (overdue.length) {
          const delay = Math.max(0, (now - deadline) / 60000);
          flight.recordBaggageDelay?.(delay);
          flight.recordDelay?.(delay, { at: now, reason: 'baggage loading cutoff' });
          this.simulation.logger.info('BaggageFlightDelayEvent', { flightId, delayMinutes: delay, at: now.toISOString() });
        }
      }
    }
    return result;
  }
  #stabilizeQueues() {
    const fixedTimes = {
      BAGGAGE_DROP_QUEUE: 1,
      BAGGAGE_SCREENING_QUEUE: 1,
      BAGGAGE_SORTING_QUEUE: 1,
      BAGGAGE_TRANSFER_SORTING_QUEUE: 1,
      BAGGAGE_LOADING_QUEUE: 1,
      BAGGAGE_UNLOAD_QUEUE: 2,
    };
    for (const [id, minutes] of Object.entries(fixedTimes)) {
      const q = this.queueEngine.getQueue(id);
      if (q) q.serviceTime = minutes;
    }
    const sorting = this.queueEngine.getQueue('BAGGAGE_SORTING_QUEUE');
    if (sorting?.processor && !sorting.processor.__stage9Wrapped) {
      const original = sorting.processor.onComplete;
      sorting.processor.onComplete = (b, at) => {
        original?.(b, at);
        if ([BAGGAGE_STATUSES.TRANSFER_TO_AIRCRAFT, BAGGAGE_STATUSES.CONNECTING_FLIGHT].includes(b.currentStatus) && !isQueued(this.queueEngine.getQueue('BAGGAGE_LOADING_QUEUE'), b.baggageId)) {
          this.queueEngine.enqueue('BAGGAGE_LOADING_QUEUE', b, { at, priority: b.priority });
        }
      };
      sorting.processor.__stage9Wrapped = true;
    }
    const transfer = this.queueEngine.getQueue('BAGGAGE_TRANSFER_SORTING_QUEUE');
    if (transfer?.processor && !transfer.processor.__stage9Wrapped) {
      const original = transfer.processor.onComplete;
      transfer.processor.onComplete = (b, at) => {
        original?.(b, at);
        if (b.currentStatus !== BAGGAGE_STATUSES.CONNECTING_FLIGHT) b.transitionTo(BAGGAGE_STATUSES.CONNECTING_FLIGHT, { at, zone: 'CONNECTING_FLIGHT', flow: 'TRANSFER', force: true });
      };
      transfer.processor.__stage9Wrapped = true;
    }
    const unload = this.queueEngine.getQueue('BAGGAGE_UNLOAD_QUEUE');
    if (unload?.processor && !unload.processor.__stage9Wrapped) {
      unload.processor.onComplete = (b, at) => {
        if (b.currentStatus === BAGGAGE_STATUSES.ARRIVAL || b.currentStatus === BAGGAGE_STATUSES.UNLOADING) b.transitionTo(BAGGAGE_STATUSES.UNLOADING, { at, zone: 'BHS', flow: 'ARRIVAL', force: true });
        b.transitionTo(BAGGAGE_STATUSES.TRANSFER_TO_BAGGAGE_CLAIM, { at, zone: 'BAGGAGE_CLAIM', flow: 'ARRIVAL', force: true });
        b.transitionTo(BAGGAGE_STATUSES.BAGGAGE_CLAIM, { at, zone: 'BAGGAGE_CLAIM', flow: 'ARRIVAL', force: true });
        this.simulation.schedule({ at: new Date(new Date(at).getTime() + 2 * 60000), type: 'baggage.claim.completed', payload: { baggageId: b.baggageId }, handler: ({ event }) => { const bag = this.getBaggage(event.payload.baggageId); if (bag) bag.transitionTo(BAGGAGE_STATUSES.CLAIMED, { at: event.at, zone: 'ARRIVAL_HALL', flow: 'ARRIVAL', force: true }); } });
      };
      unload.processor.__stage9Wrapped = true;
    }
  }
}

function isQueued(queue, baggageId) {
  if (!queue) return false;
  if (queue.waiting?.some((x) => x.passenger?.baggageId === baggageId)) return true;
  if (queue.active && [...queue.active.values()].some((x) => x.passenger?.baggageId === baggageId)) return true;
  return false;
}

export { GroundTask, GroundResource, GROUND_TASK_STATUS, GROUND_TASK_TYPES, GROUND_RESOURCE_TYPES, GROUND_RESOURCE_STATUS } from '../ground/model.js';
export { GroundHandlingSystem } from '../ground/system.js';
