export class DataImporter {
  constructor({ name, load }) { if (!name || typeof load !== 'function') throw new TypeError('Importer name and load function are required.'); this.name = name; this.load = load; }
  async import(input, context = {}) { return this.load(input, context); }
}

export class JsonDataAdapter extends DataImporter {
  constructor() { super({ name: 'json', load: async (input) => typeof input === 'string' ? JSON.parse(input) : input }); }
}

export class CsvDataAdapter extends DataImporter {
  constructor() { super({ name: 'csv', load: async (input) => parseCsv(input) }); }
}

export class ApiDataAdapter extends DataImporter {
  constructor(fetcher = null) { super({ name: 'api', load: async (input) => { if (!fetcher) throw new Error('API adapter is interface-only until an explicit fetcher is provided.'); return fetcher(input); } }); }
}

export function normalizeImportedRecords(records, { createRecord, version = 'imported-v1' } = {}) {
  if (!Array.isArray(records)) throw new TypeError('Imported records must be an array.');
  return records.map((record) => createRecord ? createRecord({ ...record, version: record.version ?? version }) : record);
}

function parseCsv(input) {
  if (typeof input !== 'string') throw new TypeError('CSV input must be a string.');
  const lines = input.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(splitCsvLine(line).map((value, index) => [headers[index], value ?? ''])));
}

function splitCsvLine(line) {
  const result = []; let current = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { result.push(current); current = ''; }
    else current += char;
  }
  result.push(current);
  return result;
}
