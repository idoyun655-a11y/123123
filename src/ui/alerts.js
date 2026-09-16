export const ALERT_SEVERITY = Object.freeze({ INFO: 1, NOTICE: 2, WARNING: 3, CRITICAL: 4 });
export const ALERT_STATUS = Object.freeze({ NEW: 'NEW', ACKNOWLEDGED: 'ACKNOWLEDGED', RESOLVED: 'RESOLVED' });

export class AlertCenter {
  constructor() { this.alerts = new Map(); this.sequence = 0; }
  emit({ severity = 'INFO', category = 'OPERATIONS', title, message, sourceType = 'SYSTEM', sourceId = null, createdAt = new Date() }) {
    const alert = { alertId: `alert-${++this.sequence}`, severity, category, title, message, sourceType, sourceId, createdAt: new Date(createdAt), status: ALERT_STATUS.NEW, acknowledgedAt: null, resolvedAt: null, impact: 0 };
    this.alerts.set(alert.alertId, alert); return alert;
  }
  acknowledge(alertId, at = new Date()) { const a = this.alerts.get(alertId); if (!a) return null; a.status = ALERT_STATUS.ACKNOWLEDGED; a.acknowledgedAt = new Date(at); return a; }
  resolve(alertId, at = new Date()) { const a = this.alerts.get(alertId); if (!a) return null; a.status = ALERT_STATUS.RESOLVED; a.resolvedAt = new Date(at); return a; }
  list({ includeResolved = false } = {}) { return [...this.alerts.values()].filter(a => includeResolved || a.status !== ALERT_STATUS.RESOLVED).sort((a, b) => (ALERT_SEVERITY[b.severity] - ALERT_SEVERITY[a.severity]) || (b.createdAt - a.createdAt)); }
  ingestEvent(event) {
    const type = String(event?.type ?? event?.eventType ?? '').toUpperCase();
    const map = { FLIGHT_DELAY: ['WARNING','FLIGHT','Flight Delay'], GATE_CONFLICT: ['WARNING','GATE','Gate Conflict'], RUNWAY_QUEUE: ['NOTICE','RUNWAY','Runway Queue'], STAFFING_SHORTAGE: ['CRITICAL','STAFFING','Staffing Shortage'], EQUIPMENT_FAILURE: ['CRITICAL','FACILITY','Equipment Failure'], MAINTENANCE_OVERDUE: ['WARNING','MAINTENANCE','Maintenance Overdue'], BAGGAGE_DELAY: ['WARNING','BAGGAGE','Baggage Delay'], GROUND_TASK_DELAY: ['WARNING','GROUND','Ground Task Delay'], TURNAROUND_RISK: ['NOTICE','GROUND','Turnaround Risk'], PASSENGER_QUEUE_SURGE: ['WARNING','PASSENGER','Passenger Queue Surge'] };
    const rule = map[type]; if (!rule) return null;
    return this.emit({ severity: rule[0], category: rule[1], title: rule[2], message: event.message ?? `${rule[2]} detected`, sourceType: event.sourceType ?? type, sourceId: event.sourceId ?? null, createdAt: event.createdAt ?? new Date() });
  }
}
