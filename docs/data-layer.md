# Incheon Airport Reality / Data Layer

## Data Classification

- **REAL**: only values directly verified from an official public source.
- **ESTIMATED**: values inferred or modeled from public information but not directly published as an operational value.
- **GAME**: simulation mechanics and balancing values with no claim of real ICN operation.
- **DERIVED**: arithmetic or transformation based on one or more verified records; dependencies are recorded.

## Data Source

Priority is given to Incheon International Airport Corporation official pages, official statistics and official public documents. Blog/community/game data is not accepted as REAL evidence.

## Data Definitions

`annualPassengers` means the airport's published arrival + departure passenger total for the selected year. `annualFlights` means published arrival + departure flight movements. Airport handling capacity is a capacity figure, not actual traffic.

## Units

Every centralized record carries a unit where a physical or rate unit exists: passengers/year, movements/year, tons/year, m, m², km, locations, passengers/hour, movements/hour, etc.

## Conversion Rules

Annual average per day = annual value / 365. Annual average per hour = annual value / (365 × 24). These are DERIVED averages and are not peak-day or peak-hour observations.

## Derived Values

2025 passenger-per-flight, daily passenger rate, hourly passenger rate, daily flight rate and hourly flight rate are derived only from the aligned 2025 ICN traffic totals.

## Assumptions

Passenger arrival distribution, queue service times, baggage probabilities/weights/cutoffs, ground task duration, employee productivity/salary/attendance and facility/equipment reliability are GAME or ESTIMATED unless an official source explicitly verifies them.

## Update Procedure

1. Add a new versioned record with source metadata.
2. Validate provenance.
3. Normalize into the master registry.
4. Run Reality Check.
5. Run all existing regression tests.
6. Promote only explicitly verified public values to REAL.

## Validation Rules

REAL requires `sourceName` and `sourceUrl`; a URL must be HTTP(S). DERIVED requires dependency IDs. Duplicate `dataId` values are rejected. GAME values cannot be silently presented as REAL. ESTIMATED values should include an assumption note.

## Versioning / Historical Data

Use version IDs such as `airport-data-2025-v1` and `airport-data-2026-v1`. Historical traffic and current facility capacity are intentionally separated so that actual traffic is not confused with design capacity.

## Time Scale

SimulationCore uses `simulationDelta = realDelta × speed`. Supported speeds are 1x, 2x, 5x, 10x, 30x and 60x. Changing speed changes elapsed simulation time per real second; it must not mutate the underlying annual demand calibration.

## Current Official Calibration Notes

The current official facility scale page reports 106 million annual passenger capacity, 600,000 annual flight-processing capacity and 6.3 million tons annual cargo capacity. The current page reports four runways: two 3,750×60 m, one 4,000×60 m and one 3,750×60 m. It reports 225 passenger apron locations and 60 cargo apron locations.

An older official facility document reports 236 passenger apron locations (163 current + 73 phase-4) and 100 million passenger capacity. Those values remain useful as a historical snapshot, not as the current 2026 master value. This is why versioning is required.

## Data Audit Findings

- Passenger arrival distribution: ESTIMATED.
- Passenger queue servers/service times: GAME.
- Baggage generation, weight, service times and cutoff: GAME.
- Ground handling durations/staffing: GAME.
- Employee salary/productivity/fatigue/attendance/staffing: GAME.
- Facility/equipment failure rate, MTBF-like reliability, maintenance intervals and repair durations: GAME.
- Spatial coordinates: ESTIMATED; they are abstract local coordinates, not official GIS/aeronautical coordinates.
- Individual gate geometry/capability: ESTIMATED; generated resources are not claimed as official individual gate inventory.
- Runway dimensions: REAL; runway processing times/priority weights remain GAME.

## Reality Rules

No private internal airport operating data, undisclosed maintenance statistics, actual air-traffic-control algorithms or unverified individual facility characteristics are represented as REAL.
