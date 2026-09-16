export const QUEUE_DISCIPLINES = Object.freeze({ FIFO: 'FIFO', PRIORITY: 'PRIORITY' });

export class QueueEngine {
  #queues = new Map();
  #sequence = 0;
  constructor(simulation) { if (!simulation || typeof simulation.schedule !== 'function') throw new TypeError('A SimulationCore-compatible instance is required.'); this.simulation = simulation; }
  createQueue({ id, serviceType, serverCount = 1, capacity = Infinity, discipline = QUEUE_DISCIPLINES.FIFO, serviceTime = 1, processor = null, zone = null }) {
    if (!id || this.#queues.has(id)) throw new Error(`Queue already exists: ${id}`);
    if (!Number.isInteger(serverCount) || serverCount < 1) throw new RangeError('serverCount must be a positive integer.');
    if (!(capacity === Infinity || (Number.isInteger(capacity) && capacity >= 0))) throw new RangeError('capacity must be a non-negative integer or Infinity.');
    if (!Object.values(QUEUE_DISCIPLINES).includes(discipline)) throw new RangeError(`Invalid discipline: ${discipline}`);
    const queue = { id, serviceType, serverCount, capacity, discipline, serviceTime, processor, zone, waiting: [], active: new Map(), completed: 0, totalServiceMinutes: 0, totalWaitMinutes: 0, maxWaitMinutes: 0, sequence: 0 };
    this.#queues.set(id, queue); return id;
  }
  getQueue(id) { return this.#queues.get(id) ?? null; }
  listQueues() { return [...this.#queues.values()]; }
  enqueue(queueId, passenger, { at = this.simulation.getSnapshot().currentTime, priority = passenger.priority ?? 0 } = {}) {
    const q = this.#require(queueId); if (q.waiting.length + q.active.size >= q.capacity) return { accepted: false, reason: 'CAPACITY_EXCEEDED' };
    const entry = { id: `queue-entry-${++this.#sequence}`, passenger, priority, enteredAt: new Date(at), sequence: ++q.sequence };
    passenger.enterQueue(at); q.waiting.push(entry); this.#sort(q); this.#dispatch(q, at); return { accepted: true, entryId: entry.id };
  }
  stats(queueId) { const q = this.#require(queueId); const waits = q.waiting.map((e) => Math.max(0, (this.simulation.getSnapshot().currentTime - e.enteredAt) / 60000)); return { id: q.id, queueLength: q.waiting.length, activeServers: q.active.size, serverCount: q.serverCount, throughput: q.completed, averageWaitingTime: q.completed ? q.totalWaitMinutes / q.completed : 0, maximumWaitingTime: Math.max(q.maxWaitMinutes, ...waits, 0), averageProcessingTime: q.completed ? q.totalServiceMinutes / q.completed : 0, utilization: q.serverCount ? q.active.size / q.serverCount : 0 }; }
  #dispatch(q, at) {
    while (q.active.size < q.serverCount && q.waiting.length) {
      const entry = q.waiting.shift(); const start = new Date(at); entry.passenger.startProcessing(start); const wait = Math.max(0, (start - entry.enteredAt) / 60000); q.totalWaitMinutes += wait; q.maxWaitMinutes = Math.max(q.maxWaitMinutes, wait); q.active.set(entry.id, entry);
      let serviceMinutes; try { serviceMinutes = resolveServiceTime(q.serviceTime, entry.passenger); } catch (error) { q.active.delete(entry.id); q.waiting.unshift(entry); throw error; }
      const end = new Date(start.getTime() + serviceMinutes * 60000);
      this.simulation.schedule({ at: end, type: `queue.${q.serviceType}.complete`, payload: { queueId: q.id, entryId: entry.id }, handler: ({ event }) => this.#complete(q, event.payload.entryId, event.at) });
      if (q.processor) q.processor.onStart?.(entry.passenger, start);
    }
  }
  #complete(q, entryId, at) { const entry = q.active.get(entryId); if (!entry) return; q.active.delete(entryId); entry.passenger.finishProcessing(at); const minutes = Math.max(0, (entry.passenger.processingEndTime - entry.passenger.processingStartTime) / 60000); q.totalServiceMinutes += minutes; q.completed += 1; if (q.processor) q.processor.onComplete?.(entry.passenger, at); this.#dispatch(q, at); }
  #sort(q) { if (q.discipline === QUEUE_DISCIPLINES.PRIORITY) q.waiting.sort((a, b) => (b.priority - a.priority) || (a.sequence - b.sequence)); else q.waiting.sort((a, b) => a.sequence - b.sequence); }
  #require(id) { const q = this.#queues.get(id); if (!q) throw new Error(`Unknown queue: ${id}`); return q; }
}

function resolveServiceTime(spec, passenger) { if (typeof spec === 'function') return validateTime(spec(passenger)); if (Array.isArray(spec) && spec.length === 2) { const min = Number(spec[0]), max = Number(spec[1]); return validateTime(min + Math.random() * (max - min)); } return validateTime(spec); }
function validateTime(value) { if (!Number.isFinite(value) || value < 0) throw new RangeError('serviceTime must resolve to a non-negative finite number of minutes.'); return value; }
