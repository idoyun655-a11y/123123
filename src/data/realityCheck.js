export const CHECK_STATUS = Object.freeze({ PASS: 'PASS', WARNING: 'WARNING', ERROR: 'ERROR' });

function result(name, status, message, details = {}) { return { name, status, message, ...details }; }

export function runRealityCheck({ registry, airport = {}, terminals = [], gates = [], runways = [], flights = [], passengers = [], baggage = {}, employees = {}, facilities = [] } = {}) {
  const checks = [];
  const registryValidation = registry?.validate?.() ?? { ok: true, errors: [], warnings: [] };
  checks.push(result('data-validation', registryValidation.errors.length ? CHECK_STATUS.ERROR : registryValidation.warnings.length ? CHECK_STATUS.WARNING : CHECK_STATUS.PASS, registryValidation.errors.join('; ') || registryValidation.warnings.join('; ') || 'Data provenance validation passed.', { errors: registryValidation.errors, warnings: registryValidation.warnings }));

  const flightCount = Number(airport.annualFlights ?? 0);
  const passengerCount = Number(airport.annualPassengers ?? 0);
  checks.push(result('passenger-volume-consistency', flightCount === 0 && passengerCount > 0 ? CHECK_STATUS.ERROR : CHECK_STATUS.PASS, flightCount === 0 && passengerCount > 0 ? 'Passengers exist while annual flight volume is zero.' : 'Passenger and flight volume are not logically contradictory.'));

  const terminalCapacity = Number(airport.annualPassengerCapacity ?? 0);
  const hourlyPassengerRate = Number(airport.hourlyPassengerRate ?? 0);
  checks.push(result('terminal-capacity-consistency', terminalCapacity > 0 && hourlyPassengerRate > terminalCapacity / 365 * 2 ? CHECK_STATUS.WARNING : CHECK_STATUS.PASS, terminalCapacity > 0 && hourlyPassengerRate > terminalCapacity / 365 * 2 ? 'Hourly passenger generation is high relative to annual terminal capacity.' : 'Terminal capacity is consistent with the calibrated demand scale.'));

  const duplicateGateIds = findDuplicates(gates.map((gate) => gate.gateId ?? gate.id));
  const invalidTerminalGates = gates.filter((gate) => gate.terminalId && terminals.length && !terminals.some((terminal) => (terminal.terminalId ?? terminal.id) === gate.terminalId));
  checks.push(result('gate-capacity-consistency', duplicateGateIds.length || invalidTerminalGates.length ? CHECK_STATUS.ERROR : CHECK_STATUS.PASS, duplicateGateIds.length ? `Duplicate gate IDs: ${duplicateGateIds.join(', ')}` : invalidTerminalGates.length ? 'Gate references a missing terminal.' : 'Gate references are consistent.'));

  const duplicateRunways = findDuplicates(runways.map((runway) => runway.runwayId ?? runway.id));
  checks.push(result('runway-capacity-consistency', duplicateRunways.length ? CHECK_STATUS.ERROR : CHECK_STATUS.PASS, duplicateRunways.length ? `Duplicate runway IDs: ${duplicateRunways.join(', ')}` : 'Runway identifiers are consistent.'));

  const impossibleFlights = flights.filter((flight) => flight.status === 'LANDING_FORCED' && runways.every((runway) => ['CLOSED', 'MAINTENANCE'].includes(runway.status)));
  checks.push(result('flight-volume-consistency', impossibleFlights.length ? CHECK_STATUS.ERROR : CHECK_STATUS.PASS, impossibleFlights.length ? 'Forced landing exists while every runway is unavailable.' : 'Flight/runway state is not contradictory.'));

  const staffErrors = employees.requiredStaff != null && employees.maximumFacilityStaff != null && employees.requiredStaff > employees.maximumFacilityStaff;
  checks.push(result('employee-staffing-consistency', staffErrors ? CHECK_STATUS.ERROR : CHECK_STATUS.PASS, staffErrors ? 'Required staff exceeds maximum facility staff.' : 'Staffing limits are consistent.'));

  const baggageCapacity = Number(baggage.capacityPerHour ?? 0);
  const baggageDemand = Number(baggage.demandPerHour ?? 0);
  checks.push(result('baggage-throughput-consistency', baggageCapacity > 0 && baggageDemand > baggageCapacity ? CHECK_STATUS.WARNING : CHECK_STATUS.PASS, baggageCapacity > 0 && baggageDemand > baggageCapacity ? 'Baggage demand exceeds configured throughput; queueing should be expected.' : 'Baggage throughput is not over-subscribed.'));

  const facilityErrors = facilities.filter((facility) => Number(facility.requiredStaff) > Number(facility.maximumStaff)).length;
  checks.push(result('facility-capacity-consistency', facilityErrors ? CHECK_STATUS.ERROR : CHECK_STATUS.PASS, facilityErrors ? `${facilityErrors} facility configurations require more staff than available.` : 'Facility capacity/staff constraints are consistent.'));

  const errors = checks.filter((check) => check.status === CHECK_STATUS.ERROR);
  const warnings = checks.filter((check) => check.status === CHECK_STATUS.WARNING);
  return { status: errors.length ? CHECK_STATUS.ERROR : warnings.length ? CHECK_STATUS.WARNING : CHECK_STATUS.PASS, checks, summary: { pass: checks.length - errors.length - warnings.length, warning: warnings.length, error: errors.length } };
}

export function findDuplicates(values) {
  const seen = new Set(); const duplicates = new Set();
  for (const value of values.filter(Boolean)) { if (seen.has(value)) duplicates.add(value); else seen.add(value); }
  return [...duplicates];
}

export function detectImpossibleConfiguration(config) {
  const errors = [];
  if (config.flightCount === 0 && config.passengerCount > 0) errors.push('Flight count is zero while passenger count is positive.');
  if (config.terminalCapacity != null && config.passengerGenerationPerHour > config.terminalCapacity) errors.push('Passenger generation exceeds terminal capacity per hour.');
  if (config.requiredStaff != null && config.maximumFacilityStaff != null && config.requiredStaff > config.maximumFacilityStaff) errors.push('Required staff exceeds maximum facility staff.');
  if (config.runwayStatus === 'CLOSED' && config.forcedLanding) errors.push('A forced landing cannot be scheduled on a closed runway.');
  return { ok: errors.length === 0, errors };
}
