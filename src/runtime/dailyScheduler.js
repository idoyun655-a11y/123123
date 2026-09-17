import { Flight } from '../flights/model.js';
import { EVENT_CATEGORIES } from './eventEngine.js';

export const RECURRENCE = Object.freeze({ DAILY: 'DAILY', WEEKLY: 'WEEKLY', CUSTOM: 'CUSTOM' });

export class DailyAirportScheduler {
  constructor({ runtime, profile = null } = {}) {
    if (!runtime) throw new TypeError('AirportRuntime is required.');
    this.runtime = runtime; this.profile = profile ?? { hours: Array.from({ length: 24 }, (_, hour) => ({ hour, passengerMultiplier: hour < 6 || hour >= 23 ? 0.55 : hour < 10 ? 0.9 : hour < 16 ? 1.15 : hour < 21 ? 1.35 : 0.85, flightMultiplier: hour < 6 || hour >= 23 ? 0.6 : hour < 10 ? 0.9 : hour < 16 ? 1.1 : hour < 21 ? 1.25 : 0.8, baggageMultiplier: 1 })) }; this.generatedDays = new Set(); this.scheduleIds = new Set(); this.sequence = 0;
  }
  generateDay(date = this.runtime.session.currentTime) {
    const day = new Date(date); day.setUTCHours(0, 0, 0, 0); const key = day.toISOString().slice(0, 10); if (this.generatedDays.has(key)) return { key, created: 0 };
    const baseFlights = this.runtime.config.dailyFlights ?? 96; const created = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const profile = this.profile.hours[hour]; const count = Math.max(1, Math.round((baseFlights / 24) * profile.flightMultiplier * (0.9 + this.runtime.rng() * 0.2)));
      for (let i = 0; i < count; i += 1) {
        const minute = Math.floor((i + 0.5) * (60 / count)); const departure = new Date(day.getTime() + hour * 3600000 + minute * 60000); const inbound = new Date(departure.getTime() - 70 * 60000);
        const passengerCount = Math.max(60, Math.round((this.runtime.config.passengersPerFlight ?? 130) * profile.passengerMultiplier * (0.9 + this.runtime.rng() * 0.2)));
        const flight = new Flight({ flightId: `SIM-${key.replaceAll('-', '')}-${++this.sequence}`, flightNumber: `IC${String(100 + (this.sequence % 800)).padStart(3, '0')}`, airline: this.runtime.config.airlines[this.sequence % this.runtime.config.airlines.length], aircraftType: this.runtime.config.aircraftTypes[this.sequence % this.runtime.config.aircraftTypes.length], origin: this.sequence % 2 ? 'NRT' : 'ICN', destination: this.sequence % 2 ? 'ICN' : 'LAX', scheduledArrival: inbound, estimatedArrival: inbound, scheduledDeparture: departure, estimatedDeparture: departure, passengerCount, cargoWeight: passengerCount * 35, turnaroundTime: 55, baggageCount: Math.round(passengerCount * 0.72), baggageCutoffMinutes: 30, gateRequirements: { requiresJetBridge: true } });
        this.runtime.flightSystem.addFlight(flight); created.push(flight.flightId);
      }
    }
    this.generatedDays.add(key); this.runtime.logEvent('DAILY_SCHEDULE_GENERATED', 'SCHEDULED', 'Scheduler', key, { flightCount: created.length });
    this.scheduleShiftEvents(day); this.scheduleMaintenanceEvents(day); return { key, created: created.length, flightIds: created };
  }
  scheduleShiftEvents(day) {
    for (const [shiftId, time] of [['DAY', 6], ['EVENING', 14], ['NIGHT', 22]]) {
      const at = new Date(day.getTime() + time * 3600000); this.runtime.employeeSystem.scheduleShift(shiftId, at); this.runtime.eventEngine.schedule({ eventType: 'SHIFT_START', category: EVENT_CATEGORIES.SCHEDULED, at, sourceType: 'Shift', sourceId: shiftId, payload: { shiftId } });
    }
  }
  scheduleMaintenanceEvents(day) {
    const tasks = typeof this.runtime.facilitySystem.listMaintenanceTasks === 'function' ? this.runtime.facilitySystem.listMaintenanceTasks() : [];
    for (const task of tasks) {
      const at = task.nextMaintenance ? new Date(task.nextMaintenance) : new Date(day.getTime() + 3 * 3600000);
      if (at >= day && at < new Date(day.getTime() + 86400000)) this.runtime.eventEngine.schedule({ eventType: 'MAINTENANCE_DUE', category: EVENT_CATEGORIES.SCHEDULED, at, sourceType: 'MaintenanceTask', sourceId: task.maintenanceId, payload: { maintenanceId: task.maintenanceId }, handler: () => this.runtime.facilitySystem.startMaintenance?.(task.maintenanceId) });
    }
  }
  ensureNextDay() { const now = this.runtime.session.currentTime; const next = new Date(now.getTime() + 86400000); next.setUTCHours(0, 0, 0, 0); return this.generateDay(next); }
}