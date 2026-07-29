import type { WorkSchedule, WorkerAvailability, Employee, StaffingTarget, ShiftPreset } from '../services/scheduler';
import { isShiftActiveAtHour, hasSevenConsecutiveDays, getColorFromName, compareTimeStrings } from './dateUtils';

export interface AutoScheduleOptions {
  dateRange: string[];
  prioritizeFullTime: boolean;
  maxHoursPerShift: number;
  onlyFillDeficits: boolean;
}

export interface ProposedSchedule {
  availabilityId: string;
  employeeName: string;
  date: string;
  workplace: string;
  startTime: string;
  endTime: string;
  notes: string;
  workerNotes: string;
  managerNotes: string;
  color: string;
  coveredDeficitHoursCount: number;
}

export interface AutoScheduleResult {
  proposedSchedules: ProposedSchedule[];
  unassignedAvailabilitiesCount: number;
  totalNewConfirmedShifts: number;
  coveredDeficitHoursTotal: number;
}

export const generateAutoSchedule = (
  availabilities: WorkerAvailability[] = [],
  existingSchedules: WorkSchedule[] = [],
  employees: Employee[] = [],
  staffingTargets: StaffingTarget[] = [],
  analysisHoursRange: number[] = [],
  shiftPresets: ShiftPreset[] = [],
  options: AutoScheduleOptions
): AutoScheduleResult => {
  const safeAvailabilities = availabilities || [];
  const safeSchedules = existingSchedules || [];
  const safeEmployees = employees || [];
  const safeStaffingTargets = staffingTargets || [];
  const safeHoursRange = (analysisHoursRange && analysisHoursRange.length > 0)
    ? analysisHoursRange
    : Array.from({ length: 14 }, (_, i) => i + 6);
  const safeShiftPresets = shiftPresets || [];

  const { dateRange = [], prioritizeFullTime = true, maxHoursPerShift = 8, onlyFillDeficits = false } = options || {};

  const proposedSchedules: ProposedSchedule[] = [];
  let unassignedAvailabilitiesCount = 0;
  let coveredDeficitHoursTotal = 0;

  // Track assigned schedule dates per employee to check 7-consecutive-days rule dynamically
  const empAssignedDates: Record<string, Set<string>> = {};
  
  // Initialize empAssignedDates with existing schedules
  safeSchedules.forEach(s => {
    if (!s || !s.employeeName) return;
    const key = s.employeeName.trim().toLowerCase();
    if (!empAssignedDates[key]) {
      empAssignedDates[key] = new Set();
    }
    empAssignedDates[key].add(s.date);
  });

  // Track virtual active schedules during auto-scheduling
  const virtualSchedules: WorkSchedule[] = [...safeSchedules];

  const getStaffingTargetForHour = (hour: number, dateStr: string): number => {
    const dateMatch = safeStaffingTargets.find(t => t.hour === hour && t.date === dateStr);
    if (dateMatch) return dateMatch.targetCount;
    const globalMatch = safeStaffingTargets.find(t => t.hour === hour && !t.date);
    if (globalMatch) return globalMatch.targetCount;
    return 2;
  };

  // Sort dates chronologically
  const sortedDates = [...dateRange].sort();

  for (const dateStr of sortedDates) {
    // Unconfirmed availabilities for this date
    const dateAvails = safeAvailabilities.filter(
      a => a && a.date === dateStr && a.confirmed !== true && !(a.startTime === '00:00' && a.endTime === '00:00')
    );

    // Sort workers: Full-time first (if option enabled), then by earliest startTime
    const sortedAvails = [...dateAvails].sort((a, b) => {
      const empA = safeEmployees.find(e => e.name && e.name.trim().toLowerCase() === (a.employeeName || '').trim().toLowerCase());
      const empB = safeEmployees.find(e => e.name && e.name.trim().toLowerCase() === (b.employeeName || '').trim().toLowerCase());
      const isFTA = empA?.status === '正式夥伴';
      const isFTB = empB?.status === '正式夥伴';

      if (prioritizeFullTime && isFTA !== isFTB) {
        return isFTA ? -1 : 1;
      }

      return compareTimeStrings(a.startTime, b.startTime);
    });

    for (const avail of sortedAvails) {
      if (!avail || !avail.employeeName) continue;
      const empKey = avail.employeeName.trim().toLowerCase();
      
      // 1. Check if employee ALREADY has a schedule on this date (prevent over-assigning/double-booking)
      const empAlreadyScheduledToday = virtualSchedules.some(
        s => s && s.date === dateStr && s.employeeName && s.employeeName.trim().toLowerCase() === empKey
      );
      if (empAlreadyScheduledToday) {
        unassignedAvailabilitiesCount++;
        continue;
      }

      const currentEmpDates = Array.from(empAssignedDates[empKey] || new Set<string>());
      
      // 2. Labor Law check: 7 consecutive days limit
      const prospectiveDates = Array.from(new Set([...currentEmpDates, dateStr]));
      if (hasSevenConsecutiveDays(prospectiveDates)) {
        unassignedAvailabilitiesCount++;
        continue;
      }

      let rawStart = (avail.startTime && typeof avail.startTime === 'string') ? avail.startTime : '09:00';
      let rawEnd = (avail.endTime && typeof avail.endTime === 'string') ? avail.endTime : '17:00';
      if (!rawStart.includes(':')) rawStart = '09:00';
      if (!rawEnd.includes(':')) rawEnd = '17:00';

      const emp = safeEmployees.find(e => e.name && e.name.trim().toLowerCase() === empKey);
      const isFT = emp?.status === '正式夥伴';

      const [sH, sM] = rawStart.split(':').map(Number);
      const [eH, eM] = rawEnd.split(':').map(Number);
      const availStartMin = (sH || 0) * 60 + (sM || 0);
      let availEndMin = (eH || 0) * 60 + (eM || 0);
      if (availEndMin < availStartMin) availEndMin += 24 * 60;

      const daySchedules = virtualSchedules.filter(s => s && s.date === dateStr);

      const evaluateShiftDeficit = (candStart: string, candEnd: string): number => {
        let deficitCount = 0;
        for (const hour of safeHoursRange) {
          if (isShiftActiveAtHour(candStart, candEnd, hour)) {
            const target = getStaffingTargetForHour(hour, dateStr);
            const currentCount = daySchedules.filter(
              s => s && s.startTime && s.endTime && isShiftActiveAtHour(s.startTime, s.endTime, hour)
            ).length;
            if (currentCount < target) {
              deficitCount++;
            }
          }
        }
        return deficitCount;
      };

      let bestStartTime = rawStart;
      let bestEndTime = rawEnd;
      let maxDeficitCovered = -1;

      // 3. Find optimal shift window (considering shift presets and sliding windows)
      if (isFT && safeShiftPresets.length > 0) {
        // Evaluate fitting shift presets
        const fittingPresets = safeShiftPresets.filter(
          p => p && p.startTime && p.endTime && p.startTime >= rawStart && p.endTime <= rawEnd
        );
        for (const preset of fittingPresets) {
          const score = evaluateShiftDeficit(preset.startTime, preset.endTime);
          if (score > maxDeficitCovered) {
            maxDeficitCovered = score;
            bestStartTime = preset.startTime;
            bestEndTime = preset.endTime;
          }
        }
      }

      // If no preset was selected or for part-time workers:
      if (maxDeficitCovered < 0) {
        const totalSpanHours = (availEndMin - availStartMin) / 60;

        if (totalSpanHours <= maxHoursPerShift) {
          bestStartTime = rawStart;
          bestEndTime = rawEnd;
          maxDeficitCovered = evaluateShiftDeficit(bestStartTime, bestEndTime);
        } else {
          // Slide a window of maxHoursPerShift in 30-min steps to find window covering MAX deficits
          const windowMinutes = maxHoursPerShift * 60;
          for (let curStart = availStartMin; curStart <= availEndMin - windowMinutes; curStart += 30) {
            const curEnd = curStart + windowMinutes;
            
            const startH = Math.floor(curStart / 60) % 24;
            const startM = curStart % 60;
            const endH = Math.floor(curEnd / 60) % 24;
            const endM = curEnd % 60;

            const candStartStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
            const candEndStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

            const score = evaluateShiftDeficit(candStartStr, candEndStr);
            if (score > maxDeficitCovered) {
              maxDeficitCovered = score;
              bestStartTime = candStartStr;
              bestEndTime = candEndStr;
            }
          }
        }
      }

      // If onlyFillDeficits is set and 0 deficit hours covered, skip this assignment to avoid over-assigning
      if (onlyFillDeficits && maxDeficitCovered <= 0) {
        unassignedAvailabilitiesCount++;
        continue;
      }

      const derivedColor = getColorFromName(avail.employeeName);
      const proposed: ProposedSchedule = {
        availabilityId: avail.id,
        employeeName: avail.employeeName.trim(),
        date: dateStr,
        workplace: avail.workplace || '咖啡吧檯',
        startTime: bestStartTime,
        endTime: bestEndTime,
        notes: avail.notes ? `智能自動帶入: ${avail.notes.trim()}` : '智能自動帶入排班',
        workerNotes: avail.notes ? avail.notes.trim() : '',
        managerNotes: '智能自動帶入',
        color: derivedColor,
        coveredDeficitHoursCount: Math.max(0, maxDeficitCovered)
      };

      proposedSchedules.push(proposed);
      coveredDeficitHoursTotal += Math.max(0, maxDeficitCovered);

      // Add to virtualSchedules and empAssignedDates for subsequent iteration checks
      if (!empAssignedDates[empKey]) {
        empAssignedDates[empKey] = new Set();
      }
      empAssignedDates[empKey].add(dateStr);

      virtualSchedules.push({
        id: `virtual-auto-${proposed.availabilityId}`,
        title: proposed.employeeName,
        employeeName: proposed.employeeName,
        date: proposed.date,
        workplace: proposed.workplace,
        startTime: proposed.startTime,
        endTime: proposed.endTime,
        color: proposed.color,
        createdAt: Date.now(),
        availabilityId: proposed.availabilityId
      });
    }
  }

  return {
    proposedSchedules,
    unassignedAvailabilitiesCount,
    totalNewConfirmedShifts: proposedSchedules.length,
    coveredDeficitHoursTotal
  };
};
