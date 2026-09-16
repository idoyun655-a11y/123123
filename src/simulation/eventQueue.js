/**
 * Ordered scheduled-event queue for the simulation core.
 * Ordering: simulation time -> priority -> insertion sequence.
 */
export class EventQueue {
  #events = [];
  #sequence = 0;

  schedule(event) {
    const normalized = {
      id: event.id,
      at: new Date(event.at),
      priority: Number.isFinite(event.priority) ? event.priority : 0,
      sequence: this.#sequence++,
      type: event.type ?? 'generic',
      payload: event.payload,
      handler: event.handler,
    };

    if (Number.isNaN(normalized.at.getTime())) throw new TypeError('Scheduled event time must be a valid Date or date string.');
    if (typeof normalized.handler !== 'function') throw new TypeError('Scheduled event handler must be a function.');

    this.#events.push(normalized);
    this.#events.sort(EventQueue.#compare);
    return normalized.id;
  }

  peek() { return this.#events[0] ?? null; }
  pop() { return this.#events.shift() ?? null; }

  drainDue(now) {
    const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const due = [];
    while (this.#events.length > 0 && this.#events[0].at.getTime() <= current) due.push(this.#events.shift());
    return due;
  }

  clear() { this.#events = []; }
  get size() { return this.#events.length; }

  snapshot() {
    return this.#events.map((event) => ({ id: event.id, at: new Date(event.at), priority: event.priority, type: event.type, payload: event.payload }));
  }

  static #compare(a, b) {
    const timeDelta = a.at.getTime() - b.at.getTime();
    if (timeDelta !== 0) return timeDelta;
    const priorityDelta = a.priority - b.priority;
    if (priorityDelta !== 0) return priorityDelta;
    return a.sequence - b.sequence;
  }
}
