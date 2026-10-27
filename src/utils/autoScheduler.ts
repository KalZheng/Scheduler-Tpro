import type { WorkSchedule, WorkerAvailability, Employee, StaffingTarget, ShiftPreset, StaffingDemandConfig } from '../services/scheduler';
import { isShiftActiveAtHour, hasSevenConsecutiveDays, getColorFromName, compareTimeStrings } from './dateUtils';

export interface AutoScheduleOptions {
  dateRange: string[];
  prioritizeFullTime: boolean;
  maxHoursPerShift: number;
  onlyFillDeficits: boolean;
  operatingStartTime?: string;
  operatingEndTime?: string;
  staffingDemandConfig?: StaffingDemandConfig;
}

export interface PureAutoScheduleOptions {
  dateRange: string[];
  prioritizeFullTime?: boolean;
  maxHoursPerShift?: number;
  operatingStartTime?: string;
  operatingEndTime?: string;
  staffingDemandConfig?: StaffingDemandConfig;
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
  shiftType?: '開早班' | '收班班' | '中段班' | '自訂班';
  scheduleSource?: 'manual' | 'rule' | 'ai' | 'instant';
  reasoning?: string;
}

export interface AutoScheduleResult {
  proposedSchedules: ProposedSchedule[];
  unassignedAvailabilitiesCount: number;
  totalNewConfirmedShifts: number;
  coveredDeficitHoursTotal: number;
}

/**
 * Helper to convert "HH:MM" string to minutes from 00:00
 */
function timeToMinutes(t: string): number {
  if (!t || !t.includes(':')) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Helper to convert minutes from 00:00 back to "HH:MM"
 */
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

interface InternalAutoScheduleConfig {
  availabilities: WorkerAvailability[];
  existingSchedules: WorkSchedule[];
  employees: Employee[];
  shiftPresets: ShiftPreset[];
  ignoreConfirmedStatus: boolean;
  dateRange: string[];
  prioritizeFullTime?: boolean;
  maxHoursPerShift?: number;
  operatingStartTime?: string;
  operatingEndTime?: string;
  staffingDemandConfig?: StaffingDemandConfig;
}

/**
 * Internal core auto-scheduling engine:
 * 1. 開早保障 (Opening 30-min window, target openingStaffCount workers)
 * 2. 晚班與收班打烊保障 (Closing 30-min window, target closingStaffCount workers)
 * 3. 尖峰最忙時段與人數上限 (Weekday weekdayMaxStaff / Weekend weekendMaxStaff)
 * 4. 勞基法一例一休檢核 (No 7 consecutive work days, 4-9h bounds, fair rotation)
 * 5. 全整數工時保障 (All shifts in full hours; no 30-min fractional durations, e.g. 4.5h -> 4h)
 */
function runAutoScheduleEngine(config: InternalAutoScheduleConfig): AutoScheduleResult {
  const safeAvailabilities = config.availabilities || [];
  const safeSchedules = config.existingSchedules || [];
  const safeEmployees = config.employees || [];
  const safeShiftPresets = config.shiftPresets || [];
  const ignoreConfirmedStatus = config.ignoreConfirmedStatus || false;

  const {
    dateRange = [],
    prioritizeFullTime = true,
    maxHoursPerShift: _maxHoursPerShift = 8,
    operatingStartTime = '06:30',
    operatingEndTime = '18:00',
    staffingDemandConfig
  } = config;

  const weekdayMaxStaff = staffingDemandConfig?.weekdayMaxStaff ?? 2;
  const weekendMaxStaff = staffingDemandConfig?.weekendMaxStaff ?? 2;
  const openingStaffCount = staffingDemandConfig?.openingStaffCount ?? 1;
  const closingStaffCount = staffingDemandConfig?.closingStaffCount ?? 1;
  const operatingStartTimeWeekend = staffingDemandConfig?.operatingStartTimeWeekend || '06:30';
  const operatingEndTimeWeekend = staffingDemandConfig?.operatingEndTimeWeekend || '18:30';
  const peakStartTime = staffingDemandConfig?.peakStartTime || '11:30';
  const peakEndTime = staffingDemandConfig?.peakEndTime || '13:30';

  const proposedSchedules: ProposedSchedule[] = [];
  let unassignedAvailabilitiesCount = 0;
  let coveredDeficitHoursTotal = 0;

  // Track assigned schedule dates per employee for the 7-consecutive-days rule
  const empAssignedDates: Record<string, Set<string>> = {};
  // Track assigned shift counts per employee across this calculation for fair rotation
  const empShiftCounts: Record<string, number> = {};

  // Initialize tracking from existing confirmed schedules
  safeSchedules.forEach(s => {
    if (!s || !s.employeeName) return;
    const key = s.employeeName.trim().toLowerCase();
    if (!empAssignedDates[key]) {
      empAssignedDates[key] = new Set();
    }
    empAssignedDates[key].add(s.date);
    empShiftCounts[key] = (empShiftCounts[key] || 0) + 1;
  });

  // Track virtual active schedules during auto-scheduling
  const virtualSchedules: WorkSchedule[] = [...safeSchedules];

  // Helper: Get hourly staffing maximum cap (Rule 3)
  const getHourMaxCap = (_hour: number, isWeekend: boolean): number => {
    return isWeekend ? weekendMaxStaff : weekdayMaxStaff;
  };

  // Helper: Check if an hour falls within peak customer window
  const isPeakHour = (hour: number): boolean => {
    const peakStartM = timeToMinutes(peakStartTime);
    const peakEndM = timeToMinutes(peakEndTime);
    const hourStartM = hour * 60;
    const hourEndM = (hour + 1) * 60;
    return Math.max(peakStartM, hourStartM) < Math.min(peakEndM, hourEndM);
  };

  // Helper: Get target count for a given hour on dateStr
  const getStaffingTarget = (hour: number, _dateStr: string, isWeekend: boolean): number => {
    const dayOpenStart = isWeekend ? operatingStartTimeWeekend : operatingStartTime;
    const dayCloseEnd = isWeekend ? operatingEndTimeWeekend : operatingEndTime;
    const openH = Math.floor(timeToMinutes(dayOpenStart) / 60);
    const closeMins = timeToMinutes(dayCloseEnd);
    const closeH = Math.floor((closeMins - 1) / 60);

    if (hour < openH || hour > closeH) {
      return 0;
    }

    const maxCap = getHourMaxCap(hour, isWeekend);

    if (isPeakHour(hour)) {
      return maxCap;
    }

    if (hour === openH) {
      return Math.min(openingStaffCount, maxCap);
    }

    if (hour === closeH) {
      return Math.min(closingStaffCount, maxCap);
    }

    return Math.min(openingStaffCount, maxCap);
  };

  // Helper: Count active workers in a given hour on dateStr
  const getActiveWorkersInHour = (dateStr: string, hour: number): number => {
    return virtualSchedules.filter(
      s => s && s.date === dateStr && isShiftActiveAtHour(s.startTime, s.endTime, hour)
    ).length;
  };

  // Helper: Check if a candidate shift [candStart, candEnd] violates the hour cap
  const wouldExceedCap = (
    candStart: string,
    candEnd: string,
    dateStr: string,
    isWeekend: boolean
  ): boolean => {
    for (let h = 0; h < 24; h++) {
      if (isShiftActiveAtHour(candStart, candEnd, h)) {
        const current = getActiveWorkersInHour(dateStr, h);
        const cap = getHourMaxCap(h, isWeekend);
        if (current + 1 > cap) {
          return true;
        }
      }
    }
    return false;
  };

  // Helper: Count how many deficit hours [candStart, candEnd] covers
  const countCoveredDeficitHours = (
    candStart: string,
    candEnd: string,
    dateStr: string,
    isWeekend: boolean
  ): number => {
    let covered = 0;
    for (let h = 0; h < 24; h++) {
      if (isShiftActiveAtHour(candStart, candEnd, h)) {
        const current = getActiveWorkersInHour(dateStr, h);
        const target = getStaffingTarget(h, dateStr, isWeekend);
        if (current < target) {
          covered++;
        }
      }
    }
    return covered;
  };

  // Helper: Commit a proposed shift
  const commitShift = (
    avail: WorkerAvailability,
    startTime: string,
    endTime: string,
    shiftType: '開早班' | '收班班' | '中段班',
    reasoning: string,
    usefulHours: number
  ) => {
    const derivedColor = getColorFromName(avail.employeeName);
    const proposed: ProposedSchedule = {
      availabilityId: avail.id,
      employeeName: avail.employeeName.trim(),
      date: avail.date,
      workplace: avail.workplace || '咖啡吧檯',
      startTime,
      endTime,
      notes: '',
      workerNotes: avail.notes ? avail.notes.trim() : '',
      managerNotes: '',
      color: derivedColor,
      coveredDeficitHoursCount: usefulHours,
      shiftType,
      scheduleSource: 'rule',
      reasoning
    };

    proposedSchedules.push(proposed);
    coveredDeficitHoursTotal += usefulHours;

    const empKey = avail.employeeName.trim().toLowerCase();
    if (!empAssignedDates[empKey]) empAssignedDates[empKey] = new Set();
    empAssignedDates[empKey].add(avail.date);
    empShiftCounts[empKey] = (empShiftCounts[empKey] || 0) + 1;

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
      availabilityId: proposed.availabilityId,
      scheduleSource: 'rule',
      shiftType: proposed.shiftType
    });
  };

  // Helper: Check if worker can work on this date (not already scheduled, no consecutive 7 days)
  const canWorkerWorkOnDate = (empName: string, dateStr: string): boolean => {
    const empKey = empName.trim().toLowerCase();

    // Already scheduled on this date?
    const alreadyScheduled = virtualSchedules.some(
      s => s && s.date === dateStr && s.employeeName && s.employeeName.trim().toLowerCase() === empKey
    );
    if (alreadyScheduled) return false;

    // Consecutive 7 days check
    const currentDates = Array.from(empAssignedDates[empKey] || new Set<string>());
    const prospective = Array.from(new Set([...currentDates, dateStr]));
    if (hasSevenConsecutiveDays(prospective)) {
      return false;
    }

    return true;
  };

  // Sort dates chronologically
  const sortedDates = [...dateRange].sort();

  for (const dateStr of sortedDates) {
    const d = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = d.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    const dayOpenStart = isWeekend ? operatingStartTimeWeekend : operatingStartTime;
    const dayCloseEnd = isWeekend ? operatingEndTimeWeekend : operatingEndTime;
    const dayOpenStartMins = timeToMinutes(dayOpenStart);
    const dayCloseEndMins = timeToMinutes(dayCloseEnd);

    // In pure mode (ignoreConfirmedStatus = true), consider ALL active registered employee availabilities.
    // In live/incremental mode (ignoreConfirmedStatus = false), only consider unconfirmed ones.
    const dateAvails = safeAvailabilities.filter(a => {
      if (!a || a.date !== dateStr) return false;
      if (a.startTime === '00:00' && a.endTime === '00:00') return false; // off-day marker
      if (!ignoreConfirmedStatus && a.confirmed === true) return false;
      return true;
    });

    // Filter out workers who are inactive or already disqualified by 7-day rule
    const availablePool = dateAvails.filter(a => {
      const emp = safeEmployees.find(e => e.name && e.name.trim().toLowerCase() === (a.employeeName || '').trim().toLowerCase());
      if (emp && emp.active === false) return false;
      return canWorkerWorkOnDate(a.employeeName, dateStr);
    });

    let remainingAvails = [...availablePool];

    // =========================================================================
    // PHASE 1: 開早保障 (Opening 30-min window, target = openingStaffCount)
    // =========================================================================
    // Count active workers during the first 30 mins of the day
    const activeOpening = virtualSchedules.filter(
      s => s && s.date === dateStr && timeToMinutes(s.startTime) <= dayOpenStartMins && timeToMinutes(s.endTime) >= dayOpenStartMins + 30
    ).length;
    const openingTarget = openingStaffCount;
    const openingNeeded = Math.max(0, openingTarget - activeOpening);

    if (openingNeeded > 0) {
      // Find candidates who can start at or before dayOpenStart and have >= 4h availability
      const openingCandidates = remainingAvails.filter(a => {
        const sMins = timeToMinutes(a.startTime);
        const eMins = timeToMinutes(a.endTime);
        return sMins <= dayOpenStartMins && (eMins - dayOpenStartMins) >= 4 * 60;
      });

      let assignedOpening = 0;
      for (let slot = 1; slot <= openingNeeded; slot++) {
        const pool = openingCandidates.filter(a => remainingAvails.some(r => r.id === a.id));
        if (pool.length === 0) break;

        // Sort: slot 1 prefers FT; slot 2 on weekdays prefers PT to allow staggered 5.5h shift and free up afternoon!
        pool.sort((a, b) => {
          const empA = safeEmployees.find(e => e.name.trim().toLowerCase() === a.employeeName.trim().toLowerCase());
          const empB = safeEmployees.find(e => e.name.trim().toLowerCase() === b.employeeName.trim().toLowerCase());
          const isFTA = empA?.status === '正式夥伴';
          const isFTB = empB?.status === '正式夥伴';

          if (slot === 1 || isWeekend) {
            if (prioritizeFullTime && isFTA !== isFTB) return isFTA ? -1 : 1;
          } else {
            // Slot 2 on weekdays: prefer PT so PT can work 5.5h, freeing afternoon for closing!
            if (isFTA !== isFTB) return isFTA ? 1 : -1;
          }

          const countA = empShiftCounts[a.employeeName.trim().toLowerCase()] || 0;
          const countB = empShiftCounts[b.employeeName.trim().toLowerCase()] || 0;
          if (countA !== countB) return countA - countB;

          return compareTimeStrings(a.startTime, b.startTime);
        });

        const cand = pool[0];
        if (!cand) break;
        if (!canWorkerWorkOnDate(cand.employeeName, dateStr)) continue;

        const emp = safeEmployees.find(e => e.name.trim().toLowerCase() === cand.employeeName.trim().toLowerCase());
        const isFT = emp?.status === '正式夥伴';

        const openStart = dayOpenStart;
        const openStartMins = dayOpenStartMins;
        const candEndMins = timeToMinutes(cand.endTime);
        const availDurationMins = candEndMins - openStartMins;

        // Rules 1, 2, 3:
        // 8h work -> 9h span (1h break). 4h work -> 4.5h span (30m break).
        // Intermediate spans (5.5h, 6.5h, 7.5h) only unless it is a must.
        let candidateSpans = [9.0, 4.5, 7.5, 6.5, 5.5];
        if (slot >= 2 && !isFT && !isWeekend) {
          candidateSpans = [4.5, 5.5, 9.0, 7.5, 6.5];
        }

        let bestEndMins = -1;
        for (const span of candidateSpans) {
          const durMins = Math.round(span * 60);
          if (durMins > availDurationMins) continue;
          const endM = openStartMins + durMins;
          const endStr = minutesToTime(endM);
          if (!wouldExceedCap(openStart, endStr, dateStr, isWeekend)) {
            bestEndMins = endM;
            break;
          }
        }

        if (bestEndMins !== -1) {
          const finalEnd = minutesToTime(bestEndMins);
          const useful = countCoveredDeficitHours(openStart, finalEnd, dateStr, isWeekend);
          commitShift(cand, openStart, finalEnd, '開早班', `滿足 ${openStart} 開早 ${openingTarget} 人守備需求`, useful);
          remainingAvails = remainingAvails.filter(a => a.id !== cand.id);
          assignedOpening++;
        }
      }
    }

    // =========================================================================
    // PHASE 2: 晚班與收班打烊保障 (Closing 30-min window, target = closingStaffCount)
    // =========================================================================
    // Count active workers during the last 30 mins of operating hours
    const activeClosing = virtualSchedules.filter(
      s => s && s.date === dateStr && timeToMinutes(s.startTime) <= dayCloseEndMins - 30 && timeToMinutes(s.endTime) >= dayCloseEndMins
    ).length;
    const closingTarget = closingStaffCount;
    const closingNeeded = Math.max(0, closingTarget - activeClosing);

    if (closingNeeded > 0) {
      // Find candidates who can work until dayCloseEnd (or dayCloseEnd - 30 mins) with >= 4h availability
      const closingCandidates = remainingAvails.filter(a => {
        const eMins = timeToMinutes(a.endTime);
        const sMins = timeToMinutes(a.startTime);
        return eMins >= (dayCloseEndMins - 30) && (eMins - sMins) >= 4 * 60;
      });

      // Sort closing candidates: FT first, then fewest shifts (fairness), then latest end time
      closingCandidates.sort((a, b) => {
        const empA = safeEmployees.find(e => e.name.trim().toLowerCase() === a.employeeName.trim().toLowerCase());
        const empB = safeEmployees.find(e => e.name.trim().toLowerCase() === b.employeeName.trim().toLowerCase());
        const isFTA = empA?.status === '正式夥伴';
        const isFTB = empB?.status === '正式夥伴';
        if (prioritizeFullTime && isFTA !== isFTB) return isFTA ? -1 : 1;

        const countA = empShiftCounts[a.employeeName.trim().toLowerCase()] || 0;
        const countB = empShiftCounts[b.employeeName.trim().toLowerCase()] || 0;
        if (countA !== countB) return countA - countB;

        return compareTimeStrings(b.endTime, a.endTime); // latest endTime first
      });

      let assignedClosing = 0;
      for (const cand of closingCandidates) {
        if (assignedClosing >= closingNeeded) break;
        if (!canWorkerWorkOnDate(cand.employeeName, dateStr)) continue;

        const candStartMins = timeToMinutes(cand.startTime);
        const candEndMins = timeToMinutes(cand.endTime);

        let bestStartMins = -1;
        let bestEndMins = -1;
        let maxUseful = -1;

        // Try ending at registered end time, or adjusted to store close
        const targetEndMins = Math.min(candEndMins, dayCloseEndMins);
        const availDurationMins = targetEndMins - candStartMins;

        const emp = safeEmployees.find(e => e.name.trim().toLowerCase() === cand.employeeName.trim().toLowerCase());
        const isFT = emp?.status === '正式夥伴';

        // Rules 1, 2, 3:
        // Prioritize 9.0h (8h work + 1h break) and 4.5h (4h work + 30m break)
        // Intermediate spans only unless it is a must
        const candidateSpans = isFT ? [9.0, 4.5, 7.5, 6.5, 5.5] : [4.5, 9.0, 5.5, 6.5, 7.5];

        for (const span of candidateSpans) {
          const durMins = Math.round(span * 60);
          if (durMins > availDurationMins) continue;

          const testStartMins = targetEndMins - durMins;
          if (testStartMins < candStartMins) continue;

          const sStr = minutesToTime(testStartMins);
          const eStr = minutesToTime(targetEndMins);

          if (!wouldExceedCap(sStr, eStr, dateStr, isWeekend)) {
            const useful = countCoveredDeficitHours(sStr, eStr, dateStr, isWeekend);
            const isStandard = span === 9.0 || span === 4.5;
            const score = useful * 20 + (isStandard ? 30 : 0) + span;
            if (score > maxUseful) {
              maxUseful = score;
              bestStartMins = testStartMins;
              bestEndMins = targetEndMins;
            }
          }
        }

        if (bestStartMins !== -1 && bestEndMins !== -1) {
          const finalStart = minutesToTime(bestStartMins);
          const finalEnd = minutesToTime(bestEndMins);
          commitShift(cand, finalStart, finalEnd, '收班班', `填補門市 ${dayCloseEnd} 收班 ${closingTarget} 人守備需求`, maxUseful);
          remainingAvails = remainingAvails.filter(a => a.id !== cand.id);
          assignedClosing++;
        }
      }
    }

    // =========================================================================
    // PHASE 3: 尖峰與中段補缺 (Midday Rush & Deficit Fill with Strict Caps)
    // =========================================================================
    // Sort remaining candidates: FT first, then fewest shifts assigned (fair rotation), then earliest start
    remainingAvails.sort((a, b) => {
      const empA = safeEmployees.find(e => e.name.trim().toLowerCase() === a.employeeName.trim().toLowerCase());
      const empB = safeEmployees.find(e => e.name.trim().toLowerCase() === b.employeeName.trim().toLowerCase());
      const isFTA = empA?.status === '正式夥伴';
      const isFTB = empB?.status === '正式夥伴';
      if (prioritizeFullTime && isFTA !== isFTB) return isFTA ? -1 : 1;

      const countA = empShiftCounts[a.employeeName.trim().toLowerCase()] || 0;
      const countB = empShiftCounts[b.employeeName.trim().toLowerCase()] || 0;
      if (countA !== countB) return countA - countB;

      return compareTimeStrings(a.startTime, b.startTime);
    });

    for (const cand of remainingAvails) {
      if (!canWorkerWorkOnDate(cand.employeeName, dateStr)) {
        unassignedAvailabilitiesCount++;
        continue;
      }

      // Guard: Daily total unique worker ceiling to avoid overstaffing a single date
      const assignedWorkersOnDate = new Set(
        virtualSchedules.filter(s => s && s.date === dateStr).map(s => s.employeeName?.trim().toLowerCase())
      );
      const maxDailyWorkers = isWeekend
        ? Math.max(weekendMaxStaff + 1, openingStaffCount + closingStaffCount + 1, 3)
        : Math.max(weekdayMaxStaff + 1, openingStaffCount + closingStaffCount + 1, 2);

      if (assignedWorkersOnDate.size >= maxDailyWorkers && !assignedWorkersOnDate.has(cand.employeeName.trim().toLowerCase())) {
        unassignedAvailabilitiesCount++;
        continue;
      }

      const emp = safeEmployees.find(e => e.name.trim().toLowerCase() === cand.employeeName.trim().toLowerCase());
      const isFT = emp?.status === '正式夥伴';

      // Start Phase 3 at dayOpenStart + 90 mins or 08:30 to ensure opening window remains dedicated to opening workers
      const minMidStartMins = Math.max(dayOpenStartMins + 90, timeToMinutes('08:30'));
      const candStartMins = Math.max(timeToMinutes(cand.startTime), minMidStartMins);
      const candEndMins = timeToMinutes(cand.endTime);
      const availSpan = candEndMins - candStartMins;

      // Minimum shift 4h (240 min)
      if (availSpan < 4 * 60) {
        unassignedAvailabilitiesCount++;
        continue;
      }

      let bestStartMins = -1;
      let bestEndMins = -1;
      let bestScore = -9999;
      let bestUsefulHours = 0;

      // FT Preset priority evaluation (must also be full hours)
      if (isFT && safeShiftPresets.length > 0) {
        for (const preset of safeShiftPresets) {
          const pStartMins = timeToMinutes(preset.startTime);
          const pEndMins = timeToMinutes(preset.endTime);
          const presetDur = pEndMins - pStartMins;
          if (presetDur % 60 !== 0) continue;
          if (pStartMins >= candStartMins && pEndMins <= candEndMins) {
            const pStartStr = preset.startTime;
            const pEndStr = preset.endTime;
            if (!wouldExceedCap(pStartStr, pEndStr, dateStr, isWeekend)) {
              const useful = countCoveredDeficitHours(pStartStr, pEndStr, dateStr, isWeekend);
              if (useful > 0) {
                const score = useful * 20 + presetDur / 60;
                if (score > bestScore) {
                  bestScore = score;
                  bestStartMins = pStartMins;
                  bestEndMins = pEndMins;
                  bestUsefulHours = useful;
                }
              }
            }
          }
        }
      }

      // Sliding window evaluation across available range
      // Rules 1, 2, 3: Prioritize standard 9.0h (8h work + 1h break) and 4.5h (4h work + 30m break)
      if (bestScore < 0) {
        const candidateSpans = isFT ? [9.0, 4.5, 7.5, 6.5, 5.5] : [4.5, 9.0, 5.5, 6.5, 7.5];

        for (const span of candidateSpans) {
          const dur = Math.round(span * 60);
          if (dur > availSpan) continue;

          for (let sM = candStartMins; sM <= candEndMins - dur; sM += 30) {
            const eM = sM + dur;
            const sStr = minutesToTime(sM);
            const eStr = minutesToTime(eM);

            // Strict hourly cap: never schedule if any hour exceeds cap
            if (wouldExceedCap(sStr, eStr, dateStr, isWeekend)) {
              continue;
            }

            const useful = countCoveredDeficitHours(sStr, eStr, dateStr, isWeekend);
            // CRITICAL: A shift MUST cover at least 1 deficit hour.
            if (useful <= 0) {
              continue;
            }

            // Standard shifts (9.0h and 4.5h) get a priority bonus; intermediate shifts chosen only when necessary
            const isStandard = span === 9.0 || span === 4.5;
            const score = useful * 20 + (isStandard ? 30 : 0) + span;
            if (score > bestScore) {
              bestScore = score;
              bestStartMins = sM;
              bestEndMins = eM;
              bestUsefulHours = useful;
            }
          }
        }
      }

      if (bestStartMins !== -1 && bestEndMins !== -1) {
        const finalStart = minutesToTime(bestStartMins);
        const finalEnd = minutesToTime(bestEndMins);
        commitShift(
          cand,
          finalStart,
          finalEnd,
          '中段班',
          `填補門市中段時段人力（涵蓋 ${bestUsefulHours} 小時需求，遵守平日≤${weekdayMaxStaff}人/假日≤${weekendMaxStaff}人上限）`,
          bestUsefulHours
        );
      } else {
        unassignedAvailabilitiesCount++;
      }
    }
  }

  return {
    proposedSchedules,
    unassignedAvailabilitiesCount,
    totalNewConfirmedShifts: proposedSchedules.length,
    coveredDeficitHoursTotal
  };
}

/**
 * 1. Pure Rule Auto-Scheduler (純程式規則排班演算法核心):
 * Runs 100% from scratch without existing manual schedules or confirmed locks.
 * Strictly schedules all shifts adhering to opening, closing, peak caps, integer hours, and labor law.
 * Used by ManagerComparisonView (Table 2).
 */
export const generatePureAutoSchedule = (
  availabilities: WorkerAvailability[] = [],
  employees: Employee[] = [],
  shiftPresets: ShiftPreset[] = [],
  options: PureAutoScheduleOptions
): AutoScheduleResult => {
  return runAutoScheduleEngine({
    availabilities,
    existingSchedules: [],
    employees,
    shiftPresets,
    ignoreConfirmedStatus: true,
    dateRange: options?.dateRange || [],
    prioritizeFullTime: options?.prioritizeFullTime ?? true,
    maxHoursPerShift: options?.maxHoursPerShift ?? 8,
    operatingStartTime: options?.operatingStartTime,
    operatingEndTime: options?.operatingEndTime,
    staffingDemandConfig: options?.staffingDemandConfig
  });
};

/**
 * 2. Incremental / Live Auto-Scheduler (現場增量排班):
 * Plugs in existing confirmed schedules and only schedules unconfirmed availabilities to fill deficits.
 * Used by RuleScheduleModal in live scheduling view.
 */
export const generateAutoSchedule = (
  availabilities: WorkerAvailability[] = [],
  existingSchedules: WorkSchedule[] = [],
  employees: Employee[] = [],
  _staffingTargets: StaffingTarget[] = [],
  _analysisHoursRange: number[] = [],
  shiftPresets: ShiftPreset[] = [],
  options: AutoScheduleOptions
): AutoScheduleResult => {
  return runAutoScheduleEngine({
    availabilities,
    existingSchedules,
    employees,
    shiftPresets,
    ignoreConfirmedStatus: false,
    dateRange: options?.dateRange || [],
    prioritizeFullTime: options?.prioritizeFullTime ?? true,
    maxHoursPerShift: options?.maxHoursPerShift ?? 8,
    operatingStartTime: options?.operatingStartTime,
    operatingEndTime: options?.operatingEndTime,
    staffingDemandConfig: options?.staffingDemandConfig
  });
};
