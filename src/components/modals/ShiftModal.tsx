import React from 'react';
import type { Employee, WorkSchedule, WorkerAvailability, ShiftPreset } from '../../services/scheduler';
import workplaces from '../../config/workplaces.json';
import { formatDateString, formatMMDD, isOverEightHours, calculateDuration, hasSevenConsecutiveDays } from '../../utils/dateUtils';

interface ShiftModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  editingId: string | null;
  employeeName: string;
  setEmployeeName: (val: string) => void;
  workplace: string;
  setWorkplace: (val: string) => void;
  startTime: string;
  setStartTime: (val: string) => void;
  endTime: string;
  setEndTime: (val: string) => void;
  notes: string;
  setNotes: (val: string) => void;
  workerNotes: string;
  registerTime: string;
  selectedDates: string[];
  setSelectedDates: (val: string[]) => void;
  singleDate: string;
  setSingleDate: (val: string) => void;
  pickerDates: Date[];
  timeSlots: string[];
  shiftPresets: ShiftPreset[];
  employees: Employee[];
  schedules: WorkSchedule[];
  availabilities: WorkerAvailability[];
  currentMonthStart: Date;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  handleEmployeeNameChange: (newName: string) => void;
  getAvailabilitiesForDate: (dateStr: string) => WorkerAvailability[];
  toggleDateSelection: (dateStr: string) => void;
  handleSelectAllDays: () => void;
  handleSelectMonWedFri: () => void;
  handleSelectTueThu: () => void;
  handleClearAllSelected: () => void;
  setFormOriginalStartTime: (val: string | null) => void;
  setFormOriginalEndTime: (val: string | null) => void;
}

export const ShiftModal: React.FC<ShiftModalProps> = ({
  isOpen,
  mode,
  editingId,
  employeeName,
  workplace,
  setWorkplace,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  notes,
  setNotes,
  workerNotes,
  registerTime,
  selectedDates,
  singleDate,
  setSingleDate,
  pickerDates,
  timeSlots,
  shiftPresets,
  employees,
  schedules,
  availabilities,
  currentMonthStart,
  onClose,
  onSubmit,
  onDelete,
  handleEmployeeNameChange,
  getAvailabilitiesForDate,
  toggleDateSelection,
  handleSelectAllDays,
  handleSelectMonWedFri,
  handleSelectTueThu,
  handleClearAllSelected,
  setFormOriginalStartTime,
  setFormOriginalEndTime
}) => {
  if (!isOpen) return null;

  const todayStr = formatDateString(new Date());

  return (
    <div className="fixed inset-0 bg-[#3E2723]/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-panel rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-[#DAC0A3]/50 flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-[#DAC0A3]/35 flex items-center justify-between">
          <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
            {mode === 'create' ? '新增排班時段 (可複選日期)' : '編輯排班時段'}
          </h3>
          <button
            onClick={onClose}
            className="text-[#6D4C41] hover:text-[#3E2723] p-1.5 rounded-lg hover:bg-[#FAF7F2] transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={onSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          {/* Quick Autofill Helper in Add Modal */}
          {mode === 'create' && selectedDates.length === 1 && (() => {
            const availableWorkers = getAvailabilitiesForDate(selectedDates[0]).filter(
              avail => !(avail.startTime === '00:00' && avail.endTime === '00:00')
            );

            return (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider">
                  從今日登記可用人員中快速填入
                </label>
                {availableWorkers.length === 0 ? (
                  <div className="text-[10px] text-[#6D4C41] py-2 px-3 bg-[#FAF7F2] rounded-xl border border-[#DAC0A3]/40 text-center">
                    此日無夥伴登記可用時間
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 p-2 bg-[#FAF7F2] rounded-xl border border-[#DAC0A3]/40">
                    <div className="flex flex-wrap gap-1.5">
                      {availableWorkers.map(avail => {
                        const isCurrentlySelected = employeeName === avail.employeeName &&
                          workplace === avail.workplace &&
                          startTime === avail.startTime &&
                          endTime === avail.endTime;
                        return (
                          <button
                            key={avail.id}
                            type="button"
                            onClick={() => {
                              handleEmployeeNameChange(avail.employeeName);
                              setWorkplace(avail.workplace);
                              setStartTime(avail.startTime);
                              setEndTime(avail.endTime);
                              setNotes(avail.notes || '');
                              setFormOriginalStartTime(avail.startTime);
                              setFormOriginalEndTime(avail.endTime);
                            }}
                            className={`text-[10px] px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer font-bold flex items-center gap-1 ${isCurrentlySelected
                              ? 'bg-[#795548] border-[#795548] text-white shadow-sm shadow-[#795548]/15'
                              : 'bg-white border border-[#DAC0A3]/55 hover:border-[#8D6E63] text-[#5D4037] hover:text-[#3E2723]'
                              }`}
                          >
                            <span>👤 {avail.employeeName}</span>
                            <span className="opacity-60 text-[9px] font-mono">({avail.startTime}-{avail.endTime} @ {avail.workplace})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Employee Name */}
          <div>
            <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">排班人員姓名</label>
            <select
              required
              value={employeeName}
              onChange={(e) => handleEmployeeNameChange(e.target.value)}
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
            >
              <option value="" className="bg-white text-[#3E2723]">請選擇排班夥伴...</option>
              {employees.filter(emp => emp.active !== false).map(emp => (
                <option key={emp.id} value={emp.name} className="bg-white text-[#3E2723]">
                  {emp.name} ({emp.status}{emp.trainingPosition ? ` - 訓練中：${emp.trainingPosition}` : ''}{emp.trainedPositions && emp.trainedPositions.length > 0 ? ` - 已合格：${emp.trainedPositions.join(', ')}` : ''}{emp.certificates && emp.certificates.length > 0 ? ` - 證照：${emp.certificates.join(', ')}` : ''})
                </option>
              ))}
            </select>
          </div>

          {/* Workplace Selection */}
          <div>
            <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">工作地點</label>
            <select
              value={workplace}
              onChange={(e) => setWorkplace(e.target.value)}
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
            >
              {workplaces.map(loc => (
                <option key={loc.id} value={loc.name} className="bg-white text-[#3E2723]">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Selection */}
          {mode === 'create' ? (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider">選擇排班日期 (可複選)</label>
                <span className="text-[10px] text-[#8D6E63] font-bold bg-[#8D6E63]/10 px-2 py-0.5 rounded font-mono">
                  已選 {selectedDates.length} 天
                </span>
              </div>

              {/* Quick select shortcuts */}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                <button
                  type="button"
                  onClick={handleSelectMonWedFri}
                  className="text-[10px] px-2 py-1 rounded bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] hover:border-[#8D6E63] hover:text-[#3E2723] cursor-pointer font-bold transition-all"
                >
                  一/三/五
                </button>
                <button
                  type="button"
                  onClick={handleSelectTueThu}
                  className="text-[10px] px-2 py-1 rounded bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] hover:border-[#8D6E63] hover:text-[#3E2723] cursor-pointer font-bold transition-all"
                >
                  二/四
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllDays}
                  className="text-[10px] px-2 py-1 rounded bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] hover:border-[#8D6E63] hover:text-[#3E2723] cursor-pointer font-bold transition-all"
                >
                  全選 (四週)
                </button>
                <button
                  type="button"
                  onClick={handleClearAllSelected}
                  className="text-[10px] px-2 py-1 rounded bg-[#FAF7F2] border border-[#E5DCD5] text-[#8D6E63] hover:border-[#8D6E63] hover:text-[#3E2723] cursor-pointer font-bold transition-all"
                >
                  清除
                </button>
              </div>

              {/* 4-Week Grid */}
              <div className="p-2 border border-[#E5DCD5] rounded-xl bg-[#FAF7F2]/50">
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[#8D6E63] font-bold mb-1">
                  <div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {pickerDates.map(dateObj => {
                    const dateStr = formatDateString(dateObj);
                    const isSelected = selectedDates.includes(dateStr);
                    const isToday = dateStr === todayStr;
                    const isCurrentMonth = dateObj.getMonth() === currentMonthStart.getMonth();

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => toggleDateSelection(dateStr)}
                        className={`relative py-1.5 px-0.5 rounded-lg border text-center transition-all cursor-pointer text-[10px] font-mono font-bold flex flex-col items-center justify-center ${isSelected
                          ? 'bg-[#795548]/15 border-[#795548] text-[#3E2723] shadow-xs'
                          : isCurrentMonth
                            ? 'bg-white border-[#E5DCD5] text-[#8D6E63] hover:border-[#8D6E63] hover:bg-[#FAF7F2]'
                            : 'bg-[#FAF7F2]/50 border-dashed border-[#E5DCD5]/55 text-[#8D6E63]/40 opacity-40 hover:bg-[#FAF7F2]'
                          } ${isToday ? 'ring-1 ring-[#795548]/40' : ''}`}
                        title={formatDateString(dateObj)}
                      >
                        <span>{formatMMDD(dateObj)}</span>
                        {isToday && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#795548]"></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">排班日期</label>
              <input
                type="date"
                required
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
              />
            </div>
          )}

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">開始時間</label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
              >
                {timeSlots.map(slot => (
                  <option key={slot} value={slot} className="bg-white text-[#3E2723] font-mono">
                    {slot}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">結束時間</label>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
              >
                {timeSlots.map(slot => (
                  <option key={slot} value={slot} className="bg-white text-[#3E2723] font-mono">
                    {slot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Shift Presets */}
          {shiftPresets.some(preset => timeSlots.includes(preset.startTime) && timeSlots.includes(preset.endTime)) && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider">常用班次快捷鍵</label>
              <div className="flex flex-wrap gap-2">
                {shiftPresets.map((preset) => {
                  const isAvailable = timeSlots.includes(preset.startTime) && timeSlots.includes(preset.endTime);
                  if (!isAvailable) return null;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setStartTime(preset.startTime);
                        setEndTime(preset.endTime);
                      }}
                      className={`flex-1 min-w-[120px] py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${startTime === preset.startTime && endTime === preset.endTime
                        ? 'bg-[#795548] text-white border-[#795548]'
                        : 'bg-white text-[#8D6E63] border-[#DAC0A3]/50 hover:border-[#8D6E63] hover:bg-[#FAF7F2]'
                        }`}
                    >
                      {preset.name} ({preset.startTime} - {preset.endTime})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto calculated hours warning/info */}
          {startTime && endTime && (
            <div className={`px-4 py-2.5 rounded-xl border flex items-center justify-between ${isOverEightHours(startTime, endTime)
              ? 'bg-amber-50 border-amber-200'
              : 'bg-[#FAF7F2] border-[#E5DCD5]'
              }`}>
              <span className="text-xs text-[#6D4C41]">預估單次工時：</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold font-mono ${isOverEightHours(startTime, endTime) ? 'text-amber-700' : 'text-[#795548]'
                  }`}>
                  {calculateDuration(startTime, endTime)} 小時（含休息）
                </span>
                {isOverEightHours(startTime, endTime) && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">⚠️ 超過 8 小時</span>
                )}
              </div>
            </div>
          )}

          {/* Consecutive 7 days warning */}
          {(() => {
            if (!employeeName.trim()) return null;
            const targetName = employeeName.trim();
            let datesToCheck: string[] = [];
            if (mode === 'create' && selectedDates.length > 0) {
              const existingDates = schedules
                .filter(s => s.employeeName.trim().toLowerCase() === targetName.toLowerCase())
                .map(s => s.date);
              datesToCheck = Array.from(new Set([...existingDates, ...selectedDates]));
            } else if (mode === 'edit' && singleDate) {
              const existingDates = schedules
                .filter(s => s.employeeName.trim().toLowerCase() === targetName.toLowerCase() && s.id !== editingId)
                .map(s => s.date);
              datesToCheck = Array.from(new Set([...existingDates, singleDate]));
            }
            if (!hasSevenConsecutiveDays(datesToCheck)) return null;
            return (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                <span className="text-base leading-none mt-0.5">🚫</span>
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-red-700">不可連續排班 7 天</p>
                  <p className="text-[11px] text-red-600 leading-snug">
                    此排班將使「{targetName}」出現連續 7 天或以上的班次，違反勞工法規。請調整日期。
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Off-day conflict warning */}
          {(() => {
            if (!employeeName.trim()) return null;
            const targetName = employeeName.trim().toLowerCase();
            const checkDates = mode === 'create' ? selectedDates : [singleDate];

            const conflictingDates = checkDates.filter(d => {
              const monthStr = d.substring(0, 7);
              const monthAvails = availabilities.filter(
                a => a.employeeName.trim().toLowerCase() === targetName &&
                  a.date.startsWith(monthStr)
              );
              if (monthAvails.length === 0) return false;

              const isAvailable = monthAvails.some(
                a => a.date === d && !(a.startTime === '00:00' && a.endTime === '00:00')
              ) || schedules.some(
                s => s.employeeName.trim().toLowerCase() === targetName && s.date === d
              );
              return !isAvailable;
            });

            if (conflictingDates.length === 0) return null;
            return (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-amber-700">休假/非配合工作日衝突</p>
                  <p className="text-[11px] text-amber-600 leading-snug">
                    「{employeeName.trim()}」在 {conflictingDates.join(', ')} 並無登記配合排班（即休息日或未登記）。確定仍要安排班次嗎？
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Notes */}
          <div className="space-y-4">
            {mode === 'edit' && registerTime && (
              <div className="p-3 rounded-xl bg-[#E8F5E9]/70 border border-emerald-200">
                <span className="block text-xs font-bold text-[#2E7D32] mb-1">🕒 同仁登記可用時間</span>
                <p className="text-xs text-[#1B5E20] font-bold font-mono">{registerTime}</p>
              </div>
            )}
            {mode === 'edit' && workerNotes && (
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                <span className="block text-xs font-bold text-indigo-850 mb-1">💬 同仁登記備註</span>
                <p className="text-xs text-indigo-900 break-words whitespace-pre-wrap">{workerNotes}</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">
                {mode === 'edit' && workerNotes ? '主管備註項目 (選填)' : '備註項目 (選填)'}
              </label>
              <textarea
                placeholder="主管注意事項、特別交辦事項..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm min-h-[70px] resize-none placeholder-[#8D6E63]/50"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 border-t border-[#E5DCD5] pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white hover:bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] font-semibold px-4 py-3 rounded-xl transition-all cursor-pointer text-center text-sm"
            >
              取消
            </button>
            {mode === 'edit' && editingId && (
              <button
                type="button"
                onClick={(e) => onDelete(editingId, e)}
                className="flex-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-650 hover:text-red-700 font-semibold px-4 py-3 rounded-xl transition-all cursor-pointer text-center text-sm"
              >
                刪除
              </button>
            )}
            <button
              type="submit"
              className="flex-1 bg-[#795548] hover:bg-[#5D4037] text-white font-semibold px-4 py-3 rounded-xl transition-all shadow-lg shadow-[#795548]/10 cursor-pointer text-center text-sm"
            >
              儲存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
