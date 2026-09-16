import { SIMULATION_SPEEDS } from '../simulation/core.js';

export const TIME_SCALE = Object.freeze({
  REAL_TIME: 'REAL_TIME',
  SIMULATION_TIME: 'SIMULATION_TIME',
  GAME_TIME: 'GAME_TIME',
});

export function simulationMilliseconds(realDeltaMs, speed) {
  if (!SIMULATION_SPEEDS.includes(speed)) throw new RangeError(`Unsupported simulation speed: ${speed}`);
  return realDeltaMs * speed;
}

export function realMilliseconds(simulationDeltaMs, speed) {
  if (!SIMULATION_SPEEDS.includes(speed)) throw new RangeError(`Unsupported simulation speed: ${speed}`);
  return simulationDeltaMs / speed;
}

export function timeScaleTable(realSeconds = 1) {
  return Object.fromEntries(SIMULATION_SPEEDS.map((speed) => [speed, { realSeconds, simulationSeconds: realSeconds * speed }]));
}

export function demandInvariantCheck({ annualDemand, scheduleHoursPerYear = 365 * 24, speed = 1, realDeltaMs = 1000 } = {}) {
  const hourlyDemand = annualDemand / scheduleHoursPerYear;
  const simulatedMs = simulationMilliseconds(realDeltaMs, speed);
  const realEquivalentHours = simulatedMs / 3_600_000;
  return { annualDemand, hourlyDemand, speed, realDeltaMs, simulatedMs, realEquivalentHours, expectedDemandForStep: hourlyDemand * realEquivalentHours };
}
