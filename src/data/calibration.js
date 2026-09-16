export function averagePerDay(annual) { return annual / 365; }
export function averagePerHour(annual) { return annual / (365 * 24); }
export function ratio(numerator, denominator) { if (!Number.isFinite(denominator) || denominator === 0) return null; return numerator / denominator; }

export function buildAirportCalibration({ annualPassengers, annualFlights, annualPassengerCapacity = null, annualFlightCapacity = null, gateResources = null, passengerApronStands = null, terminalCapacity = null }) {
  return {
    annualPassengers,
    annualFlights,
    passengersPerFlight: ratio(annualPassengers, annualFlights),
    hourlyPassengerRate: averagePerHour(annualPassengers),
    dailyPassengerRate: averagePerDay(annualPassengers),
    dailyFlightRate: averagePerDay(annualFlights),
    hourlyFlightRate: averagePerHour(annualFlights),
    annualPassengerCapacity,
    annualFlightCapacity,
    passengerCapacityUtilization: ratio(annualPassengers, annualPassengerCapacity),
    flightCapacityUtilization: ratio(annualFlights, annualFlightCapacity),
    gateResourceCount: gateResources,
    passengerApronStands,
    gateToApronRatio: ratio(gateResources, passengerApronStands),
    terminalCapacity,
  };
}

export function validateCapacityConsistency({ terminalCapacity, securityCapacity, checkInCapacity, baggageCapacity, gateCapacity, hourlyPassengerRate }) {
  const warnings = [];
  const errors = [];
  const capacities = [
    ['terminalCapacity', terminalCapacity], ['securityCapacity', securityCapacity], ['checkInCapacity', checkInCapacity], ['baggageCapacity', baggageCapacity], ['gateCapacity', gateCapacity],
  ].filter(([, value]) => Number.isFinite(value));
  if (Number.isFinite(terminalCapacity)) {
    for (const [name, value] of capacities) if (name !== 'terminalCapacity' && value > terminalCapacity * 24) warnings.push(`${name}=${value} is unusually high relative to annual/aggregate terminal capacity=${terminalCapacity}`);
  }
  if (Number.isFinite(hourlyPassengerRate)) {
    if (Number.isFinite(securityCapacity) && securityCapacity < hourlyPassengerRate * 0.1) warnings.push('Security capacity may be too low for the calibrated average hourly passenger rate.');
    if (Number.isFinite(checkInCapacity) && checkInCapacity < hourlyPassengerRate * 0.1) warnings.push('Check-in capacity may be too low for the calibrated average hourly passenger rate.');
  }
  for (const [name, value] of capacities) if (value < 0) errors.push(`${name} cannot be negative`);
  return { ok: errors.length === 0, errors, warnings };
}
