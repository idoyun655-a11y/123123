export class OperationsCommandBus {
  constructor({ simulation, alertCenter, incidentSystem = null } = {}) { this.simulation = simulation; this.alertCenter = alertCenter; this.incidentSystem = incidentSystem; }
  execute(command, payload = {}) {
    switch (command) {
      case 'PauseSimulation': return this.simulation?.pause?.() ?? false;
      case 'ResumeSimulation': return this.simulation?.resume?.() ?? false;
      case 'SetSimulationSpeed': this.simulation?.setSpeed?.(payload.speed); return this.simulation?.getSnapshot?.();
      case 'AcknowledgeAlert': return this.alertCenter?.acknowledge?.(payload.alertId) ?? null;
      case 'ResolveAlert': return this.alertCenter?.resolve?.(payload.alertId) ?? null;
      case 'AcknowledgeIncident': return this.incidentSystem?.acknowledgeIncident?.(payload.incidentId) ?? null;
      case 'StartResponse': return this.incidentSystem?.acknowledgeIncident?.(payload.incidentId) ?? null;
      case 'AssignResponseTeam': return this.incidentSystem?.getIncident?.(payload.incidentId) ?? null;
      case 'ContainIncident': return this.incidentSystem?.resolveIncident?.(payload.incidentId) ?? null;
      case 'ResolveIncident': return this.incidentSystem?.resolveIncident?.(payload.incidentId) ?? null;
      case 'SelectFlight': case 'SelectGate': case 'SelectRunway': case 'SelectFacility': case 'SelectEquipment': case 'SelectIncident': return { type: command.replace('Select',''), id: payload.id ?? payload.incidentId };
      default: throw new Error(`Unsupported operations command: ${command}`);
    }
  }
}
