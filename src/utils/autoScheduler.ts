import type { WorkSchedule, WorkerAvailability, Employee, StaffingTarget, ShiftPreset, StaffingDemandConfig } from '../services/scheduler';
import { isShiftActiveAtHour, hasSevenConsecutiveDays, getColorFromName, compareTimeStrings, formatDateString, calculateEffectiveWorkHours } from './dateUtils';

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

  /**
   * Helper to calculate how many effective work hours an employee has already been scheduled
   * within the calendar week (Mon-Sun) of dateStr.
   */
  const getWeeklyEffectiveHours = (empName: string, dateStr: string): number => {
    const empKey = empName.trim().toLowerCase();
    const current = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = current.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(current);
    monday.setDate(current.getDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const monStr = formatDateString(monday);
    const sunStr = formatDateString(sunday);

    let totalHours = 0;
    for (const s of virtualSchedules) {
      if (
        s &&
        s.employeeName &&
        s.employeeName.trim().toLowerCase() === empKey &&
        s.date >= monStr &&
        s.date <= sunStr &&
        s.startTime &&
        s.endTime
      ) {
        totalHours += calculateEffectiveWorkHours(s.startTime, s.endTime);
      }
    }
    return totalHours;
  };

  /**
   * Helper: Check if assigning [candStart, candEnd] on dateStr to empName would violate
   * the Ministry of Labor 20-hour weekly cap for overseas students (僑外生每週工時上限 20 小時).
   */
  const wouldExceedOverseasWeeklyLimit = (
    empName: string,
    dateStr: string,
    candStart: string,
    candEnd: string
  ): boolean => {
    const emp = safeEmployees.find(e => e.name && e.name.trim().toLowerCase() === empName.trim().toLowerCase());
    if (!emp?.isOverseasStudent) return false;

    const currentWeekHours = getWeeklyEffectiveHours(empName, dateStr);
    const shiftEffectiveHours = calculateEffectiveWorkHours(candStart, candEnd);
    return (currentWeekHours + shiftEffectiveHours) > 20;
  };

  /**
   * Helper to check if a set of date strings contains more than maxConsecutive consecutive work days
   */
  const hasMoreThanMaxConsecutiveDays = (dateStrings: string[], maxConsecutive: number): boolean => {
    const uniqueDates = Array.from(new Set(dateStrings)).sort();
    if (uniqueDates.length <= maxConsecutive) return false;

    let consecutiveCount = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prev = new Date(uniqueDates[i - 1] + 'T00:00:00');
      const curr = new Date(uniqueDates[i] + 'T00:00:00');
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        consecutiveCount++;
        if (consecutiveCount > maxConsecutive) {
          return true;
        }
      } else {
        consecutiveCount = 1;
      }
    }
    return false;
  };

  /**
   * Helper to count how many days an employee is already scheduled in the calendar week (Mon-Sun) of dateStr
   */
  const getDaysScheduledInWeek = (empName: string, dateStr: string): number => {
    const empKey = empName.trim().toLowerCase();
    const dates = empAssignedDates[empKey];
    if (!dates || dates.size === 0) return 0;

    const current = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = current.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(current);
    monday.setDate(current.getDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const monStr = formatDateString(monday);
    const sunStr = formatDateString(sunday);

    let count = 0;
    dates.forEach(d => {
      if (d >= monStr && d <= sunStr) {
        count++;
      }
    });
    return count;
  };

  // Helper: Check if worker can work on this date (not already scheduled, <= 4 consecutive days, FT <= 5 days/week, overseas <= 20h/week)
  const canWorkerWorkOnDate = (empName: string, dateStr: string): boolean => {
    const empKey = empName.trim().toLowerCase();

    // Already scheduled on this date?
    const alreadyScheduled = virtualSchedules.some(
      s => s && s.date === dateStr && s.employeeName && s.employeeName.trim().toLowerCase() === empKey
    );
    if (alreadyScheduled) return false;

    // Consecutive days check: strictly max 4 consecutive work days (Rule 2: 2-4 consecutive days, never 5 or 6+)
    const currentDates = Array.from(empAssignedDates[empKey] || new Set<string>());
    const prospective = Array.from(new Set([...currentDates, dateStr]));
    if (hasSevenConsecutiveDays(prospective) || hasMoreThanMaxConsecutiveDays(prospective, 4)) {
      return false;
    }

    const emp = safeEmployees.find(e => e.name && e.name.trim().toLowerCase() === empKey);

    // Rule 1: Full-time (正式夥伴) works at most 5 days per week to avoid 6th-day overtime pay
    if (emp?.status === '正式夥伴') {
      if (getDaysScheduledInWeek(empName, dateStr) >= 5) {
        return false;
      }
    }

    // Overseas student (僑外生) 20-hour weekly limit check:
    // Minimum shift is 4 effective hours, so if they already have > 16h this week, they cannot take another shift.
    if (emp?.isOverseasStudent) {
      const currentWeekHours = getWeeklyEffectiveHours(empName, dateStr);
      if (currentWeekHours + 4 > 20) {
        return false;
      }
    }

    return true;
  };

  /**
   * Helper to count consecutive days worked immediately prior to dateStr
   */
  const getConsecutiveWorkDaysBefore = (empName: string, dateStr: string): number => {
    const empKey = empName.trim().toLowerCase();
    const dates = empAssignedDates[empKey];
    if (!dates || dates.size === 0) return 0;

    let streak = 0;
    const current = new Date(dateStr + 'T00:00:00');
    for (let i = 1; i <= 6; i++) {
      const prev = new Date(current);
      prev.setDate(current.getDate() - i);
      const prevStr = formatDateString(prev);
      if (dates.has(prevStr)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  /**
   * Calculate preference score for an employee on dateStr:
   * 1. Rule 1: Full-time 5-day cap is enforced in canWorkerWorkOnDate (and penalized if >= 5).
   * 2. Rule 2: Consecutive 2-4 days work preference (split holiday):
   *    - If streak is 1 or 2 (scheduling today makes it 2 or 3 days): +30 pts (ideal sweet spot!)
   *    - If streak is 0 (first day of a block): +15 pts (+25 pts on Sunday if Saturday was off).
   *    - If streak is 3 (scheduling today makes it 4 consecutive days): -20 pts (allowed when needed, while preferring 2-3 days when another candidate is available).
   */
  const getWorkerDayPreferenceScore = (empName: string, dateStr: string, isFT: boolean): number => {
    let score = 0;

    // Rule 1: Full-time 5 days preference (avoid 6th day overtime)
    if (isFT) {
      const weekCount = getDaysScheduledInWeek(empName, dateStr);
      if (weekCount >= 5) {
        score -= 100;
      }
    }

    // Rule 2: Prefer working 2-4 consecutive days to split holidays
    const streak = getConsecutiveWorkDaysBefore(empName, dateStr);
    const current = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = current.getDay();

    if (streak >= 4) {
      score -= 100;
    } else if (streak === 1 || streak === 2) {
      // Working today results in 2 or 3 consecutive days: ideal!
      score += 30;
    } else if (streak === 3) {
      // Working today results in 4 consecutive days: allowed (up to 4 days max), but prefer candidates with 0-2 streak first
      score -= 20;
    } else {
      // streak === 0: worker had yesterday off.
      // If today is Sunday and Saturday was a day off: giving them Sunday avoids 2 consecutive weekend days off
      if (dayOfWeek === 0) {
        const sat = new Date(current);
        sat.setDate(current.getDate() - 1);
        const satStr = formatDateString(sat);
        const empKey = empName.trim().toLowerCase();
        if (!empAssignedDates[empKey]?.has(satStr)) {
          score += 25; // Split weekend holiday!
        } else {
          score += 15;
        }
      } else {
        score += 15;
      }
    }

    return score;
  };

  /**
   * Helper to compare candidates according to FT status, 5-day overtime avoidance,
   * 2-3 consecutive days preference, and fair rotation.
   */
  const compareCandidatePreferences = (
    a: WorkerAvailability,
    b: WorkerAvailability,
    dateStr: string,
    preferFT: boolean
  ): number => {
    const empA = safeEmployees.find(e => e.name.trim().toLowerCase() === a.employeeName.trim().toLowerCase());
    const empB = safeEmployees.find(e => e.name.trim().toLowerCase() === b.employeeName.trim().toLowerCase());
    const isFTA = empA?.status === '正式夥伴';
    const isFTB = empB?.status === '正式夥伴';

    const prefScoreA = getWorkerDayPreferenceScore(a.employeeName, dateStr, !!isFTA);
    const prefScoreB = getWorkerDayPreferenceScore(b.employeeName, dateStr, !!isFTB);

    let baseFTA = 0;
    let baseFTB = 0;
    if (preferFT) {
      if (isFTA) baseFTA += 60;
      if (isFTB) baseFTB += 60;
    }

    const totalScoreA = baseFTA + prefScoreA;
    const totalScoreB = baseFTB + prefScoreB;

    if (totalScoreA !== totalScoreB) {
      return totalScoreB - totalScoreA; // higher score first
    }

    // Fair rotation: fewer total shifts first
    const countA = empShiftCounts[a.employeeName.trim().toLowerCase()] || 0;
    const countB = empShiftCounts[b.employeeName.trim().toLowerCase()] || 0;
    if (countA !== countB) return countA - countB;

    return 0;
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

        // Sort candidates: considers FT status, FT 5-day overtime avoidance, 2-3 consecutive days fit, and fair rotation
        pool.sort((a, b) => {
          const preferFT = (slot === 1 || isWeekend) ? (prioritizeFullTime ?? true) : false;
          const cmp = compareCandidatePreferences(a, b, dateStr, preferFT);
          if (cmp !== 0) return cmp;
          return compareTimeStrings(a.startTime, b.startTime);
        });

        for (const cand of pool) {
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
            if (
              !wouldExceedCap(openStart, endStr, dateStr, isWeekend) &&
              !wouldExceedOverseasWeeklyLimit(cand.employeeName, dateStr, openStart, endStr)
            ) {
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
            break;
          }
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

      // Sort closing candidates: FT status, 5-day overtime avoidance, 2-3 consecutive days fit, fairness, latest end time
      closingCandidates.sort((a, b) => {
        const cmp = compareCandidatePreferences(a, b, dateStr, prioritizeFullTime ?? true);
        if (cmp !== 0) return cmp;
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

          if (
            !wouldExceedCap(sStr, eStr, dateStr, isWeekend) &&
            !wouldExceedOverseasWeeklyLimit(cand.employeeName, dateStr, sStr, eStr)
          ) {
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
    // Sort remaining candidates: FT status, 5-day overtime avoidance, 2-3 consecutive days fit, fairness, earliest start
    remainingAvails.sort((a, b) => {
      const cmp = compareCandidatePreferences(a, b, dateStr, prioritizeFullTime ?? true);
      if (cmp !== 0) return cmp;
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

            // Strict hourly cap & overseas student 20h weekly limit: never schedule if violated
            if (
              wouldExceedCap(sStr, eStr, dateStr, isWeekend) ||
              wouldExceedOverseasWeeklyLimit(cand.employeeName, dateStr, sStr, eStr)
            ) {
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
