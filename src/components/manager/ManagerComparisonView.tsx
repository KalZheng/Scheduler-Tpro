import React, { useState, useMemo, useEffect } from 'react';
import type { WorkSchedule, WorkerAvailability, Employee, StaffingTarget, ShiftPreset } from '../../services/scheduler';
import { generateAutoSchedule } from '../../utils/autoScheduler';
import { runAIScheduler, type ProposedAISchedule } from '../../services/aiScheduler';
import {
  formatDateString,
  getDaysInMonth,
  calculateDuration,
  isShiftActiveAtHour,
  hasSevenConsecutiveDays,
  isOverEightHours,
  getTooltipAlignment,
  getTooltipArrowAlignment
} from '../../utils/dateUtils';
import { DAYS_OF_WEEK } from '../../utils/constants';
import { exportComparisonToExcel } from '../../utils/excelExport';

interface ManagerComparisonViewProps {
  currentMonthStart: Date;
  setCurrentMonthStart?: (d: Date) => void;
  availabilities: WorkerAvailability[];
  schedules: WorkSchedule[];
  employees: Employee[];
  staffingTargets: StaffingTarget[];
  analysisHoursRange: number[];
  shiftPresets: ShiftPreset[];
  operatingStartTime?: string;
  operatingEndTime?: string;
}

export const ManagerComparisonView: React.FC<ManagerComparisonViewProps> = ({
  currentMonthStart,
  setCurrentMonthStart,
  availabilities,
  schedules,
  employees,
  staffingTargets,
  analysisHoursRange,
  shiftPresets
}) => {
  const daysInMonth = useMemo(() => getDaysInMonth(currentMonthStart), [currentMonthStart]);
  const monthDates = useMemo(() => daysInMonth.map(d => formatDateString(d)), [daysInMonth]);
  const monthStr = useMemo(() => formatDateString(currentMonthStart).substring(0, 7), [currentMonthStart]);

  // Selection of whole month vs first half vs second half
  const [dateRangePart, setDateRangePart] = useState<'all' | 'part1' | 'part2'>('part1');

  const lastDayNum = useMemo(() => {
    return daysInMonth.length > 0 ? daysInMonth[daysInMonth.length - 1].getDate() : 31;
  }, [daysInMonth]);

  const displayedDaysInMonth = useMemo(() => {
    if (dateRangePart === 'part1') {
      return daysInMonth.filter(d => d.getDate() <= 15);
    }
    if (dateRangePart === 'part2') {
      return daysInMonth.filter(d => d.getDate() >= 16);
    }
    return daysInMonth;
  }, [daysInMonth, dateRangePart]);

  const displayedMonthDates = useMemo(() => {
    return displayedDaysInMonth.map(d => formatDateString(d));
  }, [displayedDaysInMonth]);

  // Collapsible state for each Excel table
  const [collapsedTables, setCollapsedTables] = useState<Record<string, boolean>>({
    manual: false,
    rule: false,
    ai: false,
    heatmap_manual: false,
    heatmap_rule: false,
    heatmap_ai: false
  });

  // View mode tab: Excel Grid vs Hourly Heatmap
  const [viewMode, setViewMode] = useState<'excel' | 'heatmap'>('excel');
  const [heatmapFilter, setHeatmapFilter] = useState<'all' | 'manual' | 'rule' | 'ai'>('all');

  const toggleTableCollapse = (key: string) => {
    setCollapsedTables(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // AI simulation state
  const [aiSchedules, setAiSchedules] = useState<ProposedAISchedule[] | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Clear AI simulation when month changes
  useEffect(() => {
    setAiSchedules(null);
    setAiError(null);
  }, [monthStr]);

  const handleMonthInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // "YYYY-MM"
    if (!val || !val.includes('-')) return;
    const [y, m] = val.split('-').map(Number);
    if (isNaN(y) || isNaN(m)) return;
    const newMonth = new Date(y, m - 1, 1);
    if (setCurrentMonthStart) {
      setCurrentMonthStart(newMonth);
    }
  };

  const handlePrevMonth = () => {
    const prev = new Date(currentMonthStart);
    prev.setMonth(prev.getMonth() - 1);
    if (setCurrentMonthStart) setCurrentMonthStart(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(currentMonthStart);
    next.setMonth(next.getMonth() + 1);
    if (setCurrentMonthStart) setCurrentMonthStart(next);
  };

  const handleGoToTodayMonth = () => {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (setCurrentMonthStart) setCurrentMonthStart(thisMonth);
  };

  // Filter existing schedules for this month (Manual / Live data)
  const manualMonthSchedules = useMemo(() => {
    return schedules.filter(s => s.date && s.date.startsWith(monthStr));
  }, [schedules, monthStr]);

  // Month availabilities
  const monthAvailabilities = useMemo(() => {
    return availabilities.filter(a => a.date && a.date.startsWith(monthStr));
  }, [availabilities, monthStr]);

  // Relevant active employees sorted by FT first, then PT
  const activeEmployees = useMemo(() => {
    return [...employees]
      .filter(e => e.active !== false)
      .sort((a, b) => {
        if (a.status === '正式夥伴' && b.status !== '正式夥伴') return -1;
        if (a.status !== '正式夥伴' && b.status === '正式夥伴') return 1;
        return a.name.localeCompare(b.name, 'zh-Hant');
      });
  }, [employees]);

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

  // 1. Compute Rule-based simulation purely in-memory
  const ruleResult = useMemo(() => {
    if (activeDateRange.length === 0) return { proposedSchedules: [] };

    return generateAutoSchedule(
      activeAvailabilities,
      manualMonthSchedules,
      employees,
      staffingTargets,
      analysisHoursRange,
      shiftPresets,
      {
        dateRange: activeDateRange,
        prioritizeFullTime: true,
        maxHoursPerShift: 8,
        onlyFillDeficits: false
      }
    );
  }, [activeDateRange, activeAvailabilities, manualMonthSchedules, employees, staffingTargets, analysisHoursRange, shiftPresets]);

  const ruleSchedules = useMemo(() => {
    const simulatedRuleShifts: WorkSchedule[] = ruleResult.proposedSchedules.map((p, idx) => ({
      id: `sim-rule-${idx}`,
      title: p.employeeName,
      employeeName: p.employeeName,
      date: p.date,
      workplace: p.workplace,
      startTime: p.startTime,
      endTime: p.endTime,
      color: p.color,
      createdAt: Date.now(),
      scheduleSource: 'rule'
    }));

    return [...manualMonthSchedules, ...simulatedRuleShifts];
  }, [manualMonthSchedules, ruleResult]);

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
          a => dates.includes(a.date) && a.confirmed !== true && activeEmployeeNames.has(a.employeeName.trim().toLowerCase())
        );
      };

      let allProposed: ProposedAISchedule[] = [];

      if (dateRangePart === 'part1') {
        const targetDates = daysInMonth.filter(d => d.getDate() <= 15).map(d => formatDateString(d));
        const targetAvail = filterEligibleAvailabilities(targetDates);
        allProposed = await runAIScheduler({
          modelName: 'gemini-3.1-flash-lite',
          dateRange: targetDates,
          availabilities: targetAvail,
          schedules: manualMonthSchedules,
          employees,
          staffingTargets,
          onlyFillDeficits: false
        });
      } else if (dateRangePart === 'part2') {
        const targetDates = daysInMonth.filter(d => d.getDate() >= 16).map(d => formatDateString(d));
        const targetAvail = filterEligibleAvailabilities(targetDates);
        allProposed = await runAIScheduler({
          modelName: 'gemini-3.1-flash-lite',
          dateRange: targetDates,
          availabilities: targetAvail,
          schedules: manualMonthSchedules,
          employees,
          staffingTargets,
          onlyFillDeficits: false
        });
      } else {
        // 'all' (1~31): split into two halves so each half fits comfortably in token budget
        const dates1 = daysInMonth.filter(d => d.getDate() <= 15).map(d => formatDateString(d));
        const avail1 = filterEligibleAvailabilities(dates1);
        const dates2 = daysInMonth.filter(d => d.getDate() >= 16).map(d => formatDateString(d));
        const avail2 = filterEligibleAvailabilities(dates2);

        const [p1, p2] = await Promise.all([
          runAIScheduler({
            modelName: 'gemini-3.1-flash-lite',
            dateRange: dates1,
            availabilities: avail1,
            schedules: manualMonthSchedules,
            employees,
            staffingTargets,
            onlyFillDeficits: false
          }),
          runAIScheduler({
            modelName: 'gemini-3.1-flash-lite',
            dateRange: dates2,
            availabilities: avail2,
            schedules: manualMonthSchedules,
            employees,
            staffingTargets,
            onlyFillDeficits: false
          })
        ]);
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
      scheduleSource: 'ai'
    }));

    return [...manualMonthSchedules, ...simulatedAiShifts];
  }, [aiSchedules, manualMonthSchedules]);

  // Helper to get target count for a given hour on dateStr
  const getStaffingTarget = (hour: number, dateStr: string): number => {
    const isWeekend = new Date(dateStr + 'T00:00:00').getDay() === 0 || new Date(dateStr + 'T00:00:00').getDay() === 6;
    const dateMatch = staffingTargets.find(t => t.hour === hour && t.date === dateStr);
    if (dateMatch) return dateMatch.targetCount;
    const globalMatch = staffingTargets.find(t => t.hour === hour && !t.date);
    let base = globalMatch ? globalMatch.targetCount : 2;
    if (isWeekend && hour >= 10 && hour < 15) {
      base += 1;
    }
    return base;
  };

  // Helper to compute stats for a schedule set within targetDates
  const computeStats = (scheduleList: WorkSchedule[] | null, targetDates: string[]) => {
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
      const maxCap = isWeekend ? 4 : 3;

      const openingCountH6 = scheduleList.filter(s => s.date === dateStr && isShiftActiveAtHour(s.startTime, s.endTime, 6)).length;
      const openingCountH7 = scheduleList.filter(s => s.date === dateStr && isShiftActiveAtHour(s.startTime, s.endTime, 7)).length;
      if (openingCountH6 >= 2 && openingCountH7 >= 2) {
        openingDaysMet++;
      }

      const closingCountH17 = scheduleList.filter(s => s.date === dateStr && isShiftActiveAtHour(s.startTime, s.endTime, 17)).length;
      if (closingCountH17 >= 2) {
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
        const dur = calculateDuration(s.startTime, s.endTime);
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

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const dateRangeDesc = dateRangePart === 'all'
        ? `全月 (1~${lastDayNum}日)`
        : dateRangePart === 'part1'
        ? '上半月 (1~15日)'
        : `下半月 (16~${lastDayNum}日)`;

      await exportComparisonToExcel({
        monthStr,
        dateRangeDesc,
        displayedDaysInMonth,
        activeEmployees,
        manualSchedules: manualMonthSchedules,
        ruleSchedules,
        aiSchedules: aiCombinedSchedules,
        manualStats,
        ruleStats,
        aiStats
      });
    } catch (err) {
      console.error('Export comparison to excel failed:', err);
      alert('匯出 Excel 發生錯誤，請稍後重試。');
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Helper to render an Excel-like Schedule Grid (Stacked One on Top of Each Other)
   */
  const renderExcelScheduleGrid = (
    key: 'manual' | 'rule' | 'ai',
    title: string,
    subtitle: string,
    badgeText: string,
    badgeColor: string,
    cardBorderColor: string,
    cellTheme: 'emerald' | 'blue' | 'purple',
    scheduleList: WorkSchedule[] | null,
    stats: any
  ) => {
    const isCollapsed = collapsedTables[key];

    // Theme colors mapping
    const themeClasses = {
      emerald: {
        badgeBg: 'bg-emerald-600',
        cellBg: 'bg-emerald-50 text-emerald-900 border-emerald-300',
        headerBg: 'bg-emerald-50/70 text-emerald-950',
        summaryBg: 'bg-emerald-50/40 text-emerald-900 font-bold',
        accentText: 'text-emerald-800'
      },
      blue: {
        badgeBg: 'bg-blue-600',
        cellBg: 'bg-blue-50 text-blue-900 border-blue-300',
        headerBg: 'bg-blue-50/70 text-blue-950',
        summaryBg: 'bg-blue-50/40 text-blue-900 font-bold',
        accentText: 'text-blue-800'
      },
      purple: {
        badgeBg: 'bg-purple-600',
        cellBg: 'bg-purple-50 text-purple-900 border-purple-300',
        headerBg: 'bg-purple-50/70 text-purple-950',
        summaryBg: 'bg-purple-50/40 text-purple-900 font-bold',
        accentText: 'text-purple-800'
      }
    }[cellTheme];

    // Quick map: (empName_dateStr) -> WorkSchedule[]
    const scheduleLookup: Record<string, WorkSchedule[]> = {};
    if (scheduleList) {
      scheduleList.forEach(s => {
        const lookupKey = `${s.employeeName.trim().toLowerCase()}_${s.date}`;
        if (!scheduleLookup[lookupKey]) scheduleLookup[lookupKey] = [];
        scheduleLookup[lookupKey].push(s);
      });
    }

    return (
      <div className={`glass-panel rounded-2xl border ${cardBorderColor} shadow-md bg-white/95 overflow-hidden transition-all duration-200`}>
        {/* Table Title Bar */}
        <div className={`p-4 border-b border-[#DAC0A3]/50 flex flex-wrap items-center justify-between gap-3 ${themeClasses.headerBg}`}>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-lg text-white font-black text-xs shadow-xs ${themeClasses.badgeBg}`}>
              {badgeText}
            </span>
            <div>
              <h3 className="text-base font-black text-[#3E2723] flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs font-bold text-[#6D4C41] font-normal">
                  ({subtitle})
                </span>
              </h3>
            </div>
          </div>

          {/* Quick Metrics & Collapse Toggle */}
          <div className="flex items-center gap-3">
            {stats && (
              <div className="hidden sm:flex items-center gap-2.5 text-xs text-[#5D4037] font-semibold bg-white/80 px-3 py-1.5 rounded-xl border border-[#DAC0A3]/40 shadow-xs">
                <span>總班次: <strong className="font-mono text-[#3E2723]">{stats.totalShifts}</strong></span>
                <span className="text-[#DAC0A3]">|</span>
                <span>總工時: <strong className="font-mono text-[#795548]">{stats.totalLaborHours} hrs</strong></span>
                <span className="text-[#DAC0A3]">|</span>
                <span>缺額: <strong className={`font-mono ${stats.deficitHoursCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{stats.deficitHoursCount}h</strong></span>
              </div>
            )}

            <button
              type="button"
              onClick={() => toggleTableCollapse(key)}
              className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-[#6D4C41] hover:text-[#3E2723] border border-[#DAC0A3]/50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>{isCollapsed ? '展開表單 ▼' : '收合表單 ▲'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Content */}
        {!isCollapsed && (
          <div className="p-3">
            {!scheduleList ? (
              <div className="p-8 text-center text-xs text-[#8D6E63] space-y-2">
                <span className="text-2xl block">🤖</span>
                <p className="font-bold text-[#5D4037]">尚未執行 Gemini AI 模擬比對</p>
                <p>請點擊頁面頂部的「⚡ 執行排班比對 (含 AI 模擬)」按鈕開始運算。</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-w-full pb-2">
                <table className="w-full text-xs text-left border-collapse border border-[#DAC0A3]/40 min-w-[950px] select-none">
                  {/* Table Header: Dates */}
                  <thead>
                    <tr className="bg-[#FAF7F2] border-b border-[#DAC0A3]/60 text-[#5D4037]">
                      {/* Fixed Employee Name Header */}
                      <th className="py-2.5 px-3 font-extrabold w-36 min-w-[130px] border-r border-[#DAC0A3]/40 sticky left-0 z-10 bg-[#F3EDE2] shadow-xs">
                        人員姓名
                      </th>

                      {/* Date Columns */}
                      {displayedDaysInMonth.map(dateObj => {
                        const dayNum = dateObj.getDate();
                        const dayOfWeek = dateObj.getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const dayLabel = DAYS_OF_WEEK.find(d => d.value === (dayOfWeek === 0 ? 7 : dayOfWeek))?.name || '';

                        return (
                          <th
                            key={dayNum}
                            className={`py-2 px-1 text-center font-bold min-w-[62px] border-r border-[#DAC0A3]/30 ${
                              isWeekend ? 'bg-amber-500/15 text-amber-950 font-black' : ''
                            }`}
                          >
                            <div className="text-xs font-mono font-black">{dayNum}日</div>
                            <div className="text-[10px] text-[#8D6E63]">{dayLabel}</div>
                          </th>
                        );
                      })}

                      {/* Total Hours Header */}
                      <th className="py-2.5 px-3 text-center font-extrabold w-24 min-w-[85px] bg-[#FAF7F2] text-[#3E2723]">
                        總工時
                      </th>
                    </tr>
                  </thead>

                  {/* Table Body: Employees */}
                  <tbody className="divide-y divide-[#DAC0A3]/30">
                    {activeEmployees.map((emp, empIdx) => {
                      let empTotalHours = 0;

                      return (
                        <tr
                          key={emp.id || emp.name}
                          className={`hover:bg-amber-50/20 transition-colors ${
                            empIdx % 2 === 0 ? 'bg-white' : 'bg-[#FAF7F2]/30'
                          }`}
                        >
                          {/* Sticky Employee Name & Badge */}
                          <td className="py-2 px-3 border-r border-[#DAC0A3]/40 font-bold sticky left-0 z-10 bg-[#FAF7F2] shadow-xs">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-extrabold text-[#3E2723] truncate">{emp.name}</span>
                              <span className={`text-[9px] px-1 py-0.2 rounded font-bold shrink-0 ${
                                emp.status === '正式夥伴' ? 'bg-[#795548] text-white' : 'bg-[#DAC0A3]/40 text-[#6D4C41]'
                              }`}>
                                {emp.status === '正式夥伴' ? '正職' : '兼職'}
                              </span>
                            </div>
                          </td>

                          {/* Daily Shift Cells */}
                          {displayedDaysInMonth.map(dateObj => {
                            const dateStr = formatDateString(dateObj);
                            const lookupKey = `${emp.name.trim().toLowerCase()}_${dateStr}`;
                            const shifts = scheduleLookup[lookupKey] || [];

                            let cellContent = <span className="text-[#DAC0A3] font-mono text-[10px]">—</span>;

                            if (shifts.length > 0) {
                              shifts.forEach(s => {
                                if (s.startTime && s.endTime) {
                                  empTotalHours += calculateDuration(s.startTime, s.endTime);
                                }
                              });

                              cellContent = (
                                <div className="flex flex-col gap-1 items-center justify-center">
                                  {shifts.map((s, idx) => {
                                    const dur = s.startTime && s.endTime ? calculateDuration(s.startTime, s.endTime) : 0;
                                    const isOvertime = s.startTime && s.endTime && isOverEightHours(s.startTime, s.endTime);

                                    return (
                                      <div
                                        key={idx}
                                        className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold leading-tight shadow-2xs whitespace-nowrap ${themeClasses.cellBg} ${
                                          isOvertime ? 'ring-1 ring-rose-500' : ''
                                        }`}
                                        title={`${emp.name} (${dateStr})\n班次: ${s.startTime}-${s.endTime} (${dur}h)`}
                                      >
                                        <div>{s.startTime}-{s.endTime}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }

                            return (
                              <td
                                key={dateStr}
                                className="py-1.5 px-1 border-r border-[#DAC0A3]/30 text-center align-middle"
                              >
                                {cellContent}
                              </td>
                            );
                          })}

                          {/* Employee Total Hours */}
                          <td className="py-2 px-2 text-center font-mono font-black text-xs text-[#795548] bg-[#FAF7F2]/40">
                            {Math.round(empTotalHours * 10) / 10}h
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Summary Rows (Like Excel bottom summary) */}
                  <tfoot>
                    {/* Row 1: Daily Working Headcount */}
                    <tr className="bg-[#FAF7F2] border-t-2 border-[#DAC0A3]/60">
                      <td className="py-2 px-3 font-extrabold text-[#5D4037] border-r border-[#DAC0A3]/40 sticky left-0 z-10 bg-[#FAF7F2] shadow-xs">
                        出勤人數 (人)
                      </td>
                      {displayedDaysInMonth.map(dateObj => {
                        const dateStr = formatDateString(dateObj);
                        const workersCount = activeEmployees.filter(emp => {
                          const lookupKey = `${emp.name.trim().toLowerCase()}_${dateStr}`;
                          return (scheduleLookup[lookupKey] || []).length > 0;
                        }).length;

                        return (
                          <td key={dateStr} className="py-2 px-1 text-center font-mono font-bold text-xs border-r border-[#DAC0A3]/30 text-[#3E2723]">
                            {workersCount}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center font-mono font-bold text-xs text-[#3E2723]">
                        -
                      </td>
                    </tr>

                    {/* Row 2: Opening Shift Headcount */}
                    <tr className="bg-white border-t border-[#DAC0A3]/30 text-[11px]">
                      <td className="py-1.5 px-3 font-bold text-[#6D4C41] border-r border-[#DAC0A3]/40 sticky left-0 z-10 bg-white shadow-xs">
                        開早人數 (06-08)
                      </td>
                      {displayedDaysInMonth.map(dateObj => {
                        const dateStr = formatDateString(dateObj);
                        const count = scheduleList ? scheduleList.filter(s => s.date === dateStr && isShiftActiveAtHour(s.startTime, s.endTime, 6)).length : 0;
                        return (
                          <td key={dateStr} className={`py-1.5 px-1 text-center font-mono font-bold border-r border-[#DAC0A3]/30 ${count >= 2 ? 'text-emerald-700' : 'text-rose-700 font-extrabold'}`}>
                            {count}
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-2 text-center font-mono text-[10px] text-[#8D6E63]">
                        目標:2
                      </td>
                    </tr>

                    {/* Row 3: Closing Shift Headcount */}
                    <tr className="bg-white border-t border-[#DAC0A3]/30 text-[11px]">
                      <td className="py-1.5 px-3 font-bold text-[#6D4C41] border-r border-[#DAC0A3]/40 sticky left-0 z-10 bg-white shadow-xs">
                        收班人數 (17-20)
                      </td>
                      {displayedDaysInMonth.map(dateObj => {
                        const dateStr = formatDateString(dateObj);
                        const count = scheduleList ? scheduleList.filter(s => s.date === dateStr && isShiftActiveAtHour(s.startTime, s.endTime, 17)).length : 0;
                        return (
                          <td key={dateStr} className={`py-1.5 px-1 text-center font-mono font-bold border-r border-[#DAC0A3]/30 ${count >= 2 ? 'text-emerald-700' : 'text-rose-700 font-extrabold'}`}>
                            {count}
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-2 text-center font-mono text-[10px] text-[#8D6E63]">
                        目標:2
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /**
   * Helper to render an Hourly Heatmap Grid (Matching ManagerAnalysisView display)
   */
  const renderHourlyHeatmapGrid = (
    key: 'manual' | 'rule' | 'ai',
    title: string,
    subtitle: string,
    badgeText: string,
    themeClasses: {
      badgeBg: string;
      headerBg: string;
    },
    cardBorderColor: string,
    scheduleList: WorkSchedule[] | null,
    stats: any
  ) => {
    const isCollapsed = collapsedTables[`heatmap_${key}`];

    return (
      <div className={`glass-panel rounded-2xl border ${cardBorderColor} shadow-md bg-white/95 overflow-hidden transition-all duration-200`}>
        {/* Table Title Bar */}
        <div className={`p-4 border-b border-[#DAC0A3]/50 flex flex-wrap items-center justify-between gap-3 ${themeClasses.headerBg}`}>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-lg text-white font-black text-xs shadow-xs ${themeClasses.badgeBg}`}>
              {badgeText}
            </span>
            <div>
              <h3 className="text-base font-black text-[#3E2723] flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs font-bold text-[#6D4C41] font-normal">
                  ({subtitle})
                </span>
              </h3>
            </div>
          </div>

          {/* Quick Metrics & Collapse Toggle */}
          <div className="flex items-center gap-3">
            {stats && (
              <div className="hidden sm:flex items-center gap-2.5 text-xs text-[#5D4037] font-semibold bg-white/80 px-3 py-1.5 rounded-xl border border-[#DAC0A3]/40 shadow-xs">
                <span>總班次: <strong className="font-mono text-[#3E2723]">{stats.totalShifts}</strong></span>
                <span className="text-[#DAC0A3]">|</span>
                <span>總工時: <strong className="font-mono text-[#795548]">{stats.totalLaborHours} hrs</strong></span>
                <span className="text-[#DAC0A3]">|</span>
                <span>缺額: <strong className={`font-mono ${stats.deficitHoursCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{stats.deficitHoursCount}h</strong></span>
              </div>
            )}

            <button
              type="button"
              onClick={() => toggleTableCollapse(`heatmap_${key}`)}
              className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-[#6D4C41] hover:text-[#3E2723] border border-[#DAC0A3]/50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>{isCollapsed ? '展開圖表 ▼' : '收合圖表 ▲'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Content */}
        {!isCollapsed && (
          <div className="p-4">
            {!scheduleList ? (
              <div className="p-8 text-center text-xs text-[#8D6E63] space-y-2">
                <span className="text-2xl block">🤖</span>
                <p className="font-bold text-[#5D4037]">尚未執行 Gemini AI 模擬比對</p>
                <p>請點擊頁面頂部的「⚡ 執行排班比對 (含 AI 模擬)」按鈕開始運算。</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-w-full">
                <div className="min-w-[950px] select-none pb-4">
                  {/* Header Row: Days of Month */}
                  <div className="flex items-center border-b border-[#DAC0A3]/30 pb-2.5 pt-1 px-2">
                    <div className="w-32 sm:w-36 shrink-0 text-xs font-extrabold text-[#6D4C41] flex items-center pl-2">
                      時段 \ 日期
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      {displayedDaysInMonth.map((dateObj) => {
                        const dNum = dateObj.getDate();
                        const dayIndex = dateObj.getDay();
                        const dayName = DAYS_OF_WEEK[dayIndex === 0 ? 6 : dayIndex - 1]?.name?.substring(1) || '';
                        const isWeekend = dayIndex === 0 || dayIndex === 6;
                        return (
                          <div key={dNum} className={`w-7 sm:w-8 shrink-0 text-center flex flex-col items-center ${isWeekend ? 'text-red-700 font-bold' : 'text-[#6D4C41]'}`}>
                            <span className="text-[12px] sm:text-[13px] font-mono font-bold leading-none">{dNum}</span>
                            <span className="text-[10px] font-extrabold mt-0.5 opacity-90">{dayName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Hour Rows */}
                  <div className="divide-y divide-[#DAC0A3]/20 mt-1">
                    {analysisHoursRange.map(hour => {
                      const hourStr = `${hour.toString().padStart(2, '0')}:30 - ${(hour + 1).toString().padStart(2, '0')}:30`;
                      return (
                        <div key={hour} className="flex items-center py-1.5 px-2 hover:bg-[#FAF7F2]/45 transition-colors">
                          <div className="w-32 sm:w-36 shrink-0 text-[11px] font-mono font-bold text-[#6D4C41] flex items-center pl-2">
                            ⏰ {hourStr}
                          </div>

                          <div className="flex items-center gap-1 sm:gap-1.5">
                            {displayedDaysInMonth.map((dateObj, dIdx, arr) => {
                              const dateStr = formatDateString(dateObj);
                              const daySchedules = scheduleList.filter(s => s.date === dateStr);
                              const workers = daySchedules.filter(s => isShiftActiveAtHour(s.startTime, s.endTime, hour));
                              const count = workers.length;
                              const target = getStaffingTarget(hour, dateStr);
                              const isUnder = target > 0 && count < target;
                              const workerNames = workers.map(w => w.employeeName);

                              let bgStyle = 'bg-white border-[#DAC0A3]/45 text-[#3E2723]/50';
                              if (count === 2) {
                                bgStyle = 'bg-emerald-500 border-emerald-600 text-white font-bold';
                              } else if (count === 3) {
                                bgStyle = 'bg-blue-500 border-blue-600 text-white font-bold';
                              } else if (count === 4) {
                                bgStyle = 'bg-yellow-400 border-yellow-500 text-yellow-950 font-bold';
                              } else if (count === 5) {
                                bgStyle = 'bg-red-500 border-red-600 text-white font-bold';
                              } else if (count >= 6) {
                                bgStyle = 'bg-purple-600 border-purple-700 text-white font-bold';
                              }

                              const tooltipAlignClass = getTooltipAlignment(dIdx, arr.length);
                              const tooltipArrowAlignClass = getTooltipArrowAlignment(dIdx, arr.length);

                              return (
                                <div
                                  key={dateStr}
                                  className={`w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded flex items-center justify-center text-[10px] sm:text-[11px] font-mono border relative group transition-all duration-200 hover:scale-110 shadow-2xs ${bgStyle} ${
                                    isUnder ? 'ring-1.5 ring-red-500 ring-offset-0.5' : ''
                                  }`}
                                >
                                  {count > 0 ? count : '-'}

                                  {/* Tooltip */}
                                  <div className={`absolute bottom-full mb-2 w-52 hidden group-hover:block bg-[#3E2723] text-white text-[11px] p-2.5 rounded-lg shadow-lg z-30 pointer-events-none text-left leading-normal font-sans border border-[#FAF7F2]/10 ${tooltipAlignClass}`}>
                                    <div className="font-extrabold border-b border-[#FAF7F2]/20 pb-1.5 mb-1.5 flex items-center justify-between">
                                      <span>📅 {dateObj.getMonth() + 1}月{dateObj.getDate()}日</span>
                                      <span className="font-mono text-[9px] bg-[#795548] px-1 rounded text-[#FAF7F2]">{hourStr}</span>
                                    </div>
                                    <div className="space-y-1">
                                      <div>👥 在勤人數: <span className="font-bold text-[#EADBC8] font-mono text-xs">{count}</span> 人</div>
                                      {target > 0 && (
                                        <div>🎯 目標人數: <span className="font-bold font-mono text-xs">{target}</span> 人 {isUnder && <span className="text-red-400 font-extrabold ml-1">(不足!)</span>}</div>
                                      )}
                                      {count > 0 && (
                                        <div className="mt-1.5 pt-1.5 border-t border-[#FAF7F2]/10 text-white/95">
                                          <div className="font-semibold text-white/70 mb-0.5">名單：</div>
                                          <div className="flex flex-wrap gap-1">
                                            {workerNames.map((name, wIdx) => {
                                              const emp = employees.find(e => e.name.trim().toLowerCase() === name.trim().toLowerCase());
                                              const isFt = emp?.status === '正式夥伴';
                                              return (
                                                <span key={wIdx} className={`px-1 py-0.2 rounded text-[10px] ${isFt ? 'bg-[#795548] text-white' : 'bg-[#FAF7F2]/15 text-[#EADBC8]'}`}>
                                                  {name}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className={`absolute top-full border-4 border-transparent border-t-[#3E2723] ${tooltipArrowAlignClass}`}></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Chart Legend */}
                  <div className="flex flex-wrap items-center justify-between border-t border-[#DAC0A3]/25 pt-4 mt-2 gap-4">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#6D4C41]">
                      <span className="font-extrabold text-[#3E2723]">顏色圖例 (人數):</span>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded border border-[#DAC0A3]/45 bg-white flex items-center justify-center text-[9px] text-[#3E2723]/50">-</span>
                        <span>0-1 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded border border-emerald-600 bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">2</span>
                        <span>2 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded border border-blue-600 bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">3</span>
                        <span>3 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded border border-yellow-500 bg-yellow-400 text-yellow-950 text-[9px] font-bold flex items-center justify-center">4</span>
                        <span>4 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded border border-red-600 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">5</span>
                        <span>5 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded border border-purple-700 bg-purple-600 text-white text-[9px] font-bold flex items-center justify-center">6+</span>
                        <span>6+ 人</span>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <span className="w-3.5 h-3.5 rounded border border-red-500 ring-1 ring-red-500 bg-white"></span>
                        <span className="text-red-700 font-bold">紅框表示人數未達目標 (不足)</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-[#8D6E63] italic">
                      💡 將滑鼠游標移至格子上可預覽當小時班表同仁名單與目標。
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in text-[#3E2723]">
      {/* 1. Admin Top Banner & Controls Card */}
      <div className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/60 shadow-sm bg-white/85 space-y-4">
        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DAC0A3]/40 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center font-bold text-base shadow-sm">
              📊
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-[#3E2723]">
                  排班比對分析 (Excel 網格上下並列對比)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-600 text-white shadow-xs">
                  👑 最高管理員專屬
                </span>
              </div>
              <p className="text-[11px] text-[#6D4C41]">
                以 Excel 試算表格式（人員 x 日期班次）上下依序展示三大排班結果，方便直觀捲動與橫向逐日比對。
              </p>
            </div>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Left: Month picker & segment buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Month Picker */}
            <div className="flex items-center gap-1.5 bg-[#FAF7F2] border border-[#DAC0A3]/70 px-2.5 py-1.5 rounded-xl shadow-xs">
              <span className="text-xs font-bold text-[#5D4037] flex items-center gap-1">
                <span>📅</span> 月份:
              </span>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded hover:bg-white text-[#6D4C41] transition-colors cursor-pointer"
                title="前一個月"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <input
                type="month"
                value={monthStr}
                onChange={handleMonthInputChange}
                className="bg-white border border-[#DAC0A3]/70 text-xs font-bold px-2 py-0.5 rounded-md text-[#3E2723] outline-none cursor-pointer font-mono"
              />
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded hover:bg-white text-[#6D4C41] transition-colors cursor-pointer"
                title="後一個月"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleGoToTodayMonth}
                className="px-2 py-0.5 rounded text-[11px] font-bold text-[#795548] hover:bg-white border border-[#DAC0A3]/40 transition-colors cursor-pointer"
                title="回到本月"
              >
                本月
              </button>
            </div>

            {/* Date Range Part Segment (All, Part 1, Part 2) */}
            <div className="flex items-center gap-1 bg-[#FAF7F2] border border-[#DAC0A3]/70 p-1 rounded-xl shadow-xs">
              <button
                type="button"
                onClick={() => setDateRangePart('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  dateRangePart === 'all'
                    ? 'bg-[#795548] text-white shadow-xs font-black'
                    : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
                }`}
              >
                全月 <span className="text-[10px] opacity-75">(1~{lastDayNum})</span>
              </button>
              <button
                type="button"
                onClick={() => setDateRangePart('part1')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  dateRangePart === 'part1'
                    ? 'bg-[#795548] text-white shadow-xs font-black'
                    : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
                }`}
              >
                上半月 <span className="text-[10px] opacity-75">(1~15)</span>
              </button>
              <button
                type="button"
                onClick={() => setDateRangePart('part2')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  dateRangePart === 'part2'
                    ? 'bg-[#795548] text-white shadow-xs font-black'
                    : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
                }`}
              >
                下半月 <span className="text-[10px] opacity-75">(16~{lastDayNum})</span>
              </button>
            </div>
          </div>

          {/* Right: Actions (Export to Excel & Execute Simulation) */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#5D4037] bg-white border border-[#DAC0A3] hover:bg-[#FAF7F2] hover:border-[#BCAAA4] disabled:opacity-50 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              title="匯出含 KPI 總覽與三組排班工作表的 Excel 報表 (.xlsx)"
            >
              {isExporting ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-[#795548] border-t-transparent animate-spin"></span>
                  <span>匯出中...</span>
                </>
              ) : (
                <>
                  <span className="text-sm">📥</span>
                  <span>匯出比對 Excel</span>
                </>
              )}
            </button>

            <button
              onClick={handleRunAiSimulation}
              disabled={isAiLoading}
              className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-[#5D4037] via-[#795548] to-purple-800 hover:opacity-95 disabled:opacity-50 transition-all shadow-md active:translate-y-0 cursor-pointer flex items-center gap-2"
            >
              {isAiLoading ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                  <span>AI 比對演算中...</span>
                </>
              ) : (
                <>
                  <span className="text-sm">⚡</span>
                  <span>{aiSchedules ? '重新執行排班比對' : '執行排班比對 (含 AI 模擬)'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {aiError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold animate-fade-in flex items-center justify-between">
          <span>⚠️ {aiError}</span>
          <button onClick={() => setAiError(null)} className="text-rose-500 hover:text-rose-800 text-sm font-bold">✕</button>
        </div>
      )}

      {/* 2. Top Summary KPI Comparison Card */}
      <div className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/60 shadow-sm bg-white/85 space-y-3">
        <h3 className="text-sm font-extrabold text-[#3E2723] flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
          核心排班指標即時綜合評比 (KPI Summary)
          <span className="text-xs font-bold text-[#8D6E63] font-normal">
            [{monthStr} {dateRangePart === 'all' ? `全月 1~${lastDayNum}日` : dateRangePart === 'part1' ? '上半月 1~15日' : `下半月 16~${lastDayNum}日`}]
          </span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DAC0A3]/40 text-[#5D4037]">
                <th className="py-2 px-3 font-extrabold w-1/4">評估指標維度</th>
                <th className="py-2 px-3 font-extrabold w-1/4 bg-emerald-500/10 text-emerald-950 rounded-t-lg">
                  📋 手動現有排班 (現行實績)
                </th>
                <th className="py-2 px-3 font-extrabold w-1/4 bg-blue-500/10 text-blue-950 rounded-t-lg">
                  ⚙️ 程式規則演算法 (autoScheduler)
                </th>
                <th className="py-2 px-3 font-extrabold w-1/4 bg-purple-500/10 text-purple-950 rounded-t-lg">
                  🤖 Gemini AI 智慧排班
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DAC0A3]/30 font-medium">
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">總排定班次數</td>
                <td className="py-2 px-3 font-mono font-bold text-[#3E2723] bg-emerald-50/20">{manualStats?.totalShifts || 0} 班</td>
                <td className="py-2 px-3 font-mono font-bold text-[#3E2723] bg-blue-50/20">{ruleStats?.totalShifts || 0} 班</td>
                <td className="py-2 px-3 font-mono font-bold text-[#3E2723] bg-purple-50/20">{aiStats ? `${aiStats.totalShifts} 班` : <span className="text-[#8D6E63] italic">-</span>}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">總出勤工時 (人時)</td>
                <td className="py-2 px-3 font-mono font-extrabold text-[#795548] bg-emerald-50/20">{manualStats?.totalLaborHours || 0} hrs</td>
                <td className="py-2 px-3 font-mono font-extrabold text-[#1565C0] bg-blue-50/20">{ruleStats?.totalLaborHours || 0} hrs</td>
                <td className="py-2 px-3 font-mono font-extrabold text-[#6A1B9A] bg-purple-50/20">{aiStats ? `${aiStats.totalLaborHours} hrs` : <span className="text-[#8D6E63] italic">-</span>}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">時段缺額人時</td>
                <td className="py-2 px-3 font-mono font-bold bg-emerald-50/20">
                  <span className={`px-2 py-0.5 rounded-full ${manualStats && manualStats.deficitHoursCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {manualStats?.deficitHoursCount || 0}h 缺額
                  </span>
                </td>
                <td className="py-2 px-3 font-mono font-bold bg-blue-50/20">
                  <span className={`px-2 py-0.5 rounded-full ${ruleStats && ruleStats.deficitHoursCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {ruleStats?.deficitHoursCount || 0}h 缺額
                  </span>
                </td>
                <td className="py-2 px-3 font-mono font-bold bg-purple-50/20">
                  {aiStats ? (
                    <span className={`px-2 py-0.5 rounded-full ${aiStats.deficitHoursCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {aiStats.deficitHoursCount}h 缺額
                    </span>
                  ) : <span className="text-[#8D6E63] italic">-</span>}
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">開早達標率 (06-08 ≥2人)</td>
                <td className="py-2 px-3 font-mono font-bold bg-emerald-50/20">{manualStats ? `${manualStats.openingMetRate}%` : '-'}</td>
                <td className="py-2 px-3 font-mono font-bold bg-blue-50/20 text-blue-900">{ruleStats ? `${ruleStats.openingMetRate}%` : '-'}</td>
                <td className="py-2 px-3 font-mono font-bold bg-purple-50/20 text-purple-900">{aiStats ? `${aiStats.openingMetRate}%` : '-'}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">收班達標率 (17-20 ≥2人)</td>
                <td className="py-2 px-3 font-mono font-bold bg-emerald-50/20">{manualStats ? `${manualStats.closingMetRate}%` : '-'}</td>
                <td className="py-2 px-3 font-mono font-bold bg-blue-50/20 text-blue-900">{ruleStats ? `${ruleStats.closingMetRate}%` : '-'}</td>
                <td className="py-2 px-3 font-mono font-bold bg-purple-50/20 text-purple-900">{aiStats ? `${aiStats.closingMetRate}%` : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. View Mode Switcher: Excel Grid vs Hourly Heatmap */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DAC0A3]/50 pb-2 pt-2">
        <div className="flex items-center gap-2 bg-[#FAF7F2] p-1.5 rounded-xl border border-[#DAC0A3]/60 shadow-xs">
          <button
            type="button"
            onClick={() => setViewMode('excel')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'excel'
                ? 'bg-[#795548] text-white shadow-xs font-black'
                : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
            }`}
          >
            <span>📋</span>
            <span>人員排班表 (Excel 網格對比)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('heatmap')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'heatmap'
                ? 'bg-[#795548] text-white shadow-xs font-black'
                : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
            }`}
          >
            <span>⏰</span>
            <span>每小時人數分析圖 (時段熱力圖)</span>
          </button>
        </div>

        {viewMode === 'heatmap' && (
          <div className="flex items-center gap-1 bg-[#FAF7F2] p-1.5 rounded-xl border border-[#DAC0A3]/60 text-xs shadow-xs">
            <span className="text-[11px] font-bold text-[#6D4C41] px-2">顯示圖表:</span>
            <button
              type="button"
              onClick={() => setHeatmapFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                heatmapFilter === 'all' ? 'bg-[#795548] text-white shadow-xs font-black' : 'text-[#6D4C41] hover:bg-white'
              }`}
            >
              全部並列
            </button>
            <button
              type="button"
              onClick={() => setHeatmapFilter('manual')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                heatmapFilter === 'manual' ? 'bg-emerald-700 text-white shadow-xs font-black' : 'text-[#6D4C41] hover:bg-white'
              }`}
            >
              📋 手動實績
            </button>
            <button
              type="button"
              onClick={() => setHeatmapFilter('rule')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                heatmapFilter === 'rule' ? 'bg-blue-700 text-white shadow-xs font-black' : 'text-[#6D4C41] hover:bg-white'
              }`}
            >
              ⚙️ 程式規則
            </button>
            <button
              type="button"
              onClick={() => setHeatmapFilter('ai')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                heatmapFilter === 'ai' ? 'bg-purple-700 text-white shadow-xs font-black' : 'text-[#6D4C41] hover:bg-white'
              }`}
            >
              🤖 Gemini AI
            </button>
          </div>
        )}
      </div>

      {/* 4. Display Content: Excel Grids vs Hourly Heatmaps */}
      {viewMode === 'excel' ? (
        /* Excel Grids */
        <div className="space-y-6">
          {/* Table 1: Manual Live Schedules */}
          {renderExcelScheduleGrid(
            'manual',
            '📋 表格一：手動現有排班 (Manual Schedule)',
            '現行門市資料庫實績',
            '手動實績',
            'bg-emerald-700',
            'border-emerald-300',
            'emerald',
            manualMonthSchedules,
            manualStats
          )}

          {/* Table 2: Rule / Code Auto Schedules */}
          {renderExcelScheduleGrid(
            'rule',
            '⚙️ 表格二：程式規則演算法排班 (Rule Auto Schedule)',
            '由 autoScheduler 依據保早、保晚、尖峰封頂原則模擬',
            '程式規則',
            'bg-blue-700',
            'border-blue-300',
            'blue',
            ruleSchedules,
            ruleStats
          )}

          {/* Table 3: Gemini AI Schedules */}
          {renderExcelScheduleGrid(
            'ai',
            '🤖 表格三：Gemini AI 智慧排班 (Gemini AI Schedule)',
            '由 Gemini 模型根據自然語言指示與同仁登記備註生成',
            'Gemini AI',
            'bg-purple-700',
            'border-purple-300',
            'purple',
            aiCombinedSchedules,
            aiStats
          )}
        </div>
      ) : (
        /* Hourly Heatmap Grids */
        <div className="space-y-6">
          {(heatmapFilter === 'all' || heatmapFilter === 'manual') &&
            renderHourlyHeatmapGrid(
              'manual',
              '📋 圖表一：手動現有排班 (Manual Schedule) - 每小時在勤人數分析',
              '現行門市資料庫實績各小時在勤人數與缺額分析',
              '手動實績',
              { badgeBg: 'bg-emerald-700', headerBg: 'bg-emerald-50/70' },
              'border-emerald-300',
              manualMonthSchedules,
              manualStats
            )
          }

          {(heatmapFilter === 'all' || heatmapFilter === 'rule') &&
            renderHourlyHeatmapGrid(
              'rule',
              '⚙️ 圖表二：程式規則演算法 (Rule Auto Schedule) - 每小時在勤人數分析',
              '由 autoScheduler 模擬產生之各小時在勤人數與缺額分析',
              '程式規則',
              { badgeBg: 'bg-blue-700', headerBg: 'bg-blue-50/70' },
              'border-blue-300',
              ruleSchedules,
              ruleStats
            )
          }

          {(heatmapFilter === 'all' || heatmapFilter === 'ai') &&
            renderHourlyHeatmapGrid(
              'ai',
              '🤖 圖表三：Gemini AI 智慧排班 (Gemini AI Schedule) - 每小時在勤人數分析',
              '由 Gemini 模型模擬產生之各小時在勤人數與缺額分析',
              'Gemini AI',
              { badgeBg: 'bg-purple-700', headerBg: 'bg-purple-50/70' },
              'border-purple-300',
              aiCombinedSchedules,
              aiStats
            )
          }
        </div>
      )}
    </div>
  );
};
