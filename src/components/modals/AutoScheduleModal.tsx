import React, { useState, useMemo, useEffect } from 'react';
import type { WorkSchedule, WorkerAvailability, Employee, StaffingTarget, ShiftPreset } from '../../services/scheduler';
import { generateAutoSchedule } from '../../utils/autoScheduler';
import type { ProposedSchedule, AutoScheduleResult } from '../../utils/autoScheduler';
import { formatDateString, getDaysInMonth, getDatesInRange } from '../../utils/dateUtils';

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

  if (!isOpen) return null;

  const handleRunCalculation = () => {
    if (dateRangeList.length === 0) {
      alert('請選擇有效的日期範圍。');
      return;
    }

    const result = generateAutoSchedule(
      availabilities,
      schedules,
      employees,
      staffingTargets,
      analysisHoursRange,
      shiftPresets,
      {
        dateRange: dateRangeList,
        prioritizeFullTime,
        maxHoursPerShift,
        onlyFillDeficits
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
      <div className="bg-[#FAF7F2] border border-[#DAC0A3] w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleRunCalculation}
                className="bg-[#795548] hover:bg-[#5D4037] text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>⚡</span> 開始智能演算預覽
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
