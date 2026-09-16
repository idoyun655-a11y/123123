export const LogLevel = Object.freeze({
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
});

export class SimulationLogger {
  #entries = [];
  #maxEntries;

  constructor({ maxEntries = 1000 } = {}) {
    this.#maxEntries = Math.max(1, Math.floor(maxEntries));
  }

  log(level, message, context = {}) {
    const entry = Object.freeze({
      timestamp: new Date(),
      level,
      message: String(message),
      context: { ...context },
    });

    this.#entries.push(entry);
    if (this.#entries.length > this.#maxEntries) this.#entries.shift();
    return entry;
  }

  debug(message, context) { return this.log(LogLevel.DEBUG, message, context); }
  info(message, context) { return this.log(LogLevel.INFO, message, context); }
  warn(message, context) { return this.log(LogLevel.WARN, message, context); }
  error(message, context) { return this.log(LogLevel.ERROR, message, context); }
  entries() { return [...this.#entries]; }
  clear() { this.#entries = []; }
}
