import { EventQueue } from './eventQueue.js';
import { SimulationLogger } from './logger.js';

export const SIMULATION_SPEEDS = Object.freeze([1, 2, 5, 10, 30, 60]);
export const SimulationStatus = Object.freeze({ PAUSED: 'paused', RUNNING: 'running' });

export class SimulationCore {
  constructor({
    startDate = '2026-01-01T00:00:00.000Z',
    speed = 1,
    logger = new SimulationLogger(),
  } = {}) {
    this.#validateSpeed(speed);
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) throw new TypeError('startDate must be a valid date.');

    this.state = {
      status: SimulationStatus.PAUSED,
      speed,
      currentTime: new Date(start),
      tickCount: 0,
      processedEventCount: 0,
    };
    this.eventQueue = new EventQueue();
    this.logger = logger;
    this.#eventId = 0;
    this.#lastTickRealDeltaMs = 0;

    this.logger.info('Simulation initialized', {
      simulationTime: this.state.currentTime.toISOString(),
      speed,
    });
  }

  #eventId;
  #lastTickRealDeltaMs;

  setSpeed(speed) {
    this.#validateSpeed(speed);
    this.state.speed = speed;
    this.logger.info('Simulation speed changed', { speed });
  }

  pause() {
    if (this.state.status === SimulationStatus.PAUSED) return false;
    this.state.status = SimulationStatus.PAUSED;
    this.logger.info('Simulation paused', { simulationTime: this.state.currentTime.toISOString() });
    return true;
  }

  resume() {
    if (this.state.status === SimulationStatus.RUNNING) return false;
    this.state.status = SimulationStatus.RUNNING;
    this.logger.info('Simulation resumed', { simulationTime: this.state.currentTime.toISOString() });
    return true;
  }

  schedule({ at, type, payload, priority = 0, handler }) {
    const id = `event-${++this.#eventId}`;
    this.eventQueue.schedule({ id, at, type, payload, priority, handler });
    this.logger.debug('Event scheduled', { id, type, at: new Date(at).toISOString(), priority });
    return id;
  }

  tick(realDeltaMs) {
    if (!Number.isFinite(realDeltaMs) || realDeltaMs < 0) {
      throw new TypeError('realDeltaMs must be a finite, non-negative number.');
    }

    this.#lastTickRealDeltaMs = realDeltaMs;
    if (this.state.status === SimulationStatus.PAUSED || realDeltaMs === 0) {
      return this.getSnapshot();
    }

    const simulationDeltaMs = realDeltaMs * this.state.speed;
    this.state.currentTime = new Date(this.state.currentTime.getTime() + simulationDeltaMs);
    this.state.tickCount += 1;

    const dueEvents = this.eventQueue.drainDue(this.state.currentTime);
    for (const event of dueEvents) {
      this.logger.info('Event processing started', {
        eventId: event.id,
        eventType: event.type,
        simulationTime: event.at.toISOString(),
      });
      event.handler({
        event,
        simulation: this,
        simulationTime: new Date(this.state.currentTime),
      });
      this.state.processedEventCount += 1;
      this.logger.info('Event processing completed', {
        eventId: event.id,
        eventType: event.type,
      });
    }

    return this.getSnapshot();
  }

  getSnapshot() {
    return Object.freeze({
      status: this.state.status,
      speed: this.state.speed,
      currentTime: new Date(this.state.currentTime),
      tickCount: this.state.tickCount,
      processedEventCount: this.state.processedEventCount,
      queuedEventCount: this.eventQueue.size,
      lastTickRealDeltaMs: this.#lastTickRealDeltaMs,
    });
  }

  #validateSpeed(speed) {
    if (!SIMULATION_SPEEDS.includes(speed)) {
      throw new RangeError(`Unsupported simulation speed: ${speed}.`);
    }
  }
}
