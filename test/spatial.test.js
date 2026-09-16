import test from 'node:test';
import assert from 'node:assert/strict';
import { INCHEON_SPATIAL_MAP, MAP_UNITS, getSpatialObjects } from '../src/data/spatial.js';

test('spatial map has a stable local coordinate system and camera model', () => {
  assert.equal(MAP_UNITS.coordinateSystem, 'ICN_LOCAL_ESTIMATED');
  assert.equal(INCHEON_SPATIAL_MAP.map.units, 'm');
  assert.equal(INCHEON_SPATIAL_MAP.map.camera.panEnabled, true);
  assert.equal(INCHEON_SPATIAL_MAP.map.camera.zoomEnabled, true);
});

test('major airport facilities have spatial geometry', () => {
  const ids = new Set(INCHEON_SPATIAL_MAP.facilities.map((item) => item.id));
  for (const id of ['T1', 'T2', 'CONCOURSE_A', 'RWY-1', 'RWY-2', 'RWY-3', 'RWY-4', 'APRON_PASSENGER_T1', 'APRON_PASSENGER_T2']) {
    assert.equal(ids.has(id), true, `${id} is missing from spatial facilities`);
  }

  for (const item of INCHEON_SPATIAL_MAP.facilities) {
    assert.equal(item.sourceType, 'ESTIMATED');
    assert.equal(item.geometryType, 'rect');
    assert.ok(Number.isFinite(item.x));
    assert.ok(Number.isFinite(item.y));
    assert.ok(item.width > 0);
    assert.ok(item.height > 0);
  }
});

test('passenger and vehicle routes are represented as ordered polylines', () => {
  assert.equal(INCHEON_SPATIAL_MAP.passengerFlows.length, 4);
  assert.equal(INCHEON_SPATIAL_MAP.vehicleFlows.length, 3);

  for (const route of [...INCHEON_SPATIAL_MAP.passengerFlows, ...INCHEON_SPATIAL_MAP.vehicleFlows]) {
    assert.equal(route.geometryType, 'polyline');
    assert.ok(route.points.length >= 2);
    assert.equal(route.sourceType, 'ESTIMATED');
    for (const [x, y] of route.points) {
      assert.ok(Number.isFinite(x));
      assert.ok(Number.isFinite(y));
    }
  }
});

test('operational spatial links preserve major terminal relationships', () => {
  const relations = INCHEON_SPATIAL_MAP.operationalLinks.map((link) => `${link.from}:${link.relation}:${link.to}`);
  assert.ok(relations.includes('T1:AIRSIDE_ADJACENCY:APRON_PASSENGER_T1'));
  assert.ok(relations.includes('T2:AIRSIDE_ADJACENCY:APRON_PASSENGER_T2'));
  assert.ok(relations.includes('CONCOURSE_A:PASSENGER_TRANSFER:T1'));
});

test('spatial object collection is flattened without mutating source data', () => {
  const objects = getSpatialObjects();
  assert.equal(objects.length, INCHEON_SPATIAL_MAP.facilities.length + INCHEON_SPATIAL_MAP.gates.length + INCHEON_SPATIAL_MAP.passengerFlows.length + INCHEON_SPATIAL_MAP.vehicleFlows.length);
  assert.ok(Object.isFrozen(INCHEON_SPATIAL_MAP));
});
