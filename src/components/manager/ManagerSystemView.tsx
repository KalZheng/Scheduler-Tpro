import React from 'react';
import type { ShiftPreset, RevenueStaffRules, StaffingDemandConfig, PtAvailMode } from '../../services/scheduler';
import { ALL_TIME_CHOICES, DAYS_OF_WEEK } from '../../utils/constants';
import { safeConfirm } from '../../utils/dateUtils';
import {
  updateOperatingStartTime,
  updateOperatingEndTime,
  updateStartDay,
  updateDeadlineDay,
  updateShiftPresets,
  updateRevenueStaffRules,
  updateErpDays,
  updatePtAvailMode,
  updateFilenamePrefix,
  updateAllowMonthSwitch,
  updateStaffingDemandConfig
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
  allowMonthSwitch: boolean;
  setAllowMonthSwitch: (val: boolean) => void;
  shiftPresets: ShiftPreset[];
  setShiftPresets: (presets: ShiftPreset[]) => void;
  tempRules: RevenueStaffRules;
  setTempRules: (rules: RevenueStaffRules) => void;
  setRevenueStaffRules: (rules: RevenueStaffRules) => void;
  erpDays: number[];
  setErpDays: (days: number[]) => void;
  ptAvailMode: PtAvailMode;
  setPtAvailMode: (mode: PtAvailMode) => void;
  filenamePrefix: string;
  setFilenamePrefix: (prefix: string) => void;
  staffingDemandConfig: StaffingDemandConfig;
  setStaffingDemandConfig: React.Dispatch<React.SetStateAction<StaffingDemandConfig>>;
  onOpenClearModal?: () => void;
}

const addMinutesToTime = (time: string, mins: number): string => {
  const [h, m] = (time || '00:00').split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  let total = h * 60 + m + mins;
  total = (total + 1440) % 1440;
  const rh = Math.floor(total / 60);
  const rm = total % 60;
  return `${rh.toString().padStart(2, '0')}:${rm.toString().padStart(2, '0')}`;
};

export const ManagerSystemView: React.FC<ManagerSystemViewProps> = ({
  operatingStartTime,
  setOperatingStartTime,
  operatingEndTime,
  setOperatingEndTime,
  startDay,
  setStartDay,
  deadlineDay,
  setDeadlineDay,
  allowMonthSwitch,
  setAllowMonthSwitch,
  shiftPresets,
  setShiftPresets,
  tempRules,
  setTempRules,
  setRevenueStaffRules,
  erpDays,
  setErpDays,
  ptAvailMode,
  setPtAvailMode,
  filenamePrefix,
  setFilenamePrefix,
  staffingDemandConfig,
  setStaffingDemandConfig,
  onOpenClearModal
}) => {

  const handleSaveSystemSettings = async () => {
    try {
      await updateOperatingStartTime(operatingStartTime);
      await updateOperatingEndTime(operatingEndTime);
      await updateStartDay(startDay);
      await updateDeadlineDay(deadlineDay);
      await updateAllowMonthSwitch(allowMonthSwitch);
      await updateShiftPresets(shiftPresets);
      await updateRevenueStaffRules(tempRules);
      await updateErpDays(erpDays);
      await updatePtAvailMode(ptAvailMode);
      await updateFilenamePrefix(filenamePrefix);
      await updateStaffingDemandConfig(staffingDemandConfig);
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
          {/* Section 1: Operating Hours & Staffing (Weekday & Weekend) */}
          <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
                門市營業時間與開早／收班守備設定
              </h4>
              <p className="text-[11px] text-[#8D6E63] mt-1 leading-relaxed">
                開早守備為營運開始前 30 分鐘，收班守備為營運結束前 30 分鐘。可依平日與週末分別設定營業起訖時間。
              </p>
            </div>

            {/* Weekday Operating Hours */}
            <div className="bg-[#FAF7F2]/60 p-3.5 rounded-xl border border-[#EADBC8]/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#5D4037] flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#EFEBE9] text-[#5D4037] font-semibold">平日</span>
                  週一至週五營業區間
                </span>
                <span className="text-[10px] text-[#8D6E63] font-medium">
                  開早: {operatingStartTime} ~ {addMinutesToTime(operatingStartTime, 30)} ｜ 收班: {addMinutesToTime(operatingEndTime, -30)} ~ {operatingEndTime}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">平日開始營業</label>
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
                  <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">平日結束營業</label>
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

            {/* Weekend Operating Hours */}
            <div className="bg-[#FAF7F2]/60 p-3.5 rounded-xl border border-[#EADBC8]/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#8D6E63] flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#FBE9E7] text-[#D84315] font-semibold">週末</span>
                  週六與週日營業區間
                </span>
                <span className="text-[10px] text-[#8D6E63] font-medium">
                  開早: {staffingDemandConfig.operatingStartTimeWeekend} ~ {addMinutesToTime(staffingDemandConfig.operatingStartTimeWeekend, 30)} ｜ 收班: {addMinutesToTime(staffingDemandConfig.operatingEndTimeWeekend, -30)} ~ {staffingDemandConfig.operatingEndTimeWeekend}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">週末開始營業</label>
                  <select
                    value={staffingDemandConfig.operatingStartTimeWeekend}
                    onChange={(e) => setStaffingDemandConfig(prev => ({ ...prev, operatingStartTimeWeekend: e.target.value }))}
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
                  <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">週末結束營業</label>
                  <select
                    value={staffingDemandConfig.operatingEndTimeWeekend}
                    onChange={(e) => setStaffingDemandConfig(prev => ({ ...prev, operatingEndTimeWeekend: e.target.value }))}
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

            {/* Opening & Closing Staff Required */}
            <div className="bg-[#FAF7F2]/60 p-3.5 rounded-xl border border-[#EADBC8]/50 space-y-2.5">
              <span className="text-xs font-bold text-[#3E2723] block">
                開早與收班需求人數
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">開早在勤人數 (人)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={staffingDemandConfig.openingStaffCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setStaffingDemandConfig(prev => ({ ...prev, openingStaffCount: isNaN(val) ? 1 : val }));
                    }}
                    className="w-full glass-input px-3 py-2 rounded-xl text-xs font-bold text-[#3E2723]"
                  />
                  <span className="text-[10px] text-[#A1887F] mt-0.5 block">前 30 分鐘守備標準</span>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">收班在勤人數 (人)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={staffingDemandConfig.closingStaffCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setStaffingDemandConfig(prev => ({ ...prev, closingStaffCount: isNaN(val) ? 1 : val }));
                    }}
                    className="w-full glass-input px-3 py-2 rounded-xl text-xs font-bold text-[#3E2723]"
                  />
                  <span className="text-[10px] text-[#A1887F] mt-0.5 block">後 30 分鐘守備標準</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1.5: Peak Customer Time & Headcount Limit */}
          <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
                來客尖峰時段與在勤人數上限
              </h4>
              <p className="text-[11px] text-[#8D6E63] mt-1 leading-relaxed">
                尖峰時段為全天需求人數最高時段（最忙時間），平日與週末可分別設定尖峰在勤人數上限。
              </p>
            </div>

            <div className="bg-[#FAF7F2]/60 p-3.5 rounded-xl border border-[#EADBC8]/50 space-y-3">
              <div>
                <span className="text-xs font-bold text-[#3E2723] block mb-2">尖峰最忙時段區間</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">尖峰開始時間</label>
                    <select
                      value={staffingDemandConfig.peakStartTime}
                      onChange={(e) => setStaffingDemandConfig(prev => ({ ...prev, peakStartTime: e.target.value }))}
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
                    <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">尖峰結束時間</label>
                    <select
                      value={staffingDemandConfig.peakEndTime}
                      onChange={(e) => setStaffingDemandConfig(prev => ({ ...prev, peakEndTime: e.target.value }))}
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

              <div className="border-t border-[#EADBC8]/40 pt-2.5">
                <span className="text-xs font-bold text-[#3E2723] block mb-2">尖峰在勤人數（最高人力）</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">平日尖峰人數 (人)</label>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={staffingDemandConfig.weekdayMaxStaff}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setStaffingDemandConfig(prev => ({ ...prev, weekdayMaxStaff: isNaN(val) ? 1 : val }));
                      }}
                      className="w-full glass-input px-3 py-2 rounded-xl text-xs font-bold text-[#3E2723]"
                    />
                    <span className="text-[10px] text-[#A1887F] mt-0.5 block">週一至週五尖峰上限</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1">週末尖峰人數 (人)</label>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={staffingDemandConfig.weekendMaxStaff}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setStaffingDemandConfig(prev => ({ ...prev, weekendMaxStaff: isNaN(val) ? 1 : val }));
                      }}
                      className="w-full glass-input px-3 py-2 rounded-xl text-xs font-bold text-[#3E2723]"
                    />
                    <span className="text-[10px] text-[#A1887F] mt-0.5 block">週六與週日尖峰上限</span>
                  </div>
                </div>
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
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
                夥伴登記時間限制
              </h4>
            </div>

            {/* Toggle: Allow month switch */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#FAF7F2]/80 border border-[#DAC0A3]/50 shadow-2xs">
              <div className="space-y-0.5 pr-3">
                <span className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
                  <span>📅</span> 開放員工切換登記月份（允許填寫歷史/其他月份）
                </span>
                <p className="text-[11px] text-[#6D4C41] leading-relaxed">
                  開啟後，員工登記介面將出現「◀ 上個月 / 下個月 ▶」切換按鈕，並自動放行歷史與其他月份之登記編輯權限。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowMonthSwitch}
                onClick={() => setAllowMonthSwitch(!allowMonthSwitch)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  allowMonthSwitch ? 'bg-[#2E7D32]' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    allowMonthSwitch ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {allowMonthSwitch && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                <span className="text-sm">💡</span>
                <span className="font-medium leading-relaxed">
                  已開啟跨月份填寫模式：每月登記起訖日限制已自動放行，下方開放與截止日期設定已自動反灰略過。
                </span>
              </div>
            )}

            <div className={`grid grid-cols-2 gap-4 transition-opacity duration-200 ${allowMonthSwitch ? 'opacity-45' : 'opacity-100'}`}>
              <div>
                <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1.5">
                  開放登記日期：每月的第 {allowMonthSwitch && <span className="text-gray-400 font-normal">(已放行略過)</span>}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    disabled={allowMonthSwitch}
                    value={startDay}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= 31) {
                        setStartDay(val);
                      }
                    }}
                    className={`w-full glass-input px-3 py-2 rounded-xl text-center font-mono text-xs ${
                      allowMonthSwitch ? 'cursor-not-allowed bg-gray-100/80 text-gray-400' : ''
                    }`}
                  />
                  <span className="text-[10px] font-semibold text-[#6D4C41] shrink-0">號</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1.5">
                  截止登記日期：每月的第 {allowMonthSwitch && <span className="text-gray-400 font-normal">(已放行略過)</span>}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    disabled={allowMonthSwitch}
                    value={deadlineDay}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= 31) {
                        setDeadlineDay(val);
                      }
                    }}
                    className={`w-full glass-input px-3 py-2 rounded-xl text-center font-mono text-xs ${
                      allowMonthSwitch ? 'cursor-not-allowed bg-gray-100/80 text-gray-400' : ''
                    }`}
                  />
                  <span className="text-[10px] font-semibold text-[#6D4C41] shrink-0">號</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: ERP Delivery Days */}
          <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
              ERP 進貨/標記日設定
            </h4>
            <p className="text-[11px] text-[#6D4C41]">
              勾選需要在排班網格表格與 Excel 匯出中顯示 ERP 標籤的星期：
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {DAYS_OF_WEEK.map((day) => {
                const isChecked = erpDays.includes(day.value);
                return (
                  <label
                    key={day.value}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-indigo-600/10 border-indigo-600/30 text-indigo-900 shadow-xs'
                        : 'bg-[#FAF7F2]/60 border-[#DAC0A3]/50 text-[#8D6E63] hover:bg-[#FAF7F2]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setErpDays([...erpDays, day.value].sort((a, b) => a - b));
                        } else {
                          setErpDays(erpDays.filter(d => d !== day.value));
                        }
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>{day.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Section 4.1: Excel Export Filename Prefix Settings */}
          <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
              Excel 匯出檔名前綴設定
            </h4>
            <p className="text-[11px] text-[#6D4C41]">
              設定匯出 Excel 排班網格表時的自訂前綴（例如店名「濟南店」），產出的檔名格式為：<br/>
              <code className="text-[10px] bg-amber-50 text-amber-900 px-1.5 py-0.5 rounded border border-amber-200 font-mono font-bold mt-1 inline-block">YYYY-MM-DD_至_YYYY-MM-DD_&#123;前綴&#125;精品咖啡館排班網格表.xlsx</code>
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-[#6D4C41] mb-1.5">檔名前綴 (可留空)</label>
              <input
                type="text"
                value={filenamePrefix}
                onChange={(e) => setFilenamePrefix(e.target.value)}
                placeholder="例如：濟南店 或 門市名稱"
                className="w-full glass-input px-3 py-2 rounded-xl text-xs"
              />
            </div>
            <div className="bg-[#FAF7F2]/80 p-2.5 rounded-xl border border-[#EADBC8]/50 text-[11px] text-[#6D4C41]">
              <span className="font-bold text-[#3E2723]">📄 檔名預覽：</span>
              <span className="font-mono font-bold text-[#795548] ml-1">2026-08-01_至_2026-08-31_{filenamePrefix}精品咖啡館排班網格表.xlsx</span>
            </div>
          </div>

          {/* Section 4.5: PT Avail Mode Settings */}
          <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
              兼職夥伴時間選擇模式設定 (PT Range Slider)
            </h4>
            <p className="text-[11px] text-[#6D4C41]">
              設定兼職同仁在線上登記可用時間時，時間區間滑桿預設的操作方式與彈性：
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPtAvailMode('static')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${ptAvailMode === 'static'
                  ? 'bg-[#795548]/15 border-[#795548] text-[#3E2723] shadow-xs'
                  : 'bg-[#FAF7F2]/60 border-[#DAC0A3]/50 text-[#6D4C41] hover:bg-[#FAF7F2]'
                  }`}
              >
                <div className="text-xs font-bold mb-1 flex items-center gap-1.5 text-[#3E2723]">
                  <span>📌</span> 單端固定模式 (Static Ending)
                </div>
                <div className="text-[11px] text-[#6D4C41] opacity-90 leading-relaxed">
                  固定營業開始/結束時間端點，讓夥伴選擇「工作至此時間」或「自此時間開始」。
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPtAvailMode('flex')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${ptAvailMode === 'flex'
                  ? 'bg-[#795548]/15 border-[#795548] text-[#3E2723] shadow-xs'
                  : 'bg-[#FAF7F2]/60 border-[#DAC0A3]/50 text-[#6D4C41] hover:bg-[#FAF7F2]'
                  }`}
              >
                <div className="text-xs font-bold mb-1 flex items-center gap-1.5 text-[#3E2723]">
                  <span>🔀</span> 雙端彈性模式 (Flex Time Range)
                </div>
                <div className="text-[11px] text-[#6D4C41] opacity-90 leading-relaxed">
                  滑桿雙端皆可自由拖曳調整起訖時間，隱藏「工作至此時間」及「自此時間開始」選擇按鈕。
                </div>
              </button>
            </div>
          </div>

          {/* Section 5: Revenue Staffing Rules */}
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

          {/* Section 5: Batch Reset & Clear Confirmed Schedules */}
          {onOpenClearModal && (
            <div className="border-t border-[#E5DCD5]/60 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-700"></span>
                班表清除與重置管理
              </h4>
              <p className="text-xs text-[#6D4C41] leading-relaxed">
                如需重新演練 AI 智慧排班，可在此選擇日期範圍一鍵清除已確認班表，並將同仁登記之可用時間重置為「待排班」。
              </p>
              <button
                type="button"
                onClick={onOpenClearModal}
                className="w-full py-2.5 bg-rose-700 hover:bg-rose-800 text-white font-extrabold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer border border-rose-700/30 hover:-translate-y-0.5 active:translate-y-0"
              >
                <span className="text-sm">🧹</span>
                <span>選擇日期範圍清除已確認班表 (重置待排班)</span>
              </button>
            </div>
          )}

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
