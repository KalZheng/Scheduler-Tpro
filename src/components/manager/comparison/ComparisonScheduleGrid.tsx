import React from 'react';
import type { WorkSchedule, Employee, StaffingDemandConfig } from '../../../services/scheduler';
import {
  formatDateString,
  calculateDuration,
  calculateEffectiveWorkHours,
  isOverEightHours,
  getUnstaffedOperatingGaps
} from '../../../utils/dateUtils';
import { DAYS_OF_WEEK } from '../../../utils/constants';
import type { ComparisonStats } from '../../../hooks/useComparisonSimulation';

export interface ComparisonScheduleGridProps {
  keyId: 'manual' | 'rule' | 'ai';
  title: string;
  subtitle: string;
  badgeText: string;
  badgeColor?: string;
  cardBorderColor: string;
  cellTheme: 'emerald' | 'blue' | 'purple' | 'amber';
  scheduleList: WorkSchedule[] | null;
  stats: ComparisonStats | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  displayedDaysInMonth: Date[];
  activeEmployees: Employee[];
  staffingDemandConfig?: StaffingDemandConfig;
  operatingStartTime?: string;
  operatingEndTime?: string;
  timeToMins: (t?: string) => number;
}

export const ComparisonScheduleGrid: React.FC<ComparisonScheduleGridProps> = ({
  title,
  subtitle,
  badgeText,
  cardBorderColor,
  cellTheme,
  scheduleList,
  stats,
  isCollapsed,
  onToggleCollapse,
  displayedDaysInMonth,
  activeEmployees,
  staffingDemandConfig,
  operatingStartTime,
  operatingEndTime,
  timeToMins
}) => {
  // Theme colors mapping
  const themeClasses = {
    emerald: {
      badgeBg: 'bg-emerald-600',
      cellBg: 'bg-emerald-50 text-emerald-900 border-emerald-300',
      headerBg: 'bg-emerald-50/70 text-emerald-950',
      summaryBg: 'bg-emerald-50/40 text-emerald-900 font-bold',
      accentText: 'text-emerald-800'
    },
    amber: {
      badgeBg: 'bg-amber-600',
      cellBg: 'bg-amber-50 text-amber-900 border-amber-300',
      headerBg: 'bg-amber-50/70 text-amber-950',
      summaryBg: 'bg-amber-50/40 text-amber-900 font-bold',
      accentText: 'text-amber-800'
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
            onClick={onToggleCollapse}
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
                              emp.status === '正式夥伴'
                                ? 'bg-[#795548] text-white'
                                : emp.isOverseasStudent
                                ? 'bg-amber-600 text-white'
                                : 'bg-[#DAC0A3]/40 text-[#6D4C41]'
                            }`}>
                              {emp.status === '正式夥伴' ? '正職' : emp.isOverseasStudent ? '僑生' : '兼職'}
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
                                empTotalHours += calculateEffectiveWorkHours(s.startTime, s.endTime);
                              }
                            });

                            cellContent = (
                              <div className="flex flex-col gap-1 items-center justify-center">
                                {shifts.map((s, idx) => {
                                  const netDur = s.startTime && s.endTime ? calculateEffectiveWorkHours(s.startTime, s.endTime) : 0;
                                  const rawDur = s.startTime && s.endTime ? calculateDuration(s.startTime, s.endTime) : 0;
                                  const isOvertime = s.startTime && s.endTime && isOverEightHours(s.startTime, s.endTime);

                                  return (
                                    <div
                                      key={idx}
                                      className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold leading-tight shadow-2xs whitespace-nowrap ${themeClasses.cellBg} ${
                                        isOvertime ? 'ring-1 ring-rose-500' : ''
                                      }`}
                                      title={`${emp.name} (${dateStr})\n班次: ${s.startTime}-${s.endTime}\n實質工時: ${netDur}h (排定${rawDur}h, 休息${Math.round((rawDur - netDur) * 10) / 10}h)`}
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
                      {(() => {
                        let totalHeadcountSum = 0;
                        displayedDaysInMonth.forEach(dateObj => {
                          const dateStr = formatDateString(dateObj);
                          totalHeadcountSum += activeEmployees.filter(emp => {
                            const lookupKey = `${emp.name.trim().toLowerCase()}_${dateStr}`;
                            return (scheduleLookup[lookupKey] || []).length > 0;
                          }).length;
                        });
                        return `${totalHeadcountSum} 人次`;
                      })()}
                    </td>
                  </tr>

                  {/* Row 2: Daily Total Work Hours (當日總工時) */}
                  <tr className="bg-[#FAF7F2]/60 border-t border-[#DAC0A3]/40 text-xs">
                    <td className="py-2 px-3 font-extrabold text-[#5D4037] border-r border-[#DAC0A3]/40 sticky left-0 z-10 bg-[#FAF7F2] shadow-xs">
                      當日總工時 (h)
                    </td>
                    {displayedDaysInMonth.map(dateObj => {
                      const dateStr = formatDateString(dateObj);
                      let dayHours = 0;
                      activeEmployees.forEach(emp => {
                        const lookupKey = `${emp.name.trim().toLowerCase()}_${dateStr}`;
                        const shifts = scheduleLookup[lookupKey] || [];
                        shifts.forEach(s => {
                          if (s.startTime && s.endTime) {
                            dayHours += calculateEffectiveWorkHours(s.startTime, s.endTime);
                          }
                        });
                      });

                      return (
                        <td key={dateStr} className="py-2 px-1 text-center font-mono font-bold text-xs border-r border-[#DAC0A3]/30 text-[#795548]">
                          {dayHours > 0 ? `${Math.round(dayHours * 10) / 10}h` : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-center font-mono font-black text-xs text-[#795548]">
                      {(() => {
                        let totalPeriodHours = 0;
                        displayedDaysInMonth.forEach(dateObj => {
                          const dateStr = formatDateString(dateObj);
                          activeEmployees.forEach(emp => {
                            const lookupKey = `${emp.name.trim().toLowerCase()}_${dateStr}`;
                            const shifts = scheduleLookup[lookupKey] || [];
                            shifts.forEach(s => {
                              if (s.startTime && s.endTime) {
                                totalPeriodHours += calculateEffectiveWorkHours(s.startTime, s.endTime);
                              }
                            });
                          });
                        });
                        return `${Math.round(totalPeriodHours * 10) / 10}h`;
                      })()}
                    </td>
                  </tr>

                  {/* Row 2: Opening Shift Headcount */}
                  <tr className="bg-white border-t border-[#DAC0A3]/30 text-[11px]">
                    <td className="py-1.5 px-3 font-bold text-[#6D4C41] border-r border-[#DAC0A3]/40 sticky left-0 z-10 bg-white shadow-xs">
                      開早人數 (前30分)
                    </td>
                    {displayedDaysInMonth.map(dateObj => {
                      const dateStr = formatDateString(dateObj);
                      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                      const dayOpenStart = isWeekend
                        ? (staffingDemandConfig?.operatingStartTimeWeekend || '06:30')
                        : (operatingStartTime || '06:30');
                      const opStartM = timeToMins(dayOpenStart);
                      const openTarget = staffingDemandConfig?.openingStaffCount ?? 1;

                      const count = scheduleList
                        ? scheduleList.filter(s =>
                            s.date === dateStr &&
                            timeToMins(s.startTime) <= opStartM &&
                            timeToMins(s.endTime) >= opStartM + 30
                          ).length
                        : 0;

                      return (
                        <td key={dateStr} className={`py-1.5 px-1 text-center font-mono font-bold border-r border-[#DAC0A3]/30 ${count >= openTarget ? 'text-emerald-700' : 'text-rose-700 font-extrabold'}`}>
                          {count}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2 text-center font-mono text-[10px] text-[#8D6E63]">
                      目標:{staffingDemandConfig?.openingStaffCount ?? 1}
                    </td>
                  </tr>

                  {/* Row 3: Closing Shift Headcount */}
                  <tr className="bg-white border-t border-[#DAC0A3]/30 text-[11px]">
                    <td className="py-1.5 px-3 font-bold text-[#6D4C41] border-r border-[#DAC0A3]/40 sticky left-0 z-10 bg-white shadow-xs">
                      收班人數 (後30分)
                    </td>
                    {displayedDaysInMonth.map(dateObj => {
                      const dateStr = formatDateString(dateObj);
                      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                      const dayCloseEnd = isWeekend
                        ? (staffingDemandConfig?.operatingEndTimeWeekend || '18:30')
                        : (operatingEndTime || '20:00');
                      const opEndM = timeToMins(dayCloseEnd);
                      const closeTarget = staffingDemandConfig?.closingStaffCount ?? 1;

                      const count = scheduleList
                        ? scheduleList.filter(s =>
                            s.date === dateStr &&
                            timeToMins(s.startTime) <= opEndM - 30 &&
                            timeToMins(s.endTime) >= opEndM
                          ).length
                        : 0;

                      return (
                        <td key={dateStr} className={`py-1.5 px-1 text-center font-mono font-bold border-r border-[#DAC0A3]/30 ${count >= closeTarget ? 'text-emerald-700' : 'text-rose-700 font-extrabold'}`}>
                          {count}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2 text-center font-mono text-[10px] text-[#8D6E63]">
                      目標:{staffingDemandConfig?.closingStaffCount ?? 1}
                    </td>
                  </tr>

                  {/* Row 5: Unstaffed Operating Gaps (營業無人/空班時段) */}
                  <tr className="bg-white border-t border-[#DAC0A3]/30 text-[11px]">
                    <td className="py-1.5 px-3 font-bold text-rose-800 border-r border-[#DAC0A3]/40 sticky left-0 z-10 bg-white shadow-xs">
                      <div className="flex flex-col">
                        <span>營業無人時段 (空班)</span>
                        <span className="text-[9px] text-[#8D6E63] font-normal leading-tight">無人在班時間</span>
                      </div>
                    </td>
                    {displayedDaysInMonth.map(dateObj => {
                      const dateStr = formatDateString(dateObj);
                      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                      const dayOpenStart = isWeekend
                        ? (staffingDemandConfig?.operatingStartTimeWeekend || '06:30')
                        : (operatingStartTime || '06:30');
                      const dayCloseEnd = isWeekend
                        ? (staffingDemandConfig?.operatingEndTimeWeekend || '18:30')
                        : (operatingEndTime || '20:00');

                      const daySchedules = scheduleList ? scheduleList.filter(s => s.date === dateStr) : [];
                      const gaps = getUnstaffedOperatingGaps(dateStr, daySchedules, dayOpenStart, dayCloseEnd);
                      const hasGaps = gaps.length > 0;

                      return (
                        <td
                          key={dateStr}
                          className={`py-1 px-0.5 text-center border-r border-[#DAC0A3]/30 align-middle ${
                            hasGaps ? 'bg-rose-50/80' : 'bg-emerald-50/30'
                          }`}
                        >
                          {hasGaps ? (
                            <div className="flex flex-col gap-0.5 items-center justify-center">
                              {gaps.map((gap, gIdx) => (
                                <span
                                  key={gIdx}
                                  className="px-1 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono text-[9px] font-bold leading-tight"
                                  title={`${dateStr} 營業時間無人在班：${gap}`}
                                >
                                  {gap === '全日無人' ? '全日空班' : gap}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-emerald-700 font-bold text-[10px]" title="營業時間全時段有人在班">✓ 全覆蓋</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2 text-center font-mono font-bold text-[10px]">
                      {(() => {
                        let unstaffedDaysCount = 0;
                        displayedDaysInMonth.forEach(dateObj => {
                          const dateStr = formatDateString(dateObj);
                          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                          const dayOpenStart = isWeekend
                            ? (staffingDemandConfig?.operatingStartTimeWeekend || '06:30')
                            : (operatingStartTime || '06:30');
                          const dayCloseEnd = isWeekend
                            ? (staffingDemandConfig?.operatingEndTimeWeekend || '18:30')
                            : (operatingEndTime || '20:00');
                          const daySchedules = scheduleList ? scheduleList.filter(s => s.date === dateStr) : [];
                          if (getUnstaffedOperatingGaps(dateStr, daySchedules, dayOpenStart, dayCloseEnd).length > 0) {
                            unstaffedDaysCount++;
                          }
                        });
                        return unstaffedDaysCount > 0 ? (
                          <span className="text-rose-700 font-extrabold">{unstaffedDaysCount} 天空班</span>
                        ) : (
                          <span className="text-emerald-700 font-bold">✓ 0 缺口</span>
                        );
                      })()}
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
