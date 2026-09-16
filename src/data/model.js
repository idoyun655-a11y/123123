export const SOURCE_TYPES = Object.freeze({ REAL: 'REAL', ESTIMATED: 'ESTIMATED', GAME: 'GAME' });
export const OPERATING_STATUSES = Object.freeze({ OPERATIONAL: 'OPERATIONAL', LIMITED: 'LIMITED', CLOSED: 'CLOSED', UNKNOWN: 'UNKNOWN' });
export const MAINTENANCE_STATUSES = Object.freeze({ NORMAL: 'NORMAL', SCHEDULED: 'SCHEDULED', IN_PROGRESS: 'IN_PROGRESS', UNKNOWN: 'UNKNOWN' });

export class AirportObject {
  constructor({ id, name, type, location = null, size = null, capacity = null, operatingStatus = OPERATING_STATUSES.UNKNOWN, maintenanceStatus = MAINTENANCE_STATUSES.UNKNOWN, sourceType = SOURCE_TYPES.ESTIMATED, source = null, notes = null, properties = {} }) {
    if (!id || !name || !type) throw new TypeError('id, name, and type are required.');
    if (!Object.values(SOURCE_TYPES).includes(sourceType)) throw new RangeError(`Invalid sourceType: ${sourceType}`);
    this.id = id;
    this.name = name;
    this.type = type;
    this.location = location;
    this.size = size;
    this.capacity = capacity;
    this.operatingStatus = operatingStatus;
    this.maintenanceStatus = maintenanceStatus;
    this.sourceType = sourceType;
    this.source = source;
    this.notes = notes;
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}

export const defineModel = (type) => (data) => new AirportObject({ ...data, type });

export const Models = Object.freeze({
  Airport: defineModel('Airport'),
  Terminal: defineModel('Terminal'),
  Concourse: defineModel('Concourse'),
  Runway: defineModel('Runway'),
  Gate: defineModel('Gate'),
  CheckInZone: defineModel('CheckInZone'),
  SecurityZone: defineModel('SecurityZone'),
  ImmigrationZone: defineModel('ImmigrationZone'),
  BaggageSystem: defineModel('BaggageSystem'),
  CargoFacility: defineModel('CargoFacility'),
  Parking: defineModel('Parking'),
  Road: defineModel('Road'),
  Facility: defineModel('Facility'),
});
