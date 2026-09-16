export const SCENARIOS = Object.freeze({ NORMAL: 'NORMAL', PEAK_SEASON: 'PEAK_SEASON', LOW_DEMAND: 'LOW_DEMAND', HEAVY_TRAFFIC: 'HEAVY_TRAFFIC', TERMINAL_DISRUPTION: 'TERMINAL_DISRUPTION' });

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneValue(v)]));
  return value;
}

export class ScenarioOverride {
  constructor({ name = SCENARIOS.NORMAL, overrides = {} } = {}) {
    if (!Object.values(SCENARIOS).includes(name)) throw new RangeError(`Unknown scenario: ${name}`);
    this.name = name;
    this.overrides = cloneValue(overrides);
    Object.freeze(this.overrides);
  }
  getOverride(dataId, baseValue) {
    return Object.prototype.hasOwnProperty.call(this.overrides, dataId) ? cloneValue(this.overrides[dataId]) : baseValue;
  }
  apply(base) {
    const result = { ...base };
    for (const [key, value] of Object.entries(this.overrides)) result[key] = cloneValue(value);
    return result;
  }
}

export const DEFAULT_SCENARIO_OVERRIDES = Object.freeze({
  [SCENARIOS.NORMAL]: Object.freeze({}),
  [SCENARIOS.PEAK_SEASON]: Object.freeze({ 'passenger.scenarioMultiplier': 1.15, 'flight.scenarioMultiplier': 1.08 }),
  [SCENARIOS.LOW_DEMAND]: Object.freeze({ 'passenger.scenarioMultiplier': 0.75, 'flight.scenarioMultiplier': 0.80 }),
  [SCENARIOS.HEAVY_TRAFFIC]: Object.freeze({ 'flight.scenarioMultiplier': 1.20 }),
  [SCENARIOS.TERMINAL_DISRUPTION]: Object.freeze({ 'terminal.capacityMultiplier': 0.70 }),
});

export function createScenario(name = SCENARIOS.NORMAL, overrides = DEFAULT_SCENARIO_OVERRIDES[name] ?? {}) {
  return new ScenarioOverride({ name, overrides });
}
