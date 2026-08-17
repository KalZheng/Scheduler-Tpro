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
    let baseTarget = 2;
    const dateMatch = safeStaffingTargets.find(t => t.hour === hour && t.date === dateStr);
    if (dateMatch) {
      baseTarget = dateMatch.targetCount;
    } else {
      const globalMatch = safeStaffingTargets.find(t => t.hour === hour && !t.date);
      if (globalMatch) baseTarget = globalMatch.targetCount;
    }

    // Weekend (Saturday & Sunday) peak hours (10:00 - 15:00, hours 10-14) get +1 extra worker target
    if (dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      const dayOfWeek = d.getDay();
      if ((dayOfWeek === 0 || dayOfWeek === 6) && hour >= 10 && hour < 15) {
        baseTarget += 1;
      }
    }

    return baseTarget;
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

      const evaluateShiftDeficit = (candStart: string, candEnd: string): { usefulHours: number; openingSurplus: number; closingSurplus: number; midSurplus: number } => {
        let usefulHours = 0;
        let openingSurplus = 0; // 06:00 - 08:00
        let closingSurplus = 0; // 17:00 - 19:00
        let midSurplus = 0;     // 08:00 - 17:00

        for (const hour of safeHoursRange) {
          if (isShiftActiveAtHour(candStart, candEnd, hour)) {
            const target = getStaffingTargetForHour(hour, dateStr);
            const currentCount = daySchedules.filter(
              s => s && s.startTime && s.endTime && isShiftActiveAtHour(s.startTime, s.endTime, hour)
            ).length;
            if (currentCount < target) {
              usefulHours++;
            } else {
              if (hour < 8) {
                openingSurplus++;
              } else if (hour >= 17) {
                closingSurplus++;
              } else {
                midSurplus++;
              }
            }
          }
        }
        return { usefulHours, openingSurplus, closingSurplus, midSurplus };
      };

      let bestStartTime = rawStart;
      let bestEndTime = rawEnd;
      let maxScore = -9999;
      let bestUsefulHours = 0;

      // 3. Find optimal shift window (considering shift presets for FT, and min 4h / max 9h for PT)
      if (isFT && safeShiftPresets.length > 0) {
        // Evaluate fitting shift presets for full-time employees
        const fittingPresets = safeShiftPresets.filter(
          p => p && p.startTime && p.endTime && p.startTime >= rawStart && p.endTime <= rawEnd
        );
        for (const preset of fittingPresets) {
          const { usefulHours, openingSurplus, closingSurplus, midSurplus } = evaluateShiftDeficit(preset.startTime, preset.endTime);
          if (usefulHours > 0) {
            // Score: +15 per useful hour, -50 heavy penalty for opening/closing surplus, -1 light penalty for midday overlap
            const score = usefulHours * 15 - openingSurplus * 50 - closingSurplus * 50 - midSurplus * 1;
            if (score > maxScore) {
              maxScore = score;
              bestUsefulHours = usefulHours;
              bestStartTime = preset.startTime;
              bestEndTime = preset.endTime;
            }
          }
        }
      }

      // For Part-Time workers or if no FT preset scored positive:
      if (maxScore < 0) {
        const availSpanMinutes = availEndMin - availStartMin;

        // Bounded shift limits: Part-time workers minimum 4 hours (240 min), maximum 9 hours (540 min)
        const minShiftMinutes = isFT ? 6 * 60 : 4 * 60; // 4 hours min for part-time
        const maxShiftMinutes = Math.min(9 * 60, maxHoursPerShift * 60); // 9 hours max for part-time

        if (availSpanMinutes < minShiftMinutes) {
          // If available window is less than minimum 4 hours, cannot assign shift
          unassignedAvailabilitiesCount++;
          continue;
        }

        const maxDur = Math.min(maxShiftMinutes, availSpanMinutes);
        const minDur = Math.min(minShiftMinutes, maxDur);

        // Slide window with varying durations from minDur (4h) to maxDur (9h) in 30-min steps
        for (let dur = minDur; dur <= maxDur; dur += 30) {
          for (let curStart = availStartMin; curStart <= availEndMin - dur; curStart += 30) {
            const curEnd = curStart + dur;

            const startH = Math.floor(curStart / 60) % 24;
            const startM = curStart % 60;
            const endH = Math.floor(curEnd / 60) % 24;
            const endM = curEnd % 60;

            const candStartStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
            const candEndStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

            const { usefulHours, openingSurplus, closingSurplus, midSurplus } = evaluateShiftDeficit(candStartStr, candEndStr);

            if (usefulHours > 0) {
              const edgePenalty = onlyFillDeficits ? 75 : 50;
              // Score: +15 per useful hour, heavy penalty (-50/-75) for opening/closing over-staffing, light penalty (-1) for midday overlap
              const score = usefulHours * 15 - openingSurplus * edgePenalty - closingSurplus * edgePenalty - midSurplus * 1;

              if (score > maxScore) {
                maxScore = score;
                bestUsefulHours = usefulHours;
                bestStartTime = candStartStr;
                bestEndTime = candEndStr;
              }
            }
          }
        }
      }

      // STRICT CAP: Skip assignment if 0 useful hours covered or maxScore is negative
      if (bestUsefulHours <= 0 || maxScore < 0) {
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
        notes: avail.notes ? avail.notes.trim() : '',
        workerNotes: avail.notes ? avail.notes.trim() : '',
        managerNotes: '',
        color: derivedColor,
        coveredDeficitHoursCount: Math.max(0, bestUsefulHours)
      };

      proposedSchedules.push(proposed);
      coveredDeficitHoursTotal += Math.max(0, bestUsefulHours);

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
