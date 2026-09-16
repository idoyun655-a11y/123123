export { Baggage, BaggageScreeningResource, BAGGAGE_TYPES, BAGGAGE_STATUSES } from './model.js';
export { BAGGAGE_CONFIG, BAGGAGE_DATA_POLICY, BHS_SERVICE_TYPES } from './config.js';
import { BaggageHandlingSystem } from './system.js';
if (typeof BaggageHandlingSystem.prototype.getQueue !== 'function') Object.defineProperty(BaggageHandlingSystem.prototype, 'getQueue', { value(queueId) { return this.queueEngine.getQueue(queueId); } });
export { BaggageHandlingSystem };
export { GroundTask, GroundResource, GROUND_TASK_STATUS, GROUND_TASK_TYPES, GROUND_RESOURCE_TYPES, GROUND_RESOURCE_STATUS } from '../ground/model.js';
export { GroundHandlingSystem } from '../ground/system.js';
