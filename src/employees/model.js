export const EMPLOYEE_STATUSES = Object.freeze({ AVAILABLE: 'AVAILABLE', WORKING: 'WORKING', BREAK: 'BREAK', OFF_DUTY: 'OFF_DUTY', TRAINING: 'TRAINING', ABSENT: 'ABSENT', SICK: 'SICK', OVERTIME: 'OVERTIME', LEAVE: 'LEAVE', TERMINATED: 'TERMINATED' });
export const STAFFING_STRATEGIES = Object.freeze({ MANUAL: 'MANUAL', ASSISTED: 'ASSISTED', AUTOMATED: 'AUTOMATED' });
export const SHIFT_IDS = Object.freeze({ DAY: 'DAY', EVENING: 'EVENING', NIGHT: 'NIGHT' });
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const requireText = (value, name) => { if (!value) throw new TypeError(`${name} is required.`); return value; };
export class Employee {
  constructor({ employeeId, name, departmentId, roleId, skillLevel = 1, experience = 0, salary = 0, fatigue = 0, morale = 70, productivity = 1, attendance = 1, trainingLevel = 0, shiftId = null, status = EMPLOYEE_STATUSES.AVAILABLE, currentFacilityId = null, hireDate = null, overtimeMinutes = 0 } = {}) { this.employeeId = requireText(employeeId, 'employeeId'); this.name = name ?? `Employee ${employeeId}`; this.departmentId = requireText(departmentId, 'departmentId'); this.roleId = requireText(roleId, 'roleId'); this.skillLevel = clamp(skillLevel, 1, 5); this.experience = Math.max(0, Number(experience) || 0); this.salary = Math.max(0, Number(salary) || 0); this.fatigue = clamp(fatigue); this.morale = clamp(morale); this.productivity = Math.max(0, Number(productivity) || 0); this.attendance = clamp(attendance, 0, 1); this.trainingLevel = Math.max(0, Number(trainingLevel) || 0); this.shiftId = shiftId; this.status = status; this.currentFacilityId = currentFacilityId; this.hireDate = hireDate ? new Date(hireDate) : null; this.overtimeMinutes = Math.max(0, Number(overtimeMinutes) || 0); }
  isOperational() { return [EMPLOYEE_STATUSES.AVAILABLE, EMPLOYEE_STATUSES.WORKING, EMPLOYEE_STATUSES.OVERTIME].includes(this.status) && this.attendance > 0; }
  setStatus(status) { if (!Object.values(EMPLOYEE_STATUSES).includes(status)) throw new RangeError(`Invalid employee status: ${status}`); this.status = status; return status; }
  setFatigue(value) { this.fatigue = clamp(value); return this.fatigue; }
  setMorale(value) { this.morale = clamp(value); return this.morale; }
}
export class Department {
  constructor({ departmentId, name, requiredHeadcount = 0, minimumHeadcount = 0, targetHeadcount = requiredHeadcount, budget = 0, operatingStatus = 'OPERATIONAL', employeeIds = [] } = {}) { this.departmentId = requireText(departmentId, 'departmentId'); this.name = name ?? departmentId; this.employeeIds = [...new Set(employeeIds)]; this.requiredHeadcount = Math.max(0, Number(requiredHeadcount) || 0); this.minimumHeadcount = Math.max(0, Number(minimumHeadcount) || 0); this.targetHeadcount = Math.max(this.minimumHeadcount, Number(targetHeadcount) || 0); this.currentHeadcount = this.employeeIds.length; this.operatingStatus = operatingStatus; this.budget = Math.max(0, Number(budget) || 0); }
  addEmployee(id) { if (!this.employeeIds.includes(id)) this.employeeIds.push(id); this.currentHeadcount = this.employeeIds.length; }
  removeEmployee(id) { this.employeeIds = this.employeeIds.filter((x) => x !== id); this.currentHeadcount = this.employeeIds.length; }
}
export class Role {
  constructor({ roleId, departmentId, requiredSkill = 1, maxProductivity = 1, baseSalary = 0, overtimeRate = 1.5, allowedFacilities = [], queueServices = [], trainingRequirements = [] } = {}) { this.roleId = requireText(roleId, 'roleId'); this.departmentId = requireText(departmentId, 'departmentId'); this.requiredSkill = Math.min(5, Math.max(1, Number(requiredSkill) || 1)); this.maxProductivity = Math.max(0, Number(maxProductivity) || 0); this.baseSalary = Math.max(0, Number(baseSalary) || 0); this.overtimeRate = Math.max(0, Number(overtimeRate) || 0); this.allowedFacilities = [...allowedFacilities]; this.queueServices = [...queueServices]; this.trainingRequirements = [...trainingRequirements]; }
}
export class EmployeeAssignment {
  constructor({ assignmentId = null, employeeId, facilityId, serviceType, startTime = null, endTime = null, status = 'ACTIVE', subFacilityId = null } = {}) { this.assignmentId = assignmentId; this.employeeId = requireText(employeeId, 'employeeId'); this.facilityId = requireText(facilityId, 'facilityId'); this.serviceType = requireText(serviceType, 'serviceType'); this.startTime = startTime ? new Date(startTime) : null; this.endTime = endTime ? new Date(endTime) : null; this.status = status; this.subFacilityId = subFacilityId; }
}
export class Training {
  constructor({ trainingId, employeeId, type, duration = 0, cost = 0, skillGain = 0, productivityGain = 0, status = 'SCHEDULED' } = {}) { this.trainingId = requireText(trainingId, 'trainingId'); this.employeeId = requireText(employeeId, 'employeeId'); this.type = requireText(type, 'type'); this.duration = Math.max(0, Number(duration) || 0); this.cost = Math.max(0, Number(cost) || 0); this.skillGain = Math.max(0, Number(skillGain) || 0); this.productivityGain = Math.max(0, Number(productivityGain) || 0); this.status = status; }
}
export class Shift {
  constructor({ shiftId, name, startTime, endTime, duration = null, requiredStaff = 0, assignedEmployees = [], handoverMinutes = 0 } = {}) { this.shiftId = requireText(shiftId, 'shiftId'); this.name = name ?? shiftId; this.startTime = startTime; this.endTime = endTime; this.duration = duration ?? calculateDuration(startTime, endTime); this.requiredStaff = Math.max(0, Number(requiredStaff) || 0); this.assignedEmployees = [...new Set(assignedEmployees)]; this.handoverMinutes = Math.max(0, Number(handoverMinutes) || 0); }
}
function calculateDuration(start, end) { const parse = (x) => { const [h, m] = String(x).split(':').map(Number); return h * 60 + (m || 0); }; let d = parse(end) - parse(start); if (d <= 0) d += 1440; return d; }
