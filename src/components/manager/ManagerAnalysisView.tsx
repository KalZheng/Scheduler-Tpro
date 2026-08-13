import React from 'react';
import type { WorkSchedule, Employee } from '../../services/scheduler';
import { DAYS_OF_WEEK } from '../../utils/constants';
import { formatDateString, getDaysInMonth, isShiftActiveAtHour, getTooltipAlignment, getTooltipArrowAlignment } from '../../utils/dateUtils';

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
          此圖表顯示 {currentMonthStart.getFullYear()}年 {currentMonthStart.getMonth() + 1}月 每日各時段（以小時為單位）已確認排班的總人數。
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
                const hourStr = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;
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
    </div>
  );
};
