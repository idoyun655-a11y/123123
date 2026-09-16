import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationCore, SimulationStatus, SIMULATION_SPEEDS } from '../src/simulation/index.js';

const start = '2026-01-01T00:00:00.000Z';

test('supports all required simulation speeds', () => {
  assert.deepEqual(SIMULATION_SPEEDS, [1, 2, 5, 10, 30, 60]);
  for (const speed of SIMULATION_SPEEDS) {
    const sim = new SimulationCore({ startDate: start, speed });
    sim.resume();
    sim.tick(1000);
    assert.equal(sim.getSnapshot().currentTime.toISOString(), new Date(Date.parse(start) + speed * 1000).toISOString());
  }
});

test('pause prevents simulation time from advancing', () => {
  const sim = new SimulationCore({ startDate: start });
  sim.tick(1000);
  assert.equal(sim.getSnapshot().currentTime.toISOString(), start);
  sim.resume();
  sim.tick(1000);
  sim.pause();
  const pausedAt = sim.getSnapshot().currentTime.toISOString();
  sim.tick(5000);
  assert.equal(sim.getSnapshot().currentTime.toISOString(), pausedAt);
});

test('scheduled events run when their simulation time is reached', () => {
  const sim = new SimulationCore({ startDate: start, speed: 1 });
  const processed = [];
  sim.schedule({ at: '2026-01-01T00:00:02.000Z', type: 'test', handler: ({ event }) => processed.push(event.id) });
  sim.resume();
  sim.tick(1000);
  assert.deepEqual(processed, []);
  sim.tick(1000);
  assert.equal(processed.length, 1);
  assert.equal(sim.getSnapshot().processedEventCount, 1);
});

test('events are ordered by time, priority, then insertion order', () => {
  const sim = new SimulationCore({ startDate: start });
  const order = [];
  const handler = ({ event }) => order.push(event.payload);
  sim.schedule({ at: '2026-01-01T00:00:03.000Z', priority: 0, payload: 'later', handler, type: 'test' });
  sim.schedule({ at: '2026-01-01T00:00:01.000Z', priority: 10, payload: 'same-time-low-priority', handler, type: 'test' });
  sim.schedule({ at: '2026-01-01T00:00:01.000Z', priority: -1, payload: 'same-time-high-priority', handler, type: 'test' });
  sim.schedule({ at: '2026-01-01T00:00:01.000Z', priority: -1, payload: 'same-priority-second', handler, type: 'test' });
  sim.resume();
  sim.tick(3000);
  assert.deepEqual(order, [
    'same-time-high-priority',
    'same-priority-second',
    'same-time-low-priority',
    'later',
  ]);
});

test('changing speed is reflected in subsequent ticks', () => {
  const sim = new SimulationCore({ startDate: start });
  sim.resume();
  sim.setSpeed(10);
  sim.tick(500);
  assert.equal(sim.getSnapshot().currentTime.toISOString(), '2026-01-01T00:00:05.000Z');
  assert.equal(sim.getSnapshot().status, SimulationStatus.RUNNING);
});

test('invalid speed and tick delta are rejected', () => {
  assert.throws(() => new SimulationCore({ speed: 3 }), RangeError);
  const sim = new SimulationCore({ startDate: start });
  assert.throws(() => sim.tick(-1), TypeError);
  assert.throws(() => sim.tick(Number.NaN), TypeError);
});
