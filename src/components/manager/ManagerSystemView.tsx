import React from 'react';
import type { ShiftPreset, RevenueStaffRules } from '../../services/scheduler';
import { ALL_TIME_CHOICES } from '../../utils/constants';
import { safeConfirm } from '../../utils/dateUtils';
import {
  updateOperatingStartTime,
  updateOperatingEndTime,
  updateStartDay,
  updateDeadlineDay,
  updateShiftPresets,
  updateRevenueStaffRules
} from '../../services/scheduler';

interface ManagerSystemViewProps {
  operatingStartTime: string;
  setOperatingStartTime: (time: string) => void;
  operatingEndTime: string;
  setOperatingEndTime: (time: string) => void;
  startDay: number;
  setStartDay: (day: number) => void;
  deadlineDay: number;
  setDeadlineDay: (day: number) => void;
  shiftPresets: ShiftPreset[];
  setShiftPresets: (presets: ShiftPreset[]) => void;
  tempRules: RevenueStaffRules;
  setTempRules: (rules: RevenueStaffRules) => void;
  setRevenueStaffRules: (rules: RevenueStaffRules) => void;
}

export const ManagerSystemView: React.FC<ManagerSystemViewProps> = ({
  operatingStartTime,
  setOperatingStartTime,
  operatingEndTime,
  setOperatingEndTime,
  startDay,
  setStartDay,
  deadlineDay,
  setDeadlineDay,
  shiftPresets,
  setShiftPresets,
  tempRules,
  setTempRules,
  setRevenueStaffRules
}) => {

  const handleSaveSystemSettings = async () => {
    try {
      await updateOperatingStartTime(operatingStartTime);
      await updateOperatingEndTime(operatingEndTime);
      await updateStartDay(startDay);
      await updateDeadlineDay(deadlineDay);
      await updateShiftPresets(shiftPresets);
      await updateRevenueStaffRules(tempRules);
      setRevenueStaffRules(tempRules);
      alert('已成功儲存系統管理設定！');
    } catch (error) {
      console.error('Failed to save system settings:', error);
      alert('儲存失敗，請稍後再試。');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in bg-white/40 p-6 rounded-2xl border border-[#DAC0A3]/50">
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-[#3E2723] flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
          系統管理設定
        </h2>
        <p className="text-xs text-[#6D4C41]">
          在此管理系統的全域規則與設定參數。
        </p>
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm bg-white/70 space-y-6 max-w-xl">
        <div>
          <h3 className="text-sm font-bold text-[#3E2723] flex items-center gap-2">
            <span>⚙️</span> 門市營業時間與排班限制設定
          </h3>
          <p className="text-xs text-[#6D4C41] mt-1.5 leading-relaxed">
            在此管理門市營運時間區間，以及每個月夥伴線上填寫排班登記的起訖日期限制。
          </p>
        </div>

        <div className="space-y-4">
          {/* Section 1: Operating Hours */}
          <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
              門市營業/排班時間區間
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1.5">營業開始時間</label>
                <select
                  value={operatingStartTime}
                  onChange={(e) => setOperatingStartTime(e.target.value)}
                  className="w-full glass-input px-3 py-2 rounded-xl text-xs cursor-pointer"
                >
                  {ALL_TIME_CHOICES.map(choice => (
                    <option key={choice} value={choice} className="bg-white text-[#3E2723]">
                      {choice}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1.5">營業結束時間</label>
                <select
                  value={operatingEndTime}
                  onChange={(e) => setOperatingEndTime(e.target.value)}
                  className="w-full glass-input px-3 py-2 rounded-xl text-xs cursor-pointer"
                >
                  {ALL_TIME_CHOICES.map(choice => (
                    <option key={choice} value={choice} className="bg-white text-[#3E2723]">
                      {choice}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Shift Presets Settings */}
          <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
                常用班次設定
              </h4>
              <button
                type="button"
                onClick={() => {
                  const newName = prompt('請輸入新班次名稱（例如：中班）：');
                  if (!newName) return;
                  if (shiftPresets.some(p => p.name === newName)) {
                    alert('班次名稱已存在！');
                    return;
                  }
                  const updated = [
                    ...shiftPresets,
                    { name: newName, startTime: '08:00', endTime: '17:00' }
                  ];
                  setShiftPresets(updated);
                }}
                className="text-[10px] bg-[#FAF7F2] border border-[#DAC0A3] hover:border-[#8D6E63] text-[#8D6E63] font-bold px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1"
              >
                <span>➕</span> 新增班次
              </button>
            </div>

            <div className="space-y-3">
              {shiftPresets.map((preset, pIdx) => (
                <div key={preset.name} className="flex items-center gap-3 bg-[#FAF7F2]/50 p-3 rounded-xl border border-[#EADBC8]/40">
                  <span className="text-xs font-bold text-[#3E2723] w-16 truncate">{preset.name}</span>
                  <div className="flex items-center gap-1.5 flex-1">
                    <select
                      value={preset.startTime}
                      onChange={(e) => {
                        const updated = [...shiftPresets];
                        updated[pIdx].startTime = e.target.value;
                        setShiftPresets(updated);
                      }}
                      className="w-full glass-input px-2.5 py-1.5 rounded-xl text-xs cursor-pointer"
                    >
                      {ALL_TIME_CHOICES.map(choice => (
                        <option key={choice} value={choice} className="bg-white text-[#3E2723]">
                          {choice}
                        </option>
                      ))}
                    </select>
                    <span className="text-[#8D6E63] text-xs font-bold">~</span>
                    <select
                      value={preset.endTime}
                      onChange={(e) => {
                        const updated = [...shiftPresets];
                        updated[pIdx].endTime = e.target.value;
                        setShiftPresets(updated);
                      }}
                      className="w-full glass-input px-2.5 py-1.5 rounded-xl text-xs cursor-pointer"
                    >
                      {ALL_TIME_CHOICES.map(choice => (
                        <option key={choice} value={choice} className="bg-white text-[#3E2723]">
                          {choice}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (shiftPresets.length <= 1) {
                        alert('必須保留至少一個常用班次！');
                        return;
                      }
                      if (safeConfirm(`確定要刪除「${preset.name}」班次嗎？`)) {
                        const updated = shiftPresets.filter((_, idx) => idx !== pIdx);
                        setShiftPresets(updated);
                      }
                    }}
                    className="p-1.5 text-red-500 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors cursor-pointer"
                    title="刪除此班次"
                  >
                    ❌
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Registration Limits */}
          <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
              夥伴登記時間限制
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1.5">開放登記日期：每月的第</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={startDay}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= 31) {
                        setStartDay(val);
                      }
                    }}
                    className="w-full glass-input px-3 py-2 rounded-xl text-center font-mono text-xs"
                  />
                  <span className="text-[10px] font-semibold text-[#6D4C41] shrink-0">號</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1.5">截止登記日期：每月的第</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={deadlineDay}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= 31) {
                        setDeadlineDay(val);
                      }
                    }}
                    className="w-full glass-input px-3 py-2 rounded-xl text-center font-mono text-xs"
                  />
                  <span className="text-[10px] font-semibold text-[#6D4C41] shrink-0">號</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Revenue Staffing Rules */}
          <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
              營業額建議排班人數對照規則設定
            </h4>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-[#6D4C41] mb-1">第一階段營業額 (元以下)</label>
                  <input
                    type="number"
                    min="0"
                    value={tempRules.tier1Limit}
                    onChange={(e) => setTempRules({ ...tempRules, tier1Limit: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full glass-input px-3 py-1.5 rounded-xl font-mono text-xs text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#6D4C41] mb-1">第一階段建議人數 (人)</label>
                  <input
                    type="number"
                    min="1"
                    value={tempRules.tier1Staff}
                    onChange={(e) => setTempRules({ ...tempRules, tier1Staff: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full glass-input px-3 py-1.5 rounded-xl font-mono text-xs text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-[#6D4C41] mb-1">第二階段營業額 (元以下)</label>
                  <input
                    type="number"
                    min="0"
                    value={tempRules.tier2Limit}
                    onChange={(e) => setTempRules({ ...tempRules, tier2Limit: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full glass-input px-3 py-1.5 rounded-xl font-mono text-xs text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#6D4C41] mb-1">第二階段建議人數 (人)</label>
                  <input
                    type="number"
                    min="1"
                    value={tempRules.tier2Staff}
                    onChange={(e) => setTempRules({ ...tempRules, tier2Staff: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full glass-input px-3 py-1.5 rounded-xl font-mono text-xs text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-[#6D4C41] mb-1">第三階段營業額 (元以下)</label>
                  <input
                    type="number"
                    min="0"
                    value={tempRules.tier3Limit}
                    onChange={(e) => setTempRules({ ...tempRules, tier3Limit: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full glass-input px-3 py-1.5 rounded-xl font-mono text-xs text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#6D4C41] mb-1">第三階段建議人數 (人)</label>
                  <input
                    type="number"
                    min="1"
                    value={tempRules.tier3Staff}
                    onChange={(e) => setTempRules({ ...tempRules, tier3Staff: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full glass-input px-3 py-1.5 rounded-xl font-mono text-xs text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[#6D4C41] mb-1">第四階段基準人數 (人)</label>
                  <input
                    type="number"
                    min="1"
                    value={tempRules.tier4Staff}
                    onChange={(e) => setTempRules({ ...tempRules, tier4Staff: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full glass-input px-3 py-1.5 rounded-xl font-mono text-xs text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#6D4C41] mb-1">每增加營業額額度 (元)</label>
                  <input
                    type="number"
                    min="1"
                    value={tempRules.incrementAmount}
                    onChange={(e) => setTempRules({ ...tempRules, incrementAmount: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full glass-input px-3 py-1.5 rounded-xl font-mono text-xs text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#6D4C41] mb-1">最高建議人數上限 (人)</label>
                  <input
                    type="number"
                    min="1"
                    value={tempRules.maxStaff}
                    onChange={(e) => setTempRules({ ...tempRules, maxStaff: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full glass-input px-3 py-1.5 rounded-xl font-mono text-xs text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E5DCD5]">
            <button
              type="button"
              onClick={handleSaveSystemSettings}
              className="w-full py-3 bg-[#795548] hover:bg-[#5D4037] text-white font-bold rounded-xl text-sm transition-all shadow-md cursor-pointer"
            >
              儲存所有設定項目
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
