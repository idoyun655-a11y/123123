import { DATA_SOURCE_TYPES } from './provenance.js';

const URL_PATTERN = /^https?:\/\//i;

export function validateDataRecord(record, registry = null) {
  const errors = [];
  const warnings = [];
  if (!record?.dataId) errors.push('dataId is required');
  if (!record?.category) errors.push(`dataId ${record?.dataId ?? '<unknown>'}: category is required`);
  if (!record?.key) errors.push(`dataId ${record?.dataId ?? '<unknown>'}: key is required`);
  if (!Object.values(DATA_SOURCE_TYPES).includes(record?.sourceType)) errors.push(`dataId ${record?.dataId ?? '<unknown>'}: invalid sourceType`);
  if (record?.sourceType === DATA_SOURCE_TYPES.REAL) {
    if (!record.sourceName) errors.push(`REAL data ${record.dataId} requires sourceName`);
    if (!record.sourceUrl) errors.push(`REAL data ${record.dataId} requires sourceUrl`);
    if (record.sourceUrl && !URL_PATTERN.test(record.sourceUrl)) errors.push(`REAL data ${record.dataId} has invalid sourceUrl`);
    if (!record.sourceDate) warnings.push(`REAL data ${record.dataId} has no sourceDate`);
    if (!record.accessedDate) warnings.push(`REAL data ${record.dataId} has no accessedDate`);
  }
  if (record?.sourceType === DATA_SOURCE_TYPES.ESTIMATED && !record.notes) warnings.push(`ESTIMATED data ${record.dataId} should document its assumption`);
  if (record?.sourceType === DATA_SOURCE_TYPES.GAME && !record.notes) warnings.push(`GAME data ${record.dataId} should document its game assumption`);
  if (record?.sourceType === DATA_SOURCE_TYPES.DERIVED) {
    if (!record.dependencies?.length) errors.push(`DERIVED data ${record.dataId} requires dependencies`);
    if (registry) for (const dependency of record.dependencies ?? []) if (!registry.has(dependency)) errors.push(`DERIVED data ${record.dataId} references missing dependency ${dependency}`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function validateRecords(records, registry = null) {
  const seen = new Set();
  const errors = [];
  const warnings = [];
  for (const record of records) {
    if (seen.has(record.dataId)) errors.push(`Duplicate dataId: ${record.dataId}`);
    seen.add(record.dataId);
    const result = validateDataRecord(record, registry);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  return { ok: errors.length === 0, errors, warnings, count: records.length };
}

export function validateSourceTypeUsage(sourceType, { expected = null, field = null } = {}) {
  const errors = [];
  const warnings = [];
  if (expected && sourceType !== expected) {
    if (sourceType === DATA_SOURCE_TYPES.GAME && expected === DATA_SOURCE_TYPES.REAL) errors.push(`GAME value cannot be used as REAL for ${field ?? 'field'}`);
    else if (sourceType === DATA_SOURCE_TYPES.ESTIMATED && expected === DATA_SOURCE_TYPES.REAL) warnings.push(`ESTIMATED value is being used where REAL is expected for ${field ?? 'field'}`);
    else warnings.push(`Source type ${sourceType} differs from expected ${expected} for ${field ?? 'field'}`);
  }
  return { ok: errors.length === 0, errors, warnings };
}
