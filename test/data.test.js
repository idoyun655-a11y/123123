import test from 'node:test';
import assert from 'node:assert/strict';
import { INCHEON_AIRPORT_DATA, SOURCE_TYPES, flattenIncheonDataset } from '../src/data/index.js';

test('dataset contains all required object families', () => {
  for (const key of ['airports','terminals','concourses','runways','gates','checkInZones','securityZones','immigrationZones','baggageSystems','cargoFacilities','parkings','roads','facilities']) {
    assert.ok(Array.isArray(INCHEON_AIRPORT_DATA[key]), `${key} missing`);
  }
});

test('every dataset object has required identity and source fields', () => {
  for (const object of flattenIncheonDataset()) {
    assert.ok(object.id && object.name && object.type);
    assert.ok(Object.values(SOURCE_TYPES).includes(object.sourceType));
  }
});

test('officially published airport-wide totals are represented as REAL', () => {
  const airport = INCHEON_AIRPORT_DATA.airports[0];
  assert.equal(airport.sourceType, SOURCE_TYPES.REAL);
  assert.equal(airport.capacity.passengersPerYear.value, 106000000);
  assert.equal(airport.capacity.flightsPerYear.value, 600000);
  assert.equal(airport.capacity.cargoTonsPerYear.value, 6300000);
});

test('unverified component-level values are not misclassified as REAL', () => {
  const runway1 = INCHEON_AIRPORT_DATA.runways.find((x) => x.id === 'RWY-1');
  assert.equal(runway1.sourceType, SOURCE_TYPES.ESTIMATED);
  assert.equal(INCHEON_AIRPORT_DATA.terminals.find((x) => x.id === 'T2').capacity, null);
});
