import React, { useState, useMemo, useEffect } from 'react';
import type { WorkSchedule, WorkerAvailability, Employee, StaffingTarget, ShiftPreset } from '../../services/scheduler';
import type { ProposedSchedule, AutoScheduleResult } from '../../utils/autoScheduler';
import { formatDateString, getDaysInMonth, getDatesInRange, isShiftActiveAtHour, getTooltipAlignment, getTooltipArrowAlignment } from '../../utils/dateUtils';
import { DAYS_OF_WEEK } from '../../utils/constants';
import { runAIScheduler } from '../../services/aiScheduler';

interface AutoScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMonthStart: Date;
  availabilities: WorkerAvailability[];
  schedules: WorkSchedule[];
  employees: Employee[];
  staffingTargets: StaffingTarget[];
  analysisHoursRange: number[];
  shiftPresets: ShiftPreset[];
  onExecuteBatchAutoSchedule: (proposedSchedules: ProposedSchedule[]) => Promise<void>;
}

export const AutoScheduleModal: React.FC<AutoScheduleModalProps> = ({
  isOpen,
  onClose,
  currentMonthStart,
  availabilities,
  schedules,
  employees,
  staffingTargets,
  analysisHoursRange,
  shiftPresets,
  onExecuteBatchAutoSchedule
}) => {
  const daysInMonth = useMemo(() => getDaysInMonth(currentMonthStart), [currentMonthStart]);
  const defaultStartDate = daysInMonth[0] ? formatDateString(daysInMonth[0]) : '';
  const defaultEndDate = daysInMonth[daysInMonth.length - 1] ? formatDateString(daysInMonth[daysInMonth.length - 1]) : '';

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [prioritizeFullTime, setPrioritizeFullTime] = useState(true);
  const [onlyFillDeficits, setOnlyFillDeficits] = useState(false);
  const [maxHoursPerShift, setMaxHoursPerShift] = useState(8);

  const [useAiMode, setUseAiMode] = useState(true);

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [calculationResult, setCalculationResult] = useState<AutoScheduleResult | null>(null);
  const [selectedProposedIds, setSelectedProposedIds] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const s = daysInMonth[0] ? formatDateString(daysInMonth[0]) : '';
      const e = daysInMonth[daysInMonth.length - 1] ? formatDateString(daysInMonth[daysInMonth.length - 1]) : '';
      setStartDate(s);
      setEndDate(e);
      setCalculationResult(null);
    }
  }, [isOpen, daysInMonth]);

  const dateRangeList = useMemo(() => {
    if (!startDate || !endDate) return [];
    return getDatesInRange(startDate, endDate).map(formatDateString);
  }, [startDate, endDate]);

  const previewDates = useMemo(() => {
    if (dateRangeList.length > 0) return dateRangeList;
    return daysInMonth.map(formatDateString);
  }, [dateRangeList, daysInMonth]);

  const combinedPreviewSchedules = useMemo(() => {
    if (!calculationResult) return schedules;
    const selectedProposed = calculationResult.proposedSchedules.filter(p => selectedProposedIds.has(p.availabilityId));
    const proposedAsWorkSchedules: WorkSchedule[] = selectedProposed.map(p => ({
      id: p.availabilityId,
      title: p.employeeName,
      employeeName: p.employeeName,
      date: p.date,
      workplace: p.workplace,
      startTime: p.startTime,
      endTime: p.endTime,
      color: 'emerald',
      createdAt: Date.now()
    }));
    return [...schedules, ...proposedAsWorkSchedules];
  }, [schedules, calculationResult, selectedProposedIds]);

  const getStaffingTargetForHour = (hour: number, dateStr?: string) => {
    if (dateStr) {
      const dateMatch = staffingTargets.find(t => t.hour === hour && t.date === dateStr);
      if (dateMatch) return dateMatch.targetCount;
    }
    const defaultMatch = staffingTargets.find(t => t.hour === hour && !t.date);
    return defaultMatch ? defaultMatch.targetCount : 0;
  };

  if (!isOpen) return null;

  const handleRunCalculation = async () => {
    if (dateRangeList.length === 0) {
      alert('請選擇有效的日期範圍。');
      return;
    }

    const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
    const activeKey = geminiKey.trim();

    if (!activeKey) {
      alert('⚠️ 未偵測到 AI API Key！\n\n請先設定環境變數。');
      return;
    }

    const activeEmployeeNames = new Set(
      employees.filter(e => e.active !== false).map(e => e.name.trim().toLowerCase())
    );

    setIsAiLoading(true);
    try {
      const aiProposed = await runAIScheduler({
        apiKey: activeKey,
        dateRange: dateRangeList,
        availabilities: availabilities.filter(
          a => dateRangeList.includes(a.date) && a.confirmed !== true && activeEmployeeNames.has(a.employeeName.trim().toLowerCase())
        ),
        schedules,
        employees,
        staffingTargets,
        onlyFillDeficits
      });

      const mappedProposed: ProposedSchedule[] = aiProposed.map(p => ({
        availabilityId: p.availabilityId,
        employeeName: p.employeeName,
        date: p.date,
        workplace: p.workplace,
        startTime: p.startTime,
        endTime: p.endTime,
        notes: p.notes,
        workerNotes: p.workerNotes || '',
        managerNotes: p.managerNotes || '',
        color: '#795548',
        coveredDeficitHoursCount: 8
      }));

      setCalculationResult({
        totalNewConfirmedShifts: mappedProposed.length,
        coveredDeficitHoursTotal: mappedProposed.length * 8,
        unassignedAvailabilitiesCount: Math.max(0, availabilities.length - mappedProposed.length),
        proposedSchedules: mappedProposed
      });
      setSelectedProposedIds(new Set(mappedProposed.map(p => p.availabilityId)));
    } catch (err: any) {
      console.error('AI Auto schedule error:', err);
      alert(` AI 排班失敗: ${err?.message || err}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const toggleSelectProposed = (availId: string) => {
    const next = new Set(selectedProposedIds);
    if (next.has(availId)) {
      next.delete(availId);
    } else {
      next.add(availId);
    }
    setSelectedProposedIds(next);
  };

  const handleToggleSelectAll = () => {
    if (!calculationResult) return;
    if (selectedProposedIds.size === calculationResult.proposedSchedules.length) {
      setSelectedProposedIds(new Set());
    } else {
      setSelectedProposedIds(new Set(calculationResult.proposedSchedules.map(p => p.availabilityId)));
    }
  };

  const handleConfirmApply = async () => {
    if (!calculationResult || selectedProposedIds.size === 0) return;
    const finalProposed = calculationResult.proposedSchedules.filter(p => selectedProposedIds.has(p.availabilityId));

    setIsApplying(true);
    try {
      await onExecuteBatchAutoSchedule(finalProposed);
      onClose();
    } catch (error) {
      console.error("Failed to execute batch auto schedule: ", error);
      alert('批次自動排班失敗，請重試。');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-[#FAF7F2] border border-[#DAC0A3] w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#F5EBE6] px-6 py-4 border-b border-[#DAC0A3]/50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-[#3E2723] flex items-center gap-2">
              <span className="text-lg">⚡</span> 智能自動帶入與確認排班
            </h3>
            <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
              自動演算兼職與正職登記可用時間，避開連續 7 天上班，精準填補人力缺口。
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#8D6E63] hover:bg-[#8D6E63]/10 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Settings Section */}
          <div className="glass-panel p-4 rounded-xl border border-[#DAC0A3]/50 space-y-4 bg-white/60">
            <h4 className="text-xs font-bold text-[#5D4037] uppercase tracking-wider">⚙️ 演算設定與範圍</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#6D4C41] mb-1">開始日期</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6D4C41] mb-1">結束日期</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-2 border-t border-[#DAC0A3]/30">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#3E2723]">
                <input
                  type="checkbox"
                  checked={prioritizeFullTime}
                  onChange={(e) => setPrioritizeFullTime(e.target.checked)}
                  className="rounded text-[#795548] focus:ring-[#795548]"
                />
                <span>優先安排正式夥伴 (匹配 8h 標準班別)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#3E2723]">
                <input
                  type="checkbox"
                  checked={onlyFillDeficits}
                  onChange={(e) => setOnlyFillDeficits(e.target.checked)}
                  className="rounded text-[#795548] focus:ring-[#795548]"
                />
                <span>僅於該時段人力不足時才排入</span>
              </label>

              <div className="flex items-center gap-2 text-xs font-bold text-[#3E2723]">
                <span>單班次上限時數:</span>
                <select
                  value={maxHoursPerShift}
                  onChange={(e) => setMaxHoursPerShift(Number(e.target.value))}
                  className="bg-white border border-[#DAC0A3]/60 rounded-lg px-2 py-1 text-xs font-mono text-[#3E2723]"
                >
                  <option value={4}>4 小時</option>
                  <option value={6}>6 小時</option>
                  <option value={8}>8 小時 (標準)</option>
                  <option value={9}>9 小時 (含休息)</option>
                  <option value={10}>10 小時</option>
                </select>
              </div>
            </div>

            {/* Gemini API Key Status Banner */}
            <div className="pt-2 border-t border-[#DAC0A3]/30 flex flex-col gap-3">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between animate-fade-in text-xs">
                {import.meta.env.VITE_GEMINI_API_KEY ? (
                  <span className="text-emerald-800 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    成功載入 AI API Key
                  </span>
                ) : (
                  <span className="text-amber-800 font-bold flex items-center gap-1.5">
                    <span>⚠️</span>
                    未設定 AI API Key
                  </span>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={handleRunCalculation}
                disabled={isAiLoading}
                className="bg-[#795548] hover:bg-[#5D4037] disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isAiLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>AI 正在分析排班規則與人力需求...</span>
                  </>
                ) : (
                  <>
                    <span>🤖</span>
                    <span>一鍵 AI 智慧排班</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results Preview Section */}
          {calculationResult && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <div className="text-xl font-extrabold text-emerald-700 font-mono">
                    {calculationResult.totalNewConfirmedShifts}
                  </div>
                  <div className="text-[10px] font-bold text-emerald-800">預計自動生成班次</div>
                </div>
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
                  <div className="text-xl font-extrabold text-indigo-700 font-mono">
                    {calculationResult.coveredDeficitHoursTotal}
                  </div>
                  <div className="text-[10px] font-bold text-indigo-800">涵蓋缺工小時總次</div>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  <div className="text-xl font-extrabold text-amber-700 font-mono">
                    {calculationResult.unassignedAvailabilitiesCount}
                  </div>
                  <div className="text-[10px] font-bold text-amber-800">跳過/不符合條件登記</div>
                </div>
              </div>

              {calculationResult.proposedSchedules.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-[#DAC0A3]/50 rounded-xl text-xs text-[#6D4C41]">
                  無符合條件可排入的未確認登記
                </div>
              ) : (
                <div className="glass-panel rounded-xl border border-[#DAC0A3]/50 overflow-hidden bg-white/80">
                  <div className="p-3 bg-[#F5EBE6] border-b border-[#DAC0A3]/40 flex justify-between items-center text-xs font-bold text-[#5D4037]">
                    <span>預覽排班列表 ({selectedProposedIds.size} / {calculationResult.proposedSchedules.length} 項已勾選)</span>
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="text-[#8D6E63] hover:underline cursor-pointer"
                    >
                      {selectedProposedIds.size === calculationResult.proposedSchedules.length ? '全不選' : '全選'}
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF7F2] sticky top-0 border-b border-[#DAC0A3]/30 text-[#8D6E63] font-bold">
                        <tr>
                          <th className="p-2 w-10 text-center">選取</th>
                          <th className="p-2">日期</th>
                          <th className="p-2">姓名</th>
                          <th className="p-2">自動時段</th>
                          <th className="p-2">涵蓋缺工小時</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DAC0A3]/20">
                        {calculationResult.proposedSchedules.map((proposed) => {
                          const isChecked = selectedProposedIds.has(proposed.availabilityId);
                          return (
                            <tr
                              key={proposed.availabilityId}
                              onClick={() => toggleSelectProposed(proposed.availabilityId)}
                              className={`hover:bg-[#FAF7F2]/50 transition-colors cursor-pointer ${isChecked ? 'bg-emerald-50/30' : 'opacity-60'}`}
                            >
                              <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSelectProposed(proposed.availabilityId)}
                                  className="rounded text-[#795548]"
                                />
                              </td>
                              <td className="p-2 font-mono font-bold text-[#3E2723]">{proposed.date}</td>
                              <td className="p-2 font-extrabold text-[#3E2723]">👤 {proposed.employeeName}</td>
                              <td className="p-2 font-mono font-bold text-emerald-800">
                                {proposed.startTime} - {proposed.endTime}
                              </td>
                              <td className="p-2 font-mono text-[#5D4037]">
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold">
                                  +{proposed.coveredDeficitHoursCount}h 缺工涵蓋
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Hourly Staffing Analysis Preview Chart */}
              {calculationResult && (
                <div className="glass-panel p-5 rounded-xl border border-[#DAC0A3]/50 space-y-4 bg-white/70 shadow-sm animate-fade-in mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DAC0A3]/30 pb-3">
                    <div>
                      <h4 className="text-xs font-extrabold text-[#3E2723] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                        📊 每小時排班人數預覽分析圖表 (AI 演算即時預覽)
                      </h4>
                      <p className="text-[11px] text-[#6D4C41] mt-0.5">
                        結合現有班表與選取的 AI 演算班次，即時預覽各時段（06:00~18:00）人力配置與缺口。
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 shrink-0">
                      <span>選取預覽班次：</span>
                      <span className="font-extrabold text-sm">{selectedProposedIds.size} / {calculationResult.proposedSchedules.length} 筆</span>
                    </div>
                  </div>

                  {/* Heatmap Grid */}
                  <div className="overflow-x-auto max-w-full">
                    <div className="min-w-[800px] select-none pb-2 text-xs">
                      {/* Header Row: Dates */}
                      <div className="flex border-b border-[#DAC0A3]/30 pb-2">
                        <div className="w-32 shrink-0 text-xs font-extrabold text-[#6D4C41] flex items-center pl-2">
                          時段 \ 日期
                        </div>
                        <div className="flex flex-1 justify-around">
                          {previewDates.map((dateStr) => {
                            const [y, m, d] = dateStr.split('-').map(Number);
                            const dateObj = new Date(y, (m || 1) - 1, d || 1);
                            const dayName = DAYS_OF_WEEK[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1]?.name.substring(1) || '';
                            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                            return (
                              <div key={dateStr} className={`flex-1 text-center flex flex-col items-center min-w-[24px] ${isWeekend ? 'text-red-650 font-bold' : 'text-[#6D4C41]'}`}>
                                <span className="text-[12px] font-mono font-bold leading-none">{d}</span>
                                <span className="text-[10px] font-extrabold mt-0.5 opacity-90">{dayName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Hour Rows */}
                      <div className="divide-y divide-[#DAC0A3]/20 mt-1">
                        {analysisHoursRange.map(hour => {
                          const hourStr = `${hour.toString().padStart(2, '0')}:00-${(hour + 1).toString().padStart(2, '0')}:00`;
                          return (
                            <div key={hour} className="flex py-1 items-center hover:bg-[#FAF7F2]/60 transition-colors">
                              <div className="w-32 shrink-0 text-[11px] font-mono font-bold text-[#6D4C41] flex items-center pl-2">
                                ⏰ {hourStr}
                              </div>
                              <div className="flex flex-1 justify-around">
                                {previewDates.map((dateStr, dIdx, arr) => {
                                  const activeWorkers = combinedPreviewSchedules.filter(
                                    s => s.date === dateStr && isShiftActiveAtHour(s.startTime, s.endTime, hour)
                                  );
                                  const count = activeWorkers.length;
                                  const target = getStaffingTargetForHour(hour, dateStr);
                                  const isUnder = target > 0 && count < target;
                                  const workerNames = activeWorkers.map(w => w.employeeName);

                                  let bgStyle = 'bg-white border-[#DAC0A3]/45 text-[#3E2723]/50';
                                  if (count === 2) bgStyle = 'bg-emerald-500 border-emerald-600 text-white font-bold';
                                  else if (count === 3) bgStyle = 'bg-blue-500 border-blue-600 text-white font-bold';
                                  else if (count === 4) bgStyle = 'bg-yellow-400 border-yellow-500 text-yellow-950 font-bold';
                                  else if (count === 5) bgStyle = 'bg-red-500 border-red-600 text-white font-bold';
                                  else if (count >= 6) bgStyle = 'bg-purple-600 border-purple-700 text-white font-bold';

                                  const tooltipAlignClass = getTooltipAlignment(dIdx, arr.length);
                                  const tooltipArrowAlignClass = getTooltipArrowAlignment(dIdx, arr.length);

                                  return (
                                    <div
                                      key={dateStr}
                                      className={`flex-1 min-w-[22px] mx-0.5 aspect-square rounded flex items-center justify-center text-[10px] border relative group transition-all duration-200 hover:scale-105 ${bgStyle} ${isUnder ? 'ring-1.5 ring-red-500 ring-offset-0.5' : ''}`}
                                    >
                                      {count > 0 ? count : '-'}

                                      {/* Hover Tooltip */}
                                      <div className={`absolute bottom-full mb-2 w-48 hidden group-hover:block bg-[#3E2723] text-white text-[11px] p-2 rounded-lg shadow-lg z-30 pointer-events-none text-left leading-normal font-sans border border-[#FAF7F2]/10 ${tooltipAlignClass}`}>
                                        <div className="font-extrabold border-b border-[#FAF7F2]/20 pb-1 mb-1 flex items-center justify-between">
                                          <span>📅 {dateStr}</span>
                                          <span className="font-mono text-[9px] bg-[#795548] px-1 rounded text-[#FAF7F2]">{hourStr}</span>
                                        </div>
                                        <div className="space-y-0.5">
                                          <div>👥 預覽排班人數: <span className="font-bold text-[#EADBC8] font-mono text-xs">{count}</span> 人</div>
                                          {target > 0 && (
                                            <div>🎯 目標人數: <span className="font-bold font-mono text-xs">{target}</span> 人 {isUnder && <span className="text-red-400 font-extrabold ml-1">(不足!)</span>}</div>
                                          )}
                                          {count > 0 && (
                                            <div className="mt-1 pt-1 border-t border-[#FAF7F2]/10 flex flex-wrap gap-1">
                                              {workerNames.map((name, wIdx) => (
                                                <span key={wIdx} className="px-1 py-0.2 rounded text-[9px] bg-[#FAF7F2]/20 text-[#EADBC8]">
                                                  {name}
                                                </span>
                                              ))}
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
                  <div className="flex flex-wrap items-center justify-between border-t border-[#DAC0A3]/25 pt-3 gap-3 text-xs text-[#6D4C41]">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-extrabold text-[#3E2723]">顏色標示:</span>
                      <div className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded border border-[#DAC0A3]/45 bg-white"></span>
                        <span>0-1 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded border border-emerald-600 bg-emerald-500"></span>
                        <span>2 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded border border-blue-600 bg-blue-500"></span>
                        <span>3 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded border border-yellow-500 bg-yellow-400"></span>
                        <span>4 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded border border-red-600 bg-red-500"></span>
                        <span>5 人</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded border border-purple-700 bg-purple-600"></span>
                        <span>6+ 人</span>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <span className="w-3 h-3 rounded border border-[#DAC0A3]/45 bg-white ring-1.5 ring-red-500 ring-offset-0.5"></span>
                        <span className="text-red-650 font-bold">紅框 = 未達標 (缺工)</span>
                      </div>
                    </div>
                    <span className="text-[11px] text-[#8D6E63] italic">
                      💡 游標懸停格子上可預覽該時段排班同仁
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-[#F5EBE6] px-6 py-4 border-t border-[#DAC0A3]/50 flex justify-end items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/60 text-[#5D4037] font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!calculationResult || selectedProposedIds.size === 0 || isApplying}
            onClick={handleConfirmApply}
            className="px-5 py-2.5 bg-[#2E7D32] hover:bg-[#1B5E20] disabled:opacity-40 disabled:pointer-events-none text-white font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
          >
            {isApplying ? (
              <>
                <span className="animate-spin text-sm">⏳</span>
                <span>自動生成中...</span>
              </>
            ) : (
              <>
                <span>✅</span>
                <span>正式生成並確認排班 ({selectedProposedIds.size} 筆)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
