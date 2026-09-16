export class OperationsCommandBus {
  constructor({ simulation, alertCenter } = {}) { this.simulation = simulation; this.alertCenter = alertCenter; }
  execute(command, payload = {}) {
    switch (command) {
      case 'PauseSimulation': return this.simulation?.pause?.() ?? false;
      case 'ResumeSimulation': return this.simulation?.resume?.() ?? false;
      case 'SetSimulationSpeed': this.simulation?.setSpeed?.(payload.speed); return this.simulation?.getSnapshot?.();
      case 'AcknowledgeAlert': return this.alertCenter?.acknowledge?.(payload.alertId) ?? null;
      case 'ResolveAlert': return this.alertCenter?.resolve?.(payload.alertId) ?? null;
      case 'SelectFlight': case 'SelectGate': case 'SelectRunway': case 'SelectFacility': case 'SelectEquipment': return { type: command.replace('Select',''), id: payload.id };
      default: throw new Error(`Unsupported operations command: ${command}`);
    }
  }
}
