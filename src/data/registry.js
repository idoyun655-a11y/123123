import { DATA_SOURCE_TYPES, DataRecord } from './provenance.js';
import { validateDataRecord, validateRecords } from './validation.js';

export class DataRegistry {
  constructor({ version = 'airport-data-v1', records = [], datasets = {}, scenario = null } = {}) {
    this.version = version;
    this.records = new Map();
    this.datasets = new Map(Object.entries(datasets));
    this.scenario = scenario;
    this.cache = new Map();
    this.registerMany(records);
  }

  register(record) {
    const normalized = record instanceof DataRecord ? record : new DataRecord(record);
    if (this.records.has(normalized.dataId)) throw new Error(`Duplicate dataId: ${normalized.dataId}`);
    this.records.set(normalized.dataId, normalized);
    this.cache.clear();
    return normalized;
  }

  registerMany(records) { for (const record of records) this.register(record); return this; }
  has(dataId) { return this.records.has(dataId); }
  getRecord(dataId) { return this.records.get(dataId) ?? null; }

  get(dataId, { withMetadata = false } = {}) {
    const record = this.records.get(dataId);
    if (!record) return undefined;
    const value = this.scenario?.getOverride(dataId, record.value) ?? record.value;
    return withMetadata ? { ...record, value } : value;
  }

  getOrThrow(dataId, options = {}) {
    const value = this.get(dataId, options);
    if (value === undefined) throw new Error(`Unknown dataId: ${dataId}`);
    return value;
  }

  setDataset(key, value) { this.datasets.set(key, value); this.cache.clear(); return value; }
  getDataset(key) { return this.datasets.get(key); }
  list({ sourceType = null, category = null } = {}) {
    return [...this.records.values()].filter((record) => (!sourceType || record.sourceType === sourceType) && (!category || record.category === category));
  }
  listIds() { return [...this.records.keys()]; }

  validate() { return validateRecords([...this.records.values()], this); }
  validateRecord(dataId) { return validateDataRecord(this.getRecord(dataId), this); }

  switchVersion(snapshot) {
    if (!snapshot?.version) throw new TypeError('A versioned data snapshot is required.');
    this.version = snapshot.version;
    this.records.clear();
    this.datasets = new Map(Object.entries(snapshot.datasets ?? {}));
    this.registerMany(snapshot.records ?? []);
    return this.version;
  }

  snapshot() {
    return Object.freeze({ version: this.version, records: [...this.records.values()], datasets: Object.fromEntries(this.datasets.entries()) });
  }
}

export function registryFromSnapshot(snapshot) {
  return new DataRegistry({ version: snapshot.version, records: snapshot.records, datasets: snapshot.datasets });
}

export function createRegistry(records, options = {}) {
  return new DataRegistry({ ...options, records });
}

export const DEFAULT_DATA_VERSION = 'airport-data-v1';
export { DATA_SOURCE_TYPES };
