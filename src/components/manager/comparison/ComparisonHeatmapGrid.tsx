import React from 'react';
import type { WorkSchedule, Employee } from '../../../services/scheduler';
import {
  formatDateString,
  isShiftActiveAtHour,
  getTooltipAlignment,
  getTooltipArrowAlignment
} from '../../../utils/dateUtils';
import { DAYS_OF_WEEK } from '../../../utils/constants';
import type { ComparisonStats } from '../../../hooks/useComparisonSimulation';

export interface ComparisonHeatmapGridProps {
  keyId: 'manual' | 'rule' | 'ai';
  title: string;
  subtitle: string;
  badgeText: string;
  themeClasses: {
    badgeBg: string;
    headerBg: string;
  };
  cardBorderColor: string;
  scheduleList: WorkSchedule[] | null;
  stats: ComparisonStats | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  displayedDaysInMonth: Date[];
  analysisHoursRange: number[];
  employees: Employee[];
  getStaffingTarget: (hour: number, dateStr: string) => number;
}

export const ComparisonHeatmapGrid: React.FC<ComparisonHeatmapGridProps> = ({
  title,
  subtitle,
  badgeText,
  themeClasses,
  cardBorderColor,
  scheduleList,
  stats,
  isCollapsed,
  onToggleCollapse,
  displayedDaysInMonth,
  analysisHoursRange,
  employees,
  getStaffingTarget
}) => {
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
