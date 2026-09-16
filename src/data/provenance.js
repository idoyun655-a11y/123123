export const DATA_SOURCE_TYPES = Object.freeze({ REAL: 'REAL', ESTIMATED: 'ESTIMATED', GAME: 'GAME', DERIVED: 'DERIVED' });

export class DataRecord {
  constructor({ dataId, category, key, value, unit = null, sourceType, sourceName = null, sourceUrl = null, sourceDate = null, accessedDate = null, confidence = null, notes = null, version = 'unversioned', validFrom = null, validTo = null, dependencies = [] }) {
    if (!dataId || !category || !key) throw new TypeError('dataId, category, and key are required.');
    if (!Object.values(DATA_SOURCE_TYPES).includes(sourceType)) throw new RangeError(`Invalid sourceType: ${sourceType}`);
    this.dataId = dataId;
    this.category = category;
    this.key = key;
    this.value = value;
    this.unit = unit;
    this.sourceType = sourceType;
    this.sourceName = sourceName;
    this.sourceUrl = sourceUrl;
    this.sourceDate = sourceDate;
    this.accessedDate = accessedDate;
    this.confidence = confidence;
    this.notes = notes;
    this.version = version;
    this.validFrom = validFrom;
    this.validTo = validTo;
    this.dependencies = Object.freeze([...dependencies]);
    Object.freeze(this);
  }
}

export function createDataRecord(input) {
  return new DataRecord(input);
}

export function cloneDataRecord(record, patch = {}) {
  return new DataRecord({ ...record, ...patch });
}
