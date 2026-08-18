import React from 'react';
import type { WorkSchedule, Employee } from '../../services/scheduler';
import { DAYS_OF_WEEK, COLOR_THEMES } from '../../utils/constants';
import {
  formatDateString,
  getDaysInMonth,
  isShiftActiveAtHour,
  getTooltipAlignment,
  getTooltipArrowAlignment,
  getColorFromName,
  calculateDuration,
  isOverEightHours,
  getManagerNote,
  getWorkerNote
} from '../../utils/dateUtils';

interface ManagerAnalysisViewProps {
  currentMonthStart: Date;
  schedules: WorkSchedule[];
  employees: Employee[];
  analysisHoursRange: number[];
  totalHours: number;
  getStaffingTargetForHour: (hour: number, dateStr?: string) => number;
}

export const ManagerAnalysisView: React.FC<ManagerAnalysisViewProps> = ({
  currentMonthStart,
  schedules,
  employees,
  analysisHoursRange,
  totalHours,
  getStaffingTargetForHour
}) => {
  const daysInMonth = getDaysInMonth(currentMonthStart);

  return (
    <div className="space-y-6 animate-fade-in bg-white/40 p-6 rounded-2xl border border-[#DAC0A3]/50">
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-[#3E2723] flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
          每小時排班人數分析圖表
        </h2>
        <p className="text-xs text-[#6D4C41]">
          此圖表顯示 {currentMonthStart.getFullYear()}年 {currentMonthStart.getMonth() + 1}月 每日各時段（以 06:30-07:30 等一小時為單位）已確認排班的總人數。
        </p>
      </div>

      {/* Main Grid Card */}
      <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm bg-white/70">
        <div className="overflow-x-auto max-w-full">
          {/* Heatmap Grid */}
          <div className="min-w-[950px] select-none pb-4">
            {/* Header Row: Days of Month */}
            <div className="flex border-b border-[#DAC0A3]/30 pb-2.5">
              {/* Hour slot empty corner */}
              <div className="w-36 shrink-0 text-xs font-extrabold text-[#6D4C41] flex items-center pl-2">
                時段 \ 日期
              </div>

              {/* Days loop */}
              <div className="flex flex-1 justify-around">
                {daysInMonth.map((dateObj) => {
                  const dNum = dateObj.getDate();
                  const dayName = DAYS_OF_WEEK[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1].name.substring(1);
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                  return (
                    <div key={dNum} className={`flex-1 text-center flex flex-col items-center min-w-[22px] ${isWeekend ? 'text-red-650 font-bold' : 'text-[#6D4C41]'}`}>
                      <span className="text-[13px] font-mono font-bold leading-none">{dNum}</span>
                      <span className="text-[11px] font-extrabold mt-0.5 opacity-90">{dayName}</span>
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
                  <div key={hour} className="flex py-1.5 items-center hover:bg-[#FAF7F2]/45 transition-colors">
                    {/* Row Label */}
                    <div className="w-36 shrink-0 text-[11px] font-mono font-bold text-[#6D4C41] flex items-center pl-2">
                      ⏰ {hourStr}
                    </div>

                    {/* Columns Loop */}
                    <div className="flex flex-1 justify-around">
                      {daysInMonth.map((dateObj, dIdx, arr) => {
                        const dateStr = formatDateString(dateObj);
                        const daySchedules = schedules.filter(s => s.date === dateStr);
                        const workers = daySchedules.filter(s => isShiftActiveAtHour(s.startTime, s.endTime, hour));
                        const count = workers.length;
                        const target = getStaffingTargetForHour(hour, dateStr);
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
                            className={`flex-1 min-w-[22px] mx-0.5 aspect-square rounded flex items-center justify-center text-[10px] border relative group transition-all duration-200 hover:scale-105 ${bgStyle} ${isUnder ? 'ring-1.5 ring-red-500 ring-offset-0.5' : ''
                              }`}
                          >
                            {count > 0 ? count : '-'}

                            {/* Tooltip */}
                            <div className={`absolute bottom-full mb-2 w-52 hidden group-hover:block bg-[#3E2723] text-white text-[11px] p-2.5 rounded-lg shadow-lg z-30 pointer-events-none text-left leading-normal font-sans border border-[#FAF7F2]/10 ${tooltipAlignClass}`}>
                              <div className="font-extrabold border-b border-[#FAF7F2]/20 pb-1.5 mb-1.5 flex items-center justify-between">
                                <span>📅 {dateObj.getMonth() + 1}月{dateObj.getDate()}日 ({DAYS_OF_WEEK[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1].name})</span>
                                <span className="font-mono text-[9px] bg-[#795548] px-1 rounded text-[#FAF7F2]">{hourStr}</span>
                              </div>
                              <div className="space-y-1">
                                <div>👥 確認人數: <span className="font-bold text-[#EADBC8] font-mono text-xs">{count}</span> 人</div>
                                {target > 0 && (
                                  <div>🎯 目標人數: <span className="font-bold font-mono text-xs">{target}</span> 人 {isUnder && <span className="text-red-400 font-extrabold ml-1">(不足!)</span>}</div>
                                )}
                                {count > 0 && (
                                  <div className="mt-1.5 pt-1.5 border-t border-[#FAF7F2]/10 text-white/95">
                                    <div className="font-semibold text-white/70 mb-0.5">名單：</div>
                                    <div className="flex flex-wrap gap-1">
                                      {workerNames.map((name, wIdx) => {
                                        const emp = employees.find(e => e.name === name);
                                        const isFt = emp?.status === '正式夥伴';
                                        return (
                                          <span key={wIdx} className={`px-1 py-0.2 rounded text-[10px] ${isFt ? 'bg-[#795548] text-white' : 'bg-[#FAF7F2]/15 text-[#EADBC8]'
                                            }`}>
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
          </div>
        </div>

        {/* Chart Legend */}
        <div className="flex flex-wrap items-center justify-between border-t border-[#DAC0A3]/25 pt-4.5 mt-2 gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#6D4C41]">
            <span className="font-extrabold text-[#3E2723]">顏色圖例 (人數):</span>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded border border-[#DAC0A3]/45 bg-white"></span>
              <span>0-1 人</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded border border-emerald-600 bg-emerald-500"></span>
              <span>2 人</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded border border-blue-600 bg-blue-500"></span>
              <span>3 人</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded border border-yellow-500 bg-yellow-400"></span>
              <span>4 人</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded border border-red-600 bg-red-500"></span>
              <span>5 人</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded border border-purple-700 bg-purple-600"></span>
              <span>6+ 人</span>
            </div>
            <div className="flex items-center gap-1.5 ml-4">
              <span className="w-3.5 h-3.5 rounded border border-[#DAC0A3]/45 bg-white ring-1.5 ring-red-500 ring-offset-0.5"></span>
              <span className="text-red-650 font-bold">紅框表示人數未達目標 (不足)</span>
            </div>
          </div>

          <div className="text-[11px] text-[#8D6E63] italic">
            💡 將滑鼠游標移至格子上可預覽當小時班表同仁名單與目標。
          </div>
        </div>
      </div>

      {/* Summary statistics card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        {/* Stat 1 */}
        <div className="glass-panel p-4.5 rounded-xl border border-[#DAC0A3]/50 bg-white/70 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-bold text-[#8D6E63] uppercase tracking-wider">本月總工時</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-[#3E2723] font-mono">{Math.round(totalHours * 10) / 10}</span>
            <span className="text-xs text-[#6D4C41]">小時</span>
          </div>
          <p className="text-[10px] text-[#8D6E63] mt-1.5 leading-normal">
            所有夥伴本月已排定確認的有效工時總計（扣除休息時間）。
          </p>
        </div>

        {/* Stat 2 */}
        <div className="glass-panel p-4.5 rounded-xl border border-[#DAC0A3]/50 bg-white/70 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-bold text-[#8D6E63] uppercase tracking-wider">單日平均人數</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-[#3E2723] font-mono">
              {(() => {
                const days = daysInMonth;
                if (days.length === 0) return '0.0';
                let totalWorkersCount = 0;
                let workingDaysCount = 0;
                days.forEach(dateObj => {
                  const dateStr = formatDateString(dateObj);
                  const count = schedules.filter(s => s.date === dateStr).length;
                  if (count > 0) {
                    workingDaysCount++;
                    totalWorkersCount += count;
                  }
                });
                if (workingDaysCount === 0) return '0.0';
                return (totalWorkersCount / workingDaysCount).toFixed(1);
              })()}
            </span>
            <span className="text-xs text-[#6D4C41]">人/工作日</span>
          </div>
          <p className="text-[10px] text-[#8D6E63] mt-1.5 leading-normal">
            工作日日平均確認上班人次（自動排除無排班之非工作日）。
          </p>
        </div>

        {/* Stat 3 */}
        <div className="glass-panel p-4.5 rounded-xl border border-[#DAC0A3]/50 bg-white/70 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-bold text-[#8D6E63] uppercase tracking-wider">最高覆蓋時段</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold text-[#3E2723] font-mono">
              {(() => {
                let maxCount = 0;
                let bestHour = -1;
                analysisHoursRange.forEach(hour => {
                  let countForHour = 0;
                  daysInMonth.forEach(dateObj => {
                    const dateStr = formatDateString(dateObj);
                    countForHour += schedules.filter(s => s.date === dateStr && isShiftActiveAtHour(s.startTime, s.endTime, hour)).length;
                  });
                  if (countForHour > maxCount) {
                    maxCount = countForHour;
                    bestHour = hour;
                  }
                });
                if (bestHour === -1 || maxCount === 0) return '無排班資料';
                return `${bestHour.toString().padStart(2, '0')}:00 - ${(bestHour + 1).toString().padStart(2, '0')}:00`;
              })()}
            </span>
          </div>
          <p className="text-[10px] text-[#8D6E63] mt-1.5 leading-normal">
            本月工作日中累積配置最多排班人次的時段。
          </p>
        </div>

        {/* Stat 4 */}
        <div className="glass-panel p-4.5 rounded-xl border border-[#DAC0A3]/50 bg-white/70 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-bold text-[#8D6E63] uppercase tracking-wider">目標達成率</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-emerald-700 font-mono">
              {(() => {
                let totalTargetCells = 0;
                let metTargetCells = 0;
                daysInMonth.forEach(dateObj => {
                  const dateStr = formatDateString(dateObj);
                  const daySchedules = schedules.filter(s => s.date === dateStr);
                  // Ignore non-working / un-scheduled days
                  if (daySchedules.length === 0) return;

                  analysisHoursRange.forEach(hour => {
                    const target = getStaffingTargetForHour(hour, dateStr);
                    if (target > 0) {
                      totalTargetCells++;
                      const count = daySchedules.filter(s => isShiftActiveAtHour(s.startTime, s.endTime, hour)).length;
                      if (count >= target) {
                        metTargetCells++;
                      }
                    }
                  });
                });
                if (totalTargetCells === 0) return '100%';
                return `${Math.round((metTargetCells / totalTargetCells) * 100)}%`;
              })()}
            </span>
          </div>
          <p className="text-[10px] text-[#8D6E63] mt-1.5 leading-normal">
            在已有排班之工作日中，各時段人數達標的比率。
          </p>
        </div>
      </div>

      {/* Weekly Confirmed Shift Timeline Chart */}
      <ManagerWeeklyTimelineChart
        currentMonthStart={currentMonthStart}
        daysInMonth={daysInMonth}
        schedules={schedules}
        employees={employees}
        analysisHoursRange={analysisHoursRange}
      />
    </div>
  );
};

const ManagerWeeklyTimelineChart: React.FC<{
  currentMonthStart: Date;
  daysInMonth: Date[];
  schedules: WorkSchedule[];
  employees: Employee[];
  analysisHoursRange: number[];
}> = ({ daysInMonth, schedules, employees, analysisHoursRange }) => {
  // Chunk weeks so every week starts on Monday (週一)
  const weeks = React.useMemo(() => {
    const chunks: Date[][] = [];
    let currentChunk: Date[] = [];

    daysInMonth.forEach((dateObj) => {
      const dayOfWeek = dateObj.getDay(); // 0 is Sunday, 1 is Monday
      if (dayOfWeek === 1 && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
      currentChunk.push(dateObj);
    });

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }, [daysInMonth]);

  const DISTINCT_COLOR_KEYS = React.useMemo(() => [
    'skyBlue',
    'crimson',
    'amberGold',
    'emeraldGreen',
    'deepPurple',
    'cyanAqua',
    'slateSteel',
    'hotPink',
    'warmOrange',
    'coffeeBrown'
  ], []);

  const [selectedWeekIdx, setSelectedWeekIdx] = React.useState<number | null>(null);

  const defaultWeekIdx = React.useMemo(() => {
    const todayStr = formatDateString(new Date());
    const foundIdx = weeks.findIndex(w => w.some(d => formatDateString(d) === todayStr));
    if (foundIdx >= 0) return foundIdx;

    for (let i = 0; i < weeks.length; i++) {
      const hasScheds = weeks[i].some(d => {
        const dStr = formatDateString(d);
        return schedules.some(s => s.date === dStr);
      });
      if (hasScheds) return i;
    }
    return 0;
  }, [weeks, schedules]);

  const activeWeekIdx = selectedWeekIdx ?? defaultWeekIdx;
  const displayDays = weeks[activeWeekIdx] || weeks[0] || [];

  // Map each active worker in current week to a distinct, high-contrast color
  const weeklyWorkerColorMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    const activeDateStrs = new Set(displayDays.map(d => formatDateString(d)));
    const weekSchedules = schedules.filter(s => activeDateStrs.has(s.date));

    const workerNamesSet = new Set<string>();
    weekSchedules.forEach(s => {
      if (s.employeeName) workerNamesSet.add(s.employeeName.trim());
    });

    const nameList = Array.from(workerNamesSet).sort((a, b) => a.localeCompare(b));
    nameList.forEach((name, idx) => {
      map[name] = DISTINCT_COLOR_KEYS[idx % DISTINCT_COLOR_KEYS.length];
    });

    return map;
  }, [displayDays, schedules, DISTINCT_COLOR_KEYS]);

  const getWorkerColorKey = React.useCallback((name: string): string => {
    if (!name) return DISTINCT_COLOR_KEYS[0];
    const trimmed = name.trim();

    if (weeklyWorkerColorMap[trimmed]) {
      return weeklyWorkerColorMap[trimmed];
    }

    const sampleSched = schedules.find(s => (s.employeeName || '').trim() === trimmed && s.color && COLOR_THEMES[s.color]);
    if (sampleSched && sampleSched.color) {
      return sampleSched.color;
    }

    return getColorFromName(trimmed);
  }, [schedules, weeklyWorkerColorMap, DISTINCT_COLOR_KEYS]);

  const minHour = analysisHoursRange.length > 0 ? analysisHoursRange[0] : 6;
  const maxHour = analysisHoursRange.length > 0 ? analysisHoursRange[analysisHoursRange.length - 1] + 1 : 21;
  const minHourVal = minHour + 0.5;
  const maxHourVal = maxHour + 0.5;
  const totalSpan = Math.max(1, maxHourVal - minHourVal);

  const topPercent10 = ((10.5 - minHourVal) / totalSpan) * 100;
  const topPercent14 = ((14.5 - minHourVal) / totalSpan) * 100;
  const showLine10 = 10.5 >= minHourVal && 10.5 <= maxHourVal;
  const showLine14 = 14.5 >= minHourVal && 14.5 <= maxHourVal;

  const activeLegendWorkers = React.useMemo(() => {
    const activeDateStrs = new Set(displayDays.map(d => formatDateString(d)));
    const activeSchedules = schedules.filter(s => activeDateStrs.has(s.date));

    const workerShiftMap = new Map<string, number>();
    activeSchedules.forEach(s => {
      if (s.employeeName) {
        const name = s.employeeName.trim();
        workerShiftMap.set(name, (workerShiftMap.get(name) || 0) + 1);
      }
    });

    const items = Array.from(workerShiftMap.entries()).map(([name, shiftCount]) => {
      const emp = employees.find(e => e.name === name);
      const isFt = emp?.status === '正式夥伴';
      const colorKey = getWorkerColorKey(name);
      return { name, colorKey, isFt, shiftCount };
    });

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [displayDays, schedules, employees, getWorkerColorKey]);

  return (
    <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm bg-white/70 space-y-5 mt-6">
      {/* Header & Week Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DAC0A3]/30 pb-4">
        <div>
          <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E65100]"></span>
            週層級夥伴垂直排班時間軸圖表 (Vertical Shift Timeline)
          </h3>
          <p className="text-xs text-[#6D4C41] mt-0.5">
            縱軸為時段（06:30-07:30起）、橫軸為日期，週別以週一為起始日，長條內直向顯示出勤夥伴全名。
          </p>
        </div>

        {/* Week Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#FAF7F2] p-1.5 rounded-xl border border-[#DAC0A3]/40 self-start sm:self-auto">
          {weeks.map((weekDays, idx) => {
            if (weekDays.length === 0) return null;
            const firstDate = weekDays[0];
            const lastDate = weekDays[weekDays.length - 1];
            const isSelected = idx === activeWeekIdx;
            return (
              <button
                key={idx}
                onClick={() => setSelectedWeekIdx(idx)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#5D4037] text-white shadow-sm'
                    : 'text-[#6D4C41] hover:bg-[#EADBC8]/40'
                }`}
              >
                第 {idx + 1} 週 ({firstDate.getDate()}~{lastDate.getDate()}日)
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid Container: Y-Axis = Hours, X-Axis = Dates */}
      <div className="overflow-x-auto max-w-full select-none">
        <div style={{ minWidth: `${Math.max(950, displayDays.length * 85 + 144)}px` }} className="pb-2">
          {/* Header Row: Corner label & X-Axis Dates */}
          <div className="flex border-b border-[#DAC0A3]/40 pb-2.5">
            <div className="w-36 shrink-0 text-xs font-extrabold text-[#6D4C41] flex items-center pl-2">
              時段 \ 日期
            </div>
            <div className="flex flex-1 justify-around">
              {displayDays.map((dateObj) => {
                const dNum = dateObj.getDate();
                const dayName = DAYS_OF_WEEK[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1].name.substring(1);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const dateStr = formatDateString(dateObj);
                const hasSchedules = schedules.some(s => s.date === dateStr);

                return (
                  <div key={dNum} className={`flex-1 text-center flex flex-col items-center min-w-[70px] border-r border-black/40 last:border-r-0 ${isWeekend ? 'text-red-650 font-bold' : 'text-[#6D4C41]'}`}>
                    <span className={`text-[14px] font-mono font-extrabold leading-none ${hasSchedules ? 'text-[#3E2723]' : 'opacity-70'}`}>{dNum}</span>
                    <span className="text-[11px] font-extrabold mt-0.5 opacity-90">{dayName}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grid Body with Vertical Bars Overlay */}
          <div className="relative mt-1 border border-[#DAC0A3]/30 rounded-xl overflow-hidden bg-white/90">
            {/* Hour Rows Background Grid (Y-Axis = Hours) */}
            <div className="divide-[#DAC0A3]/20 divide-y">
              {analysisHoursRange.map((hour) => {
                const hourStr = `${hour.toString().padStart(2, '0')}:30 - ${(hour + 1).toString().padStart(2, '0')}:30`;
                return (
                  <div key={hour} className="flex h-12 items-center hover:bg-[#FAF7F2]/30 transition-colors">
                    {/* Hour Row Label (Y-Axis) */}
                    <div className="w-36 shrink-0 text-[11px] font-mono font-bold text-[#6D4C41] flex items-center pl-2 border-r border-[#DAC0A3]/30 h-full bg-[#FAF7F2]/40">
                      ⏰ {hourStr}
                    </div>

                    {/* Columns Background Guidelines */}
                    <div className="flex flex-1 justify-around h-full">
                      {displayDays.map((dateObj) => (
                        <div key={dateObj.getDate()} className="flex-1 min-w-[70px] border-r border-black/50 last:border-r-0 h-full"></div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Vertical Shift Line Bars Overlay */}
            <div className="absolute inset-0 left-36 flex justify-around pointer-events-none">
              {displayDays.map((dateObj) => {
                const dateStr = formatDateString(dateObj);
                const daySchedules = schedules.filter(s => s.date === dateStr);
                const count = daySchedules.length;

                return (
                  <div key={dateStr} className="flex-1 min-w-[70px] relative h-full">
                    {daySchedules.map((sched, idx) => {
                      const emp = employees.find(e => e.name === sched.employeeName);
                      const isFt = emp?.status === '正式夥伴';
                      const colorKey = getWorkerColorKey(sched.employeeName);
                      const theme = COLOR_THEMES[colorKey] || COLOR_THEMES.emerald;

                      const [sh, sm] = (sched.startTime || '09:00').split(':').map(Number);
                      const [eh, em] = (sched.endTime || '17:00').split(':').map(Number);
                      const startVal = (isNaN(sh) ? 9 : sh) + (isNaN(sm) ? 0 : sm) / 60;
                      let endVal = (isNaN(eh) ? 17 : eh) + (isNaN(em) ? 0 : em) / 60;
                      if (endVal < startVal) endVal += 24;

                      const clampedStart = Math.max(minHourVal, Math.min(maxHourVal, startVal));
                      const clampedEnd = Math.max(minHourVal, Math.min(maxHourVal, endVal));
                      const topPercent = ((clampedStart - minHourVal) / totalSpan) * 100;
                      const heightPercent = Math.max(4, ((clampedEnd - clampedStart) / totalSpan) * 100);

                      const slotWidth = count > 1 ? 100 / count : 92;
                      const barLeft = count > 1 ? idx * slotWidth + 1 : 4;
                      const barWidth = count > 1 ? slotWidth - 2 : 92;

                      const durationHours = calculateDuration(sched.startTime, sched.endTime);
                      const isOver8 = isOverEightHours(sched.startTime, sched.endTime);
                      const mgrNote = getManagerNote(sched);
                      const wrkNote = getWorkerNote(sched);

                      return (
                        <div
                          key={sched.id}
                          style={{
                            top: `${topPercent}%`,
                            height: `${heightPercent}%`,
                            left: `${barLeft}%`,
                            width: `${barWidth}%`
                          }}
                          title={`${sched.employeeName} (${sched.startTime} - ${sched.endTime}, ${durationHours}h)${mgrNote ? ` | 主管備註: ${mgrNote}` : ''}${wrkNote ? ` | 夥伴登記: ${wrkNote}` : ''}`}
                          className={`absolute rounded-xl border-2 ${theme.bg} ${theme.border} ${theme.text} shadow-md p-1 flex flex-col justify-between items-center transition-all duration-200 hover:z-30 hover:scale-[1.03] hover:shadow-lg overflow-hidden pointer-events-auto select-none backdrop-blur-xs`}
                        >
                          {/* Top Dot & Start Time */}
                          <div className="flex flex-col items-center gap-0.5 text-center w-full shrink-0">
                            <span className={`w-2 h-2 rounded-full ${theme.dot}`}></span>
                            <span className="text-[9px] font-mono font-extrabold opacity-80 leading-none">{sched.startTime}</span>
                          </div>



                          {/* Bottom End Time & Badges */}
                          <div className="flex flex-col items-center gap-0.5 text-center w-full shrink-0">
                            <span className="text-[9px] font-mono font-extrabold opacity-80 leading-none">{sched.endTime}</span>
                            <div className="flex items-center gap-0.5 mt-0.5">
                              <span className={`text-[8px] font-extrabold px-1 rounded ${isFt ? 'bg-[#795548] text-white' : 'bg-[#EADBC8] text-[#5D4037]'}`}>
                                {isFt ? '正' : '兼'}
                              </span>
                              {isOver8 && (
                                <span className="bg-red-500 text-white text-[8px] font-extrabold px-0.5 rounded animate-pulse" title="工時 > 8 小時">
                                  ⚠️
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Horizontal Fixed Reference Lines at 10:30 & 14:30 (Covering the bars) */}
            {showLine10 && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                style={{ top: `${topPercent10}%`, transform: 'translateY(-50%)' }}
              >
                <div className="w-36 shrink-0 flex items-center justify-end pr-2">
                  <span className="bg-[#D32F2F] text-white text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full shadow-sm">
                    10:30
                  </span>
                </div>
                <div className="flex-1 h-[2px] bg-[#D32F2F] shadow-sm"></div>
              </div>
            )}

            {showLine14 && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                style={{ top: `${topPercent14}%`, transform: 'translateY(-50%)' }}
              >
                <div className="w-36 shrink-0 flex items-center justify-end pr-2">
                  <span className="bg-[#E65100] text-white text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full shadow-sm">
                    14:30
                  </span>
                </div>
                <div className="flex-1 h-[2px] bg-[#E65100] shadow-sm"></div>
              </div>
            )}
          </div>

          {/* Footer Row: Daily Total Work Hours */}
          <div className="flex border-t border-[#DAC0A3]/40 pt-2.5 mt-2.5 items-center bg-[#FAF7F2]/60 rounded-xl p-2 border border-[#DAC0A3]/30">
            <div className="w-36 shrink-0 flex flex-col justify-center pl-2">
              <span className="text-xs font-extrabold text-[#3E2723] flex items-center gap-1.5">
                <span>⏱️ 當日總工時</span>
              </span>
              <span className="text-[10px] text-[#8D6E63] font-mono font-bold mt-0.5">
                週累計: {displayDays.reduce((acc, d) => {
                  const dStr = formatDateString(d);
                  return acc + schedules.filter(s => s.date === dStr).reduce((sum, s) => sum + calculateDuration(s.startTime, s.endTime), 0);
                }, 0).toFixed(1)}h
              </span>
            </div>

            <div className="flex flex-1 justify-around">
              {displayDays.map((dateObj) => {
                const dateStr = formatDateString(dateObj);
                const daySchedules = schedules.filter(s => s.date === dateStr);
                const totalHours = daySchedules.reduce((sum, s) => sum + calculateDuration(s.startTime, s.endTime), 0);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                return (
                  <div
                    key={dateStr}
                    className="flex-1 text-center flex flex-col items-center justify-center min-w-[70px] border-r border-black/40 last:border-r-0 px-1"
                  >
                    {daySchedules.length > 0 ? (
                      <div className="space-y-0.5">
                        <span className={`font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-lg inline-block border ${isWeekend
                          ? 'bg-red-50 text-red-750 border-red-200'
                          : 'bg-[#EADBC8]/60 text-[#3E2723] border-[#DAC0A3]/60'
                          }`}>
                          {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h
                        </span>
                        <span className="text-[10px] text-[#8D6E63] font-bold block">
                          {daySchedules.length} 人出勤
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-mono text-[#8D6E63]/40 font-bold">-</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Chart Legend */}
      <div className="space-y-3 border-t border-[#DAC0A3]/25 pt-3 text-xs text-[#6D4C41]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-extrabold text-[#3E2723]">標籤說明:</span>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#795548] text-white font-bold">正職</span>
              <span>正式夥伴</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#EADBC8] text-[#5D4037] font-bold">兼職</span>
              <span>兼職夥伴</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold bg-red-500 text-white px-1 rounded">⚠️ 超時</span>
              <span>扣除休息後工時 &gt; 8 小時</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-[2px] bg-[#D32F2F] rounded"></span>
              <span className="text-[10px] font-bold text-[#D32F2F]">10:30</span>
              <span className="w-3 h-[2px] bg-[#E65100] rounded ml-1"></span>
              <span className="text-[10px] font-bold text-[#E65100]">14:30 基準線</span>
            </div>
          </div>
          <div className="text-[11px] text-[#8D6E63] italic">
            💡 垂直長條頂端與底端精確對應班別起訖，紅/橘實線為 10:30 與 14:30 參考基準線。
          </div>
        </div>

        {/* Worker Color Legend Bar */}
        <div className="border-t border-[#DAC0A3]/20 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-xs text-[#3E2723] flex items-center gap-1.5">
              <span>🎨</span> 當前週別出勤夥伴圖例 (第 {activeWeekIdx + 1} 週):
            </span>
            <span className="text-[11px] text-[#8D6E63]">
              共 <strong className="font-mono text-[#3E2723]">{activeLegendWorkers.length}</strong> 位出勤夥伴
            </span>
          </div>

          {activeLegendWorkers.length === 0 ? (
            <div className="text-xs text-[#8D6E63] italic py-1">此區間暫無夥伴排班出勤紀錄</div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {activeLegendWorkers.map(({ name, colorKey, isFt, shiftCount }) => {
                const theme = COLOR_THEMES[colorKey] || COLOR_THEMES.emerald;
                return (
                  <div
                    key={name}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold ${theme.bg} ${theme.border} ${theme.text} shadow-xs transition-transform hover:scale-[1.03] select-none`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${theme.dot} shrink-0`}></span>
                    <span>{name}</span>
                    <span className={`text-[9px] font-extrabold px-1 rounded ${isFt ? 'bg-[#795548] text-white' : 'bg-[#EADBC8] text-[#5D4037]'}`}>
                      {isFt ? '正' : '兼'}
                    </span>
                    <span className="text-[10px] font-mono opacity-80 font-semibold">({shiftCount}班)</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


