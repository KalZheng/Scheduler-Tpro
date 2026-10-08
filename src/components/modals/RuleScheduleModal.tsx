import React, { useState, useMemo, useEffect } from 'react';
import type { WorkSchedule, WorkerAvailability, Employee, StaffingTarget, ShiftPreset, StaffingDemandConfig } from '../../services/scheduler';
import { generateAutoSchedule } from '../../utils/autoScheduler';
import type { ProposedSchedule, AutoScheduleResult } from '../../utils/autoScheduler';
import {
  formatDateString,
  getDaysInMonth,
  getDatesInRange,
  isShiftActiveAtHour,
  getTooltipAlignment,
  getTooltipArrowAlignment,
  checkDayStaffingRequirement
} from '../../utils/dateUtils';
import { DAYS_OF_WEEK } from '../../utils/constants';

interface RuleScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMonthStart: Date;
  availabilities: WorkerAvailability[];
  schedules: WorkSchedule[];
  employees: Employee[];
  staffingTargets: StaffingTarget[];
  analysisHoursRange: number[];
  shiftPresets: ShiftPreset[];
  operatingStartTime?: string;
  operatingEndTime?: string;
  staffingDemandConfig?: StaffingDemandConfig;
  onExecuteBatchAutoSchedule: (proposedSchedules: ProposedSchedule[]) => Promise<void>;
}

export const RuleScheduleModal: React.FC<RuleScheduleModalProps> = ({
  isOpen,
  onClose,
  currentMonthStart,
  availabilities,
  schedules,
  employees,
  staffingTargets,
  analysisHoursRange,
  shiftPresets,
  operatingStartTime,
  operatingEndTime,
  staffingDemandConfig,
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
      setSelectedProposedIds(new Set());
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

    // Filter out proposed shifts already present in schedules
    const uncommittedProposed = selectedProposed.filter(p => {
      const pEmp = p.employeeName.trim().toLowerCase();
      const isAlreadyInSchedules = schedules.some(s =>
        (s.availabilityId && s.availabilityId === p.availabilityId) ||
        (s.employeeName.trim().toLowerCase() === pEmp && s.date === p.date && s.startTime === p.startTime && s.endTime === p.endTime)
      );
      return !isAlreadyInSchedules;
    });

    const proposedAsWorkSchedules: WorkSchedule[] = uncommittedProposed.map(p => ({
      id: p.availabilityId,
      title: p.employeeName,
      employeeName: p.employeeName,
      date: p.date,
      workplace: p.workplace,
      startTime: p.startTime,
      endTime: p.endTime,
      color: 'emerald',
      createdAt: 0
    }));
    return [...schedules, ...proposedAsWorkSchedules];
  }, [schedules, calculationResult, selectedProposedIds]);

  const getStaffingTargetForHour = (hour: number, dateStr?: string) => {
    if (dateStr) {
      const dateMatch = staffingTargets.find(t => t.hour === hour && t.date === dateStr);
      if (dateMatch) return dateMatch.targetCount;
    }
    const defaultMatch = staffingTargets.find(t => t.hour === hour && !t.date);
    return defaultMatch ? defaultMatch.targetCount : 2;
  };

  // Evaluate which dates have unmet operational requirements or overstaffing
  const unmetDateResults = useMemo(() => {
    if (!calculationResult) return [];
    return previewDates.map(dateStr => {
      return checkDayStaffingRequirement(dateStr, combinedPreviewSchedules, {
        operatingStartTime,
        operatingEndTime,
        staffingDemandConfig,
        staffingTargets,
        getStaffingTargetForHour
      });
    }).filter(r => r.hasWarning);
  }, [calculationResult, previewDates, combinedPreviewSchedules, operatingStartTime, operatingEndTime, staffingDemandConfig, staffingTargets]);

  if (!isOpen) return null;

  const handleRunCalculation = () => {
    if (dateRangeList.length === 0) {
      alert('請選擇有效的日期範圍。');
      return;
    }

    const activeEmployeeNames = new Set(
      employees.filter(e => e.active !== false).map(e => e.name.trim().toLowerCase())
    );

    const filteredAvails = availabilities.filter(
      a => dateRangeList.includes(a.date) && a.confirmed !== true && activeEmployeeNames.has(a.employeeName.trim().toLowerCase())
    );

    const result = generateAutoSchedule(
      filteredAvails,
      schedules,
      employees,
      staffingTargets,
      analysisHoursRange,
      shiftPresets,
      {
        dateRange: dateRangeList,
        prioritizeFullTime,
        maxHoursPerShift,
        onlyFillDeficits,
        operatingStartTime,
        operatingEndTime,
        staffingDemandConfig
      }
    );

    setCalculationResult(result);
    setSelectedProposedIds(new Set(result.proposedSchedules.map(p => p.availabilityId)));
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
        <div className="bg-[#EFEBE9] px-6 py-4 border-b border-[#DAC0A3]/50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-[#3E2723] flex items-center gap-2">
              <span className="text-lg text-emerald-700">⚡</span> 程式規則自動排班 (Rule-Based Engine)
            </h3>
            <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
              基於純程式碼確定性演算法，精準落實 4 大排班原則，0 秒極速運算，100% 符合法規約束。
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
          {/* 4 Core Rules Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-amber-500/10 border border-amber-500/25 p-2.5 rounded-xl">
              <div className="text-[11px] font-extrabold text-amber-900 flex items-center gap-1">
                <span>🌅</span> 1. 開早雙人守備
              </div>
              <div className="text-[10px] text-amber-800 mt-1 leading-snug">
                06:30 起算鎖定 2 人，避免門市開店缺工。
              </div>
            </div>

            <div className="bg-indigo-500/10 border border-indigo-500/25 p-2.5 rounded-xl">
              <div className="text-[11px] font-extrabold text-indigo-900 flex items-center gap-1">
                <span>🌙</span> 2. 收班打烊保障
              </div>
              <div className="text-[10px] text-indigo-800 mt-1 leading-snug">
                支援至 17:00–20:00 打烊收班雙人人力。
              </div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/25 p-2.5 rounded-xl">
              <div className="text-[11px] font-extrabold text-emerald-900 flex items-center gap-1">
                <span>👥</span> 3. 人流嚴格上限
              </div>
              <div className="text-[10px] text-emerald-800 mt-1 leading-snug">
                平日每小時≤3人，假日≤4人，嚴禁超額。
              </div>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/25 p-2.5 rounded-xl">
              <div className="text-[11px] font-extrabold text-rose-900 flex items-center gap-1">
                <span>⚖️</span> 4. 勞基法 & 公平輪班
              </div>
              <div className="text-[10px] text-rose-800 mt-1 leading-snug">
                嚴禁連續出勤7天；少班次夥伴優先輪替。
              </div>
            </div>
          </div>

          {/* Settings Section */}
          <div className="glass-panel p-4 rounded-xl border border-[#DAC0A3]/50 space-y-4 bg-white/60">
            <h4 className="text-xs font-bold text-[#5D4037] uppercase tracking-wider">⚙️ 演算設定與排班範圍</h4>

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
                  className="rounded text-emerald-600 focus:ring-emerald-600"
                />
                <span>優先安排正式夥伴 (匹配 8h 標準班別)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#3E2723]">
                <input
                  type="checkbox"
                  checked={onlyFillDeficits}
                  onChange={(e) => setOnlyFillDeficits(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-600"
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

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={handleRunCalculation}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>⚡</span>
                <span>立即執行規則排班演算</span>
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

              {/* Red Warning Card: Dates failing operational requirements or overstaffed */}
              {unmetDateResults.length > 0 && (
                <div className="p-4 bg-rose-50/90 border-2 border-rose-300 rounded-xl space-y-2.5 animate-fade-in shadow-xs">
                  <div className="flex items-center justify-between text-rose-950 font-extrabold text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base leading-none">⚠️</span>
                      <span>
                        共有 {unmetDateResults.length} 個日期未滿足門市規範或人數超標（需主管手動排班修復）：
                      </span>
                    </div>
                    <span className="text-[10px] font-mono bg-rose-100 text-rose-900 border border-rose-200 px-2.5 py-0.5 rounded-full font-black">
                      {unmetDateResults.length} 天需調整
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                    {unmetDateResults.map(item => (
                      <div
                        key={item.date}
                        className="p-2.5 bg-white rounded-lg border border-rose-200 text-xs shadow-2xs flex flex-col gap-1 hover:border-rose-300 transition-colors"
                      >
                        <div className="flex items-center justify-between border-b border-rose-100 pb-1">
                          <span className="font-mono font-black text-rose-950">📅 {item.date}</span>
                          <div className="flex gap-1">
                            {item.isUnderstaffed && (
                              <span className="text-[9.5px] px-1.5 py-0.2 rounded font-black bg-rose-100 text-rose-800 border border-rose-200">
                                缺工
                              </span>
                            )}
                            {item.isOverstaffed && (
                              <span className="text-[9.5px] px-1.5 py-0.2 rounded font-black bg-amber-100 text-amber-900 border border-amber-200">
                                超額
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-rose-800 font-medium leading-tight mt-0.5">
                          {item.issues.join('、')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {calculationResult.proposedSchedules.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-[#DAC0A3]/50 rounded-xl text-xs text-[#6D4C41]">
                  無符合條件可排入的未確認登記
                </div>
              ) : (
                <div className="glass-panel rounded-xl border border-[#DAC0A3]/50 overflow-hidden bg-white/80">
                  <div className="p-3 bg-[#EFEBE9] border-b border-[#DAC0A3]/40 flex justify-between items-center text-xs font-bold text-[#5D4037]">
                    <span>預覽排班列表 ({selectedProposedIds.size} / {calculationResult.proposedSchedules.length} 項已勾選)</span>
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="text-emerald-800 hover:underline cursor-pointer"
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
                          <th className="p-2">班別類型</th>
                          <th className="p-2">排定時段</th>
                          <th className="p-2">效益與規則備註</th>
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
                                  className="rounded text-emerald-600"
                                />
                              </td>
                              <td className="p-2 font-mono font-bold text-[#3E2723]">{proposed.date}</td>
                              <td className="p-2 font-extrabold text-[#3E2723]">👤 {proposed.employeeName}</td>
                              <td className="p-2">
                                {proposed.shiftType === '開早班' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                                    🌅 開早班
                                  </span>
                                )}
                                {proposed.shiftType === '收班班' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                    🌙 收班班
                                  </span>
                                )}
                                {proposed.shiftType === '中段班' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    ☕ 中段班
                                  </span>
                                )}
                                {!proposed.shiftType && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gray-100 text-gray-800 border border-gray-300">
                                    排班
                                  </span>
                                )}
                              </td>
                              <td className="p-2 font-mono font-bold text-emerald-800">
                                {proposed.startTime} - {proposed.endTime}
                              </td>
                              <td className="p-2 text-[#5D4037] text-[11px]">
                                <span className="font-semibold text-emerald-700 mr-2">
                                  +{proposed.coveredDeficitHoursCount}h 缺工
                                </span>
                                <span className="text-[#8D6E63]">
                                  {proposed.reasoning || '符合規則指派'}
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
                        📊 每小時排班人數預覽分析 (規則演算即時預覽)
                      </h4>
                      <p className="text-[11px] text-[#6D4C41] mt-0.5">
                        結合現有班表與選取的規則演算班次，即時預覽各時段配置。確保平日≤3人、週末≤4人上限。
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
                            const dateWarning = unmetDateResults.find(u => u.date === dateStr);
                            return (
                              <div
                                key={dateStr}
                                className={`flex-1 text-center flex flex-col items-center min-w-[24px] px-0.5 rounded transition-all ${
                                  dateWarning
                                    ? 'bg-rose-100/90 border border-rose-400 text-rose-950 font-black ring-1 ring-rose-400'
                                    : isWeekend
                                      ? 'text-red-650 font-bold'
                                      : 'text-[#6D4C41]'
                                }`}
                                title={dateWarning ? `⚠️ 該日需調整：\n${dateWarning.issues.join('\n')}` : undefined}
                              >
                                <span className="text-[12px] font-mono font-bold leading-none">{d}</span>
                                <span className="text-[10px] font-extrabold mt-0.5 opacity-90">{dayName}</span>
                                {dateWarning && (
                                  <span className="text-[8px] font-black text-rose-700 leading-none mt-0.5 animate-pulse">
                                    ⚠️{dateWarning.isOverstaffed && !dateWarning.isUnderstaffed ? '超額' : '缺工'}
                                  </span>
                                )}
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
                                        <div className="flex justify-between items-center text-[10px] mb-1">
                                          <span>目前在勤人數:</span>
                                          <span className="font-mono font-bold text-emerald-300">{count} 人</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] mb-1.5">
                                          <span>建議目標人數:</span>
                                          <span className="font-mono font-bold text-yellow-300">{target} 人</span>
                                        </div>
                                        {workerNames.length > 0 && (
                                          <div className="text-[9px] text-[#FAF7F2]/80 border-t border-[#FAF7F2]/10 pt-1 leading-tight">
                                            {workerNames.join('、')}
                                          </div>
                                        )}
                                        <div className={`absolute top-full -mt-1 border-4 border-transparent border-t-[#3E2723] ${tooltipArrowAlignClass}`}></div>
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-[#EFEBE9] px-6 py-4 border-t border-[#DAC0A3]/50 flex justify-between items-center shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#6D4C41] hover:bg-[#8D6E63]/10 transition-colors cursor-pointer"
          >
            關閉視窗
          </button>
          {calculationResult && (
            <button
              onClick={handleConfirmApply}
              disabled={isApplying || selectedProposedIds.size === 0}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isApplying ? (
                <span>正在寫入排班與更新登記...</span>
              ) : (
                <>
                  <span>✓</span>
                  <span>確認套用所選排班 ({selectedProposedIds.size} 筆)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
