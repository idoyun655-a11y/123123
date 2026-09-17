export const EVENT_CATEGORIES = Object.freeze({ SCHEDULED: 'SCHEDULED', OPERATIONAL: 'OPERATIONAL', DISRUPTION: 'DISRUPTION', SYSTEM: 'SYSTEM' });
export const EVENT_STATUSES = Object.freeze({ SCHEDULED: 'SCHEDULED', READY: 'READY', RUNNING: 'RUNNING', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED', FAILED: 'FAILED' });
export const EVENT_PRIORITIES = Object.freeze({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 });

export class OperationalEventEngine {
  constructor({ simulation, logger = simulation?.logger, historyLimit = 2000 } = {}) {
    if (!simulation?.schedule) throw new TypeError('SimulationCore is required.');
    this.simulation = simulation; this.logger = logger; this.historyLimit = historyLimit;
    this.events = new Map(); this.history = []; this.sequence = 0;
  }
  schedule({ eventType, category = EVENT_CATEGORIES.SYSTEM, at, sourceType = null, sourceId = null, priority = EVENT_PRIORITIES.NORMAL, payload = {}, handler = null } = {}) {
    const scheduledAt = new Date(at ?? this.simulation.getSnapshot().currentTime);
    if (Number.isNaN(scheduledAt.getTime())) throw new TypeError('Invalid scheduledAt.');
    const eventId = `op-${++this.sequence}`;
    const record = { eventId, eventType, category, createdAt: new Date(this.simulation.getSnapshot().currentTime), scheduledAt, sourceType, sourceId, priority, payload, status: EVENT_STATUSES.SCHEDULED, sequence: this.sequence };
    this.events.set(eventId, record);
    this.simulation.schedule({ at: scheduledAt, type: `ops.${eventType}`, priority, payload: { eventId }, handler: ({ event }) => this.#execute(event.payload.eventId, event.at, handler) });
    return eventId;
  }
  cancel(eventId) { const event = this.events.get(eventId); if (!event || [EVENT_STATUSES.COMPLETED, EVENT_STATUSES.CANCELLED, EVENT_STATUSES.FAILED].includes(event.status)) return false; event.status = EVENT_STATUSES.CANCELLED; this.#remember(event); return true; }
  get(eventId) { return this.events.get(eventId) ?? null; }
  list({ status = null, category = null } = {}) { return [...this.events.values()].filter(e => (!status || e.status === status) && (!category || e.category === category)); }
  recent(limit = 100) { return this.history.slice(-limit); }
  #execute(eventId, at, handler) {
    const record = this.events.get(eventId); if (!record || record.status === EVENT_STATUSES.CANCELLED) return;
    record.status = EVENT_STATUSES.RUNNING;
    try { handler?.({ event: record, simulationTime: new Date(at) }); record.status = EVENT_STATUSES.COMPLETED; this.logger?.info?.('OperationalEventCompleted', { eventId, eventType: record.eventType, at: new Date(at).toISOString() }); }
    catch (error) { record.status = EVENT_STATUSES.FAILED; record.error = error.message; this.logger?.error?.('OperationalEventFailed', { eventId, eventType: record.eventType, error: error.message }); throw error; }
    this.#remember(record);
  }
  #remember(record) { this.history.push({ ...record, payload: { ...record.payload } }); if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit); }
}
