import { useState, useMemo, useEffect } from 'react';
import type {
  WorkSchedule,
  WorkerAvailability,
  Employee,
  StaffingTarget,
  ShiftPreset,
  StaffingDemandConfig
} from '../services/scheduler';
import { generatePureAutoSchedule } from '../utils/autoScheduler';
import { runAIScheduler, type ProposedAISchedule } from '../services/aiScheduler';
import {
  formatDateString,
  calculateEffectiveWorkHours,
  isShiftActiveAtHour,
  hasSevenConsecutiveDays
} from '../utils/dateUtils';
import {
  getStoredSampleSchedules,
  saveStoredSampleSchedules,
  clearStoredSampleSchedules
} from '../utils/excelSampleParser';

export interface ComparisonStats {
  totalShifts: number;
  totalLaborHours: number;
  deficitHoursCount: number;
  overstaffedHoursCount: number;
  openingDaysMet: number;
  openingMetRate: number;
  closingDaysMet: number;
  closingMetRate: number;
  consecutiveViolations: number;
  uniqueEmployeesCount: number;
}

export interface UseComparisonSimulationOptions {
  monthStr: string;
  daysInMonth: Date[];
  monthDates: string[];
  displayedMonthDates: string[];
  dateRangePart: 'all' | 'part1' | 'part2';
  availabilities: WorkerAvailability[];
  schedules: WorkSchedule[];
  employees: Employee[];
  staffingTargets: StaffingTarget[];
  shiftPresets: ShiftPreset[];
  operatingStartTime?: string;
  operatingEndTime?: string;
  staffingDemandConfig?: StaffingDemandConfig;
  analysisHoursRange: number[];
}

export function useComparisonSimulation(options: UseComparisonSimulationOptions) {
  const {
    monthStr,
    daysInMonth,
    monthDates,
    displayedMonthDates,
    dateRangePart,
    availabilities,
    schedules,
    employees,
    staffingTargets,
    shiftPresets,
    operatingStartTime,
    operatingEndTime,
    staffingDemandConfig,
    analysisHoursRange
  } = options;

  // AI simulation state
  const [aiSchedules, setAiSchedules] = useState<ProposedAISchedule[] | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Sample manual schedules state (strictly isolated in browser localStorage to prevent Firestore contamination)
  const [sampleSchedules, setSampleSchedules] = useState<WorkSchedule[]>(() => getStoredSampleSchedules());

  // Clear AI simulation when month changes
  useEffect(() => {
    setAiSchedules(null);
    setAiError(null);
  }, [monthStr]);

  // Actual database schedules for this month
  const actualManualMonthSchedules = useMemo(() => {
    return schedules.filter(s => s.date && s.date.startsWith(monthStr));
  }, [schedules, monthStr]);

  // Sample manual schedules for this month
  const sampleMonthSchedules = useMemo(() => {
    return sampleSchedules.filter(s => s.date && s.date.startsWith(monthStr));
  }, [sampleSchedules, monthStr]);

  // Core rule: "also if actual manual data exist even for 1 day then this sample data uploaded should be ignore"
  const hasActualManualData = actualManualMonthSchedules.length > 0;
  const isUsingSampleData = !hasActualManualData && sampleMonthSchedules.length > 0;

  const manualMonthSchedules = useMemo(() => {
    if (hasActualManualData) {
      return actualManualMonthSchedules;
    }
    if (sampleMonthSchedules.length > 0) {
      return sampleMonthSchedules;
    }
    return [];
  }, [hasActualManualData, actualManualMonthSchedules, sampleMonthSchedules]);

  const handleUploadSampleSchedules = (newSchedules: WorkSchedule[], targetMonthStr?: string) => {
    const month = targetMonthStr || (newSchedules[0]?.date ? newSchedules[0].date.substring(0, 7) : '');
    setSampleSchedules(prev => {
      const remaining = month ? prev.filter(s => !s.date || !s.date.startsWith(month)) : prev;
      const updated = [...remaining, ...newSchedules];
      saveStoredSampleSchedules(updated);
      return updated;
    });
  };

  const handleClearSampleSchedules = (targetMonthStr?: string) => {
    clearStoredSampleSchedules(targetMonthStr);
    setSampleSchedules(getStoredSampleSchedules());
  };

  // Relevant active employees sorted by FT first, then PT
  // Also include any employees from manualMonthSchedules (e.g. from sample file) so all rows render properly
  const activeEmployees = useMemo(() => {
    const list = [...employees]
      .filter(e => e.active !== false)
      .sort((a, b) => {
        if (a.status === '正式夥伴' && b.status !== '正式夥伴') return -1;
        if (a.status !== '正式夥伴' && b.status === '正式夥伴') return 1;
        return a.name.localeCompare(b.name, 'zh-Hant');
      });

    const existingNames = new Set(list.map(e => e.name.trim().toLowerCase()));
    const extraNames = new Set<string>();
    manualMonthSchedules.forEach(s => {
      const name = s.employeeName?.trim();
      if (name && !existingNames.has(name.toLowerCase())) {
        extraNames.add(name);
      }
    });

    if (extraNames.size > 0) {
      extraNames.forEach(name => {
        list.push({
          id: `sample-emp-${name}`,
          name,
          status: '兼職夥伴',
          active: true,
          roles: ['門市夥伴']
        } as unknown as Employee);
      });
    }

    return list;
  }, [employees, manualMonthSchedules]);

  // Month availabilities
  const monthAvailabilities = useMemo(() => {
    return availabilities.filter(a => a.date && a.date.startsWith(monthStr));
  }, [availabilities, monthStr]);

  // Active date range based on dateRangePart ('all' | 'part1' | 'part2')
  const activeDateRange = useMemo(() => {
    if (dateRangePart === 'part1') {
      return daysInMonth.filter(d => d.getDate() <= 15).map(d => formatDateString(d));
    }
    if (dateRangePart === 'part2') {
      return daysInMonth.filter(d => d.getDate() >= 16).map(d => formatDateString(d));
    }
    return monthDates;
  }, [dateRangePart, daysInMonth, monthDates]);

  const activeAvailabilities = useMemo(() => {
    return monthAvailabilities.filter(a => activeDateRange.includes(a.date));
  }, [monthAvailabilities, activeDateRange]);

  // 1. Table 2: Pure Rule-based simulation (100% pure algorithm, zero manual schedule bias)
  const ruleResult = useMemo(() => {
    if (activeDateRange.length === 0) return { proposedSchedules: [] };

    return generatePureAutoSchedule(
      activeAvailabilities,
      employees,
      shiftPresets,
      {
        dateRange: activeDateRange,
        prioritizeFullTime: true,
        maxHoursPerShift: 8,
        operatingStartTime,
        operatingEndTime,
        staffingDemandConfig
      }
    );
  }, [activeDateRange, activeAvailabilities, employees, shiftPresets, operatingStartTime, operatingEndTime, staffingDemandConfig]);

  const ruleSchedules = useMemo(() => {
    return ruleResult.proposedSchedules.map((p, idx) => ({
      id: `sim-rule-${idx}`,
      title: p.employeeName,
      employeeName: p.employeeName,
      date: p.date,
      workplace: p.workplace,
      startTime: p.startTime,
      endTime: p.endTime,
      color: p.color,
      createdAt: Date.now(),
      scheduleSource: 'rule' as const
    }));
  }, [ruleResult]);

  // 2. Trigger Gemini AI simulation in-memory
  const handleRunAiSimulation = async () => {
    try {
      setIsAiLoading(true);
      setAiError(null);

      const activeEmployeeNames = new Set(
        employees.filter(e => e.active !== false).map(e => e.name.trim().toLowerCase())
      );

      const filterEligibleAvailabilities = (dates: string[]) => {
        return monthAvailabilities.filter(
          a => dates.includes(a.date) && activeEmployeeNames.has(a.employeeName.trim().toLowerCase())
        );
      };

      let allProposed: ProposedAISchedule[] = [];

      if (dateRangePart === 'part1') {
        const targetDates = daysInMonth.filter(d => d.getDate() <= 15).map(d => formatDateString(d));
        const targetAvail = filterEligibleAvailabilities(targetDates);
        allProposed = await runAIScheduler({
          modelName: 'gemini-3.8-flash',
          dateRange: targetDates,
          availabilities: targetAvail,
          schedules: manualMonthSchedules,
          employees,
          staffingTargets,
          onlyFillDeficits: false,
          operatingStartTime,
          operatingEndTime,
          staffingDemandConfig
        });
      } else if (dateRangePart === 'part2') {
        const targetDates = daysInMonth.filter(d => d.getDate() >= 16).map(d => formatDateString(d));
        const targetAvail = filterEligibleAvailabilities(targetDates);
        allProposed = await runAIScheduler({
          modelName: 'gemini-3.8-flash',
          dateRange: targetDates,
          availabilities: targetAvail,
          schedules: manualMonthSchedules,
          employees,
          staffingTargets,
          onlyFillDeficits: false,
          operatingStartTime,
          operatingEndTime,
          staffingDemandConfig
        });
      } else {
        // 'all' (1~31): split into two halves and pass first half to second half context
        const dates1 = daysInMonth.filter(d => d.getDate() <= 15).map(d => formatDateString(d));
        const avail1 = filterEligibleAvailabilities(dates1);
        const dates2 = daysInMonth.filter(d => d.getDate() >= 16).map(d => formatDateString(d));
        const avail2 = filterEligibleAvailabilities(dates2);

        const p1 = await runAIScheduler({
          modelName: 'gemini-3.8-flash',
          dateRange: dates1,
          availabilities: avail1,
          schedules: manualMonthSchedules,
          employees,
          staffingTargets,
          onlyFillDeficits: false,
          operatingStartTime,
          operatingEndTime,
          staffingDemandConfig
        });

        const p1WorkSchedules: WorkSchedule[] = p1.map((p, idx) => ({
          id: `sim-ai-p1-${idx}`,
          title: p.employeeName,
          employeeName: p.employeeName,
          date: p.date,
          workplace: p.workplace,
          startTime: p.startTime,
          endTime: p.endTime,
          color: 'purple',
          createdAt: Date.now(),
          scheduleSource: 'ai' as const
        }));

        const p2 = await runAIScheduler({
          modelName: 'gemini-3.8-flash',
          dateRange: dates2,
          availabilities: avail2,
          schedules: [...manualMonthSchedules.filter(s => !dates1.includes(s.date)), ...p1WorkSchedules],
          employees,
          staffingTargets,
          onlyFillDeficits: false,
          operatingStartTime,
          operatingEndTime,
          staffingDemandConfig
        });

        allProposed = [...p1, ...p2];
      }

      setAiSchedules(prev => {
        if (!prev) return allProposed;
        const currentTargetDates = new Set(allProposed.map(s => s.date));
        const remainingOld = prev.filter(s => !currentTargetDates.has(s.date));
        return [...remainingOld, ...allProposed];
      });
    } catch (e: any) {
      console.error('AI simulation failed:', e);
      setAiError(e?.message || 'AI 模擬運算失敗，請確認 API Key 或網路連線。');
    } finally {
      setIsAiLoading(false);
    }
  };

  const aiCombinedSchedules = useMemo(() => {
    if (!aiSchedules) return null;

    const simulatedAiShifts: WorkSchedule[] = aiSchedules.map((p, idx) => ({
      id: `sim-ai-${idx}`,
      title: p.employeeName,
      employeeName: p.employeeName,
      date: p.date,
      workplace: p.workplace,
      startTime: p.startTime,
      endTime: p.endTime,
      color: p.color || 'purple',
      createdAt: Date.now(),
      scheduleSource: 'ai' as const
    }));

    const aiDates = new Set(aiSchedules.map(s => s.date));
    const manualForOtherDates = manualMonthSchedules.filter(s => !aiDates.has(s.date));

    return [...manualForOtherDates, ...simulatedAiShifts];
  }, [aiSchedules, manualMonthSchedules]);

  const timeToMins = (t?: string): number => {
    if (!t || !t.includes(':')) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Helper to get target count for a given hour on dateStr based on staffingDemandConfig
  const getStaffingTarget = (hour: number, dateStr: string): number => {
    const isWeekend = new Date(dateStr + 'T00:00:00').getDay() === 0 || new Date(dateStr + 'T00:00:00').getDay() === 6;
    const dayOpenStart = isWeekend ? (staffingDemandConfig?.operatingStartTimeWeekend || '06:30') : (operatingStartTime || '06:30');
    const dayCloseEnd = isWeekend ? (staffingDemandConfig?.operatingEndTimeWeekend || '18:30') : (operatingEndTime || '20:00');
    const openH = Math.floor(timeToMins(dayOpenStart) / 60);
    const closeM = timeToMins(dayCloseEnd);
    const closeH = Math.floor((closeM - 1) / 60);

    // Outside store operating hours
    if (hour < openH || hour > closeH) {
      return 0;
    }

    const maxCap = isWeekend ? (staffingDemandConfig?.weekendMaxStaff ?? 2) : (staffingDemandConfig?.weekdayMaxStaff ?? 2);
    const peakStart = staffingDemandConfig?.peakStartTime || '11:30';
    const peakEnd = staffingDemandConfig?.peakEndTime || '13:30';
    const isPeak = Math.max(timeToMins(peakStart), hour * 60) < Math.min(timeToMins(peakEnd), (hour + 1) * 60);

    if (isPeak) {
      return maxCap;
    }

    if (hour === openH) {
      return Math.min(staffingDemandConfig?.openingStaffCount ?? 1, maxCap);
    }

    if (hour === closeH) {
      return Math.min(staffingDemandConfig?.closingStaffCount ?? 1, maxCap);
    }

    // Regular non-peak mid hours
    return Math.min(staffingDemandConfig?.openingStaffCount ?? 1, maxCap);
  };

  // Helper to compute stats for a schedule set within targetDates
  const computeStats = (scheduleList: WorkSchedule[] | null, targetDates: string[]): ComparisonStats | null => {
    if (!scheduleList) return null;

    let totalLaborHours = 0;
    let deficitHoursCount = 0;
    let overstaffedHoursCount = 0;
    let openingDaysMet = 0;
    let closingDaysMet = 0;
    const empDaysMap: Record<string, Set<string>> = {};
    const targetDateSet = new Set(targetDates);

    targetDates.forEach(dateStr => {
      const isWeekend = new Date(dateStr + 'T00:00:00').getDay() === 0 || new Date(dateStr + 'T00:00:00').getDay() === 6;
      const maxCap = isWeekend ? (staffingDemandConfig?.weekendMaxStaff ?? 2) : (staffingDemandConfig?.weekdayMaxStaff ?? 2);
      const openTarget = staffingDemandConfig?.openingStaffCount ?? 1;
      const closeTarget = staffingDemandConfig?.closingStaffCount ?? 1;
      const dayOpenStart = isWeekend ? (staffingDemandConfig?.operatingStartTimeWeekend || '06:30') : (operatingStartTime || '06:30');
      const dayCloseEnd = isWeekend ? (staffingDemandConfig?.operatingEndTimeWeekend || '18:30') : (operatingEndTime || '20:00');
      const opStartM = timeToMins(dayOpenStart);
      const opEndM = timeToMins(dayCloseEnd);

      const openingActive = scheduleList.filter(s =>
        s.date === dateStr && timeToMins(s.startTime) <= opStartM && timeToMins(s.endTime) >= opStartM + 30
      ).length;
      if (openingActive >= openTarget) {
        openingDaysMet++;
      }

      const closingActive = scheduleList.filter(s =>
        s.date === dateStr && timeToMins(s.startTime) <= opEndM - 30 && timeToMins(s.endTime) >= opEndM
      ).length;
      if (closingActive >= closeTarget) {
        closingDaysMet++;
      }

      analysisHoursRange.forEach(hour => {
        const active = scheduleList.filter(s => s.date === dateStr && isShiftActiveAtHour(s.startTime, s.endTime, hour));
        const count = active.length;
        const target = getStaffingTarget(hour, dateStr);

        if (count < target) {
          deficitHoursCount += (target - count);
        }
        if (count > maxCap) {
          overstaffedHoursCount += (count - maxCap);
        }
      });
    });

    scheduleList.forEach(s => {
      if (!targetDateSet.has(s.date)) return;
      if (s.startTime && s.endTime) {
        const dur = calculateEffectiveWorkHours(s.startTime, s.endTime);
        totalLaborHours += dur;
      }
      const emp = s.employeeName.trim().toLowerCase();
      if (!empDaysMap[emp]) empDaysMap[emp] = new Set();
      empDaysMap[emp].add(s.date);
    });

    let consecutiveViolations = 0;
    Object.values(empDaysMap).forEach(dates => {
      if (hasSevenConsecutiveDays(Array.from(dates))) {
        consecutiveViolations++;
      }
    });

    const targetShiftsCount = scheduleList.filter(s => targetDateSet.has(s.date)).length;
    const uniqueEmployeesCount = Object.keys(empDaysMap).length;

    return {
      totalShifts: targetShiftsCount,
      totalLaborHours: Math.round(totalLaborHours * 10) / 10,
      deficitHoursCount,
      overstaffedHoursCount,
      openingDaysMet,
      openingMetRate: targetDates.length > 0 ? Math.round((openingDaysMet / targetDates.length) * 100) : 0,
      closingDaysMet,
      closingMetRate: targetDates.length > 0 ? Math.round((closingDaysMet / targetDates.length) * 100) : 0,
      consecutiveViolations,
      uniqueEmployeesCount
    };
  };

  const manualStats = useMemo(() => computeStats(manualMonthSchedules, displayedMonthDates), [manualMonthSchedules, displayedMonthDates, analysisHoursRange]);
  const ruleStats = useMemo(() => computeStats(ruleSchedules, displayedMonthDates), [ruleSchedules, displayedMonthDates, analysisHoursRange]);
  const aiStats = useMemo(() => computeStats(aiCombinedSchedules, displayedMonthDates), [aiCombinedSchedules, displayedMonthDates, analysisHoursRange]);

  return {
    activeEmployees,
    manualMonthSchedules,
    ruleSchedules,
    aiSchedules,
    aiCombinedSchedules,
    isAiLoading,
    aiError,
    handleRunAiSimulation,
    manualStats,
    ruleStats,
    aiStats,
    timeToMins,
    getStaffingTarget,
    hasActualManualData,
    isUsingSampleData,
    sampleMonthSchedules,
    handleUploadSampleSchedules,
    handleClearSampleSchedules
  };
}
