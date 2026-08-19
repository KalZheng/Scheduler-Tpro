import React from 'react';
import type { WorkSchedule, WorkerAvailability, Employee } from '../../services/scheduler';
import { DAYS_OF_WEEK, COLOR_THEMES } from '../../utils/constants';
import { formatDateString, formatMMDD, getCleanNote, getColorFromName, isShiftActiveAtHour } from '../../utils/dateUtils';

interface ManagerSelectedDateDetailProps {
  selectedDateStr: string;
  setSelectedDateStr: (dateStr: string) => void;
  schedules: WorkSchedule[];
  availabilities: WorkerAvailability[];
  employees: Employee[];
  analysisHoursRange: number[];
  getScheduleTheme: (schedule: WorkSchedule) => any;
  getManagerNote: (schedule: WorkSchedule) => string;
  handleOpenEditModal: (schedule: WorkSchedule, e: React.MouseEvent) => void;
  handleDelete: (id: string, e: React.MouseEvent) => void;
  handleInstantAssign: (avail: WorkerAvailability) => void;
  setModalMode: (mode: 'create' | 'edit') => void;
  setEditingId: (id: string | null) => void;
  setEmployeeName: (name: string) => void;
  setWorkplace: (wp: string) => void;
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;
  setNotes: (notes: string) => void;
  setSelectedDates: (dates: string[]) => void;
  setFormOriginalStartTime: (time: string | null) => void;
  setFormOriginalEndTime: (time: string | null) => void;
  setIsModalOpen: (open: boolean) => void;
  getStaffingTargetForHour: (hour: number, dateStr?: string) => number;
  updateStaffingTarget: (hour: number, targetCount: number, dateStr?: string) => Promise<void>;
}

export const ManagerSelectedDateDetail: React.FC<ManagerSelectedDateDetailProps> = ({
  selectedDateStr,
  setSelectedDateStr,
  schedules,
  availabilities,
  employees,
  analysisHoursRange,
  getScheduleTheme,
  getManagerNote,
  handleOpenEditModal,
  handleDelete,
  handleInstantAssign,
  setModalMode,
  setEditingId,
  setEmployeeName,
  setWorkplace,
  setStartTime,
  setEndTime,
  setNotes,
  setSelectedDates,
  setFormOriginalStartTime,
  setFormOriginalEndTime,
  setIsModalOpen,
  getStaffingTargetForHour,
  updateStaffingTarget
}) => {
  const [y, m, d] = selectedDateStr.split('-').map(Number);
  const selectedDateObject = new Date(y, m - 1, d);
  const dayOfWeekIndex = selectedDateObject.getDay();
  const mappedDayIndex = dayOfWeekIndex === 0 ? 7 : dayOfWeekIndex;
  const selectedDayInfo = DAYS_OF_WEEK.find(item => item.value === mappedDayIndex) || DAYS_OF_WEEK[0];

  const selectedDateShifts = schedules.filter(s => s.date === selectedDateStr);
  const dayAvailabilities = availabilities.filter(a => a.date === selectedDateStr);

  const handleAdjustSelectedDate = (delta: number) => {
    const nextDate = new Date(selectedDateObject);
    nextDate.setDate(nextDate.getDate() + delta);
    setSelectedDateStr(formatDateString(nextDate));
  };

  const handleUpdateTarget = (hour: number, delta: number) => {
    const current = getStaffingTargetForHour(hour, selectedDateStr);
    const updated = Math.max(0, current + delta);
    updateStaffingTarget(hour, updated, selectedDateStr);
  };

  const availableWorkers = dayAvailabilities.filter(a => !(a.startTime === '00:00' && a.endTime === '00:00'));
  const legacyOffWorkers = dayAvailabilities.filter(a => a.startTime === '00:00' && a.endTime === '00:00');

  const monthStr = selectedDateStr.substring(0, 7);
  const ftEmployees = employees.filter(e => e.status === '正式夥伴' && e.active !== false);

  const implicitOffWorkers = ftEmployees.filter(emp => {
    const empName = emp.name.trim();
    const hasRegisteredInMonth = availabilities.some(
      a => a.employeeName.trim().toLowerCase() === empName.toLowerCase() &&
        a.date.startsWith(monthStr)
    );
    if (!hasRegisteredInMonth) return false;

    const hasAvailToday = availabilities.some(
      a => a.employeeName.trim().toLowerCase() === empName.toLowerCase() && a.date === selectedDateStr
    );
    return !hasAvailToday;
  }).map(emp => {
    const monthNotes = availabilities.find(
      a => a.employeeName.trim().toLowerCase() === emp.name.trim().toLowerCase() &&
        a.date.startsWith(monthStr) &&
        a.notes &&
        a.notes.trim()
    )?.notes || '休假';

    return {
      id: `virtual-off-${emp.name}-${selectedDateStr}`,
      employeeName: emp.name,
      date: selectedDateStr,
      workplace: '不克排班',
      startTime: '00:00',
      endTime: '00:00',
      notes: monthNotes,
      isVirtual: true
    };
  });

  const offWorkers = [...legacyOffWorkers, ...implicitOffWorkers];

  return (
    <div className="space-y-6 animate-fade-in pt-2">
      {/* Today's Available Workers Panel */}
      <section className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#8D6E63]"></span>
            今日可用人員 ({formatMMDD(selectedDateObject)})
          </h3>
          <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
            以下為此日登記可配合上班的同仁。點擊「直接排班」可一鍵排入，或點擊「調整」自訂排程細節。
          </p>
        </div>

        {availableWorkers.length === 0 ? (
          <div className="py-8 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-xl">
            <p className="text-xs text-[#6D4C41]/80 font-medium">今日尚無同仁填寫可用時間</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {availableWorkers.map(avail => {
              const theme = COLOR_THEMES[getColorFromName(avail.employeeName)] || COLOR_THEMES.indigo;
              return (
                <div
                  key={avail.id}
                  className={`glass-card p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${theme.bg} ${theme.border}`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold flex items-center gap-1 ${theme.text} font-mono`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`}></span>
                        登記：{avail.startTime} - {avail.endTime}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/80 text-[#5D4037] border border-[#DAC0A3]/40 font-bold">
                        📍 {avail.workplace}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-[#3E2723] text-sm">
                      👤 {avail.employeeName}
                    </h4>
                    {avail.notes && (
                      <p className="text-[10px] text-[#5D4037] bg-white/60 p-1.5 rounded border border-[#DAC0A3]/40 border-dashed truncate">
                        📝 {avail.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleInstantAssign(avail)}
                      className="flex-1 py-2 bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm hover:shadow-[#2E7D32]/10"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      直接排班
                    </button>
                    <button
                      onClick={() => {
                        setModalMode('create');
                        setEditingId(null);
                        setEmployeeName(avail.employeeName);
                        setWorkplace(avail.workplace);
                        setStartTime(avail.startTime);
                        setEndTime(avail.endTime);
                        setNotes(avail.notes || '');
                        setSelectedDates([selectedDateStr]);
                        setFormOriginalStartTime(avail.startTime);
                        setFormOriginalEndTime(avail.endTime);
                        setIsModalOpen(true);
                      }}
                      className="px-3 py-2 bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/60 hover:border-[#8D6E63] text-[#5D4037] font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                      title="調整排班細節"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                      調整
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {offWorkers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#DAC0A3]/30 space-y-2">
            <h4 className="text-xs font-bold text-red-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-655 animate-pulse"></span>
              今日請假/休假同仁 ({offWorkers.length}人)
            </h4>
            <div className="flex flex-wrap gap-2">
              {offWorkers.map(avail => (
                <div
                  key={avail.id}
                  className="text-xs py-1.5 px-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-bold flex items-center gap-1.5 shadow-xs"
                  title={avail.notes ? `備註: ${getCleanNote(avail.notes)}` : undefined}
                >
                  <span>👤 {avail.employeeName}</span>
                  <span className="text-[10px] px-1 bg-red-100 text-red-800 rounded font-normal scale-90">休假</span>
                  {avail.notes && <span className="opacity-75 font-normal">({getCleanNote(avail.notes)})</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Selected Date Detail Block */}
      <section className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#DAC0A3]/35 pb-3">
          <div>
            <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
              {selectedDateStr} ({selectedDayInfo.name}) 已排定班次 ({selectedDateShifts.length}人)
            </h3>
            <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
              點擊班次卡片可進行編輯，或點擊右側按鈕進行管理。
            </p>
          </div>
          <button
            onClick={() => {
              setModalMode('create');
              setEditingId(null);
              setEmployeeName('');
              setWorkplace('咖啡吧檯');
              setStartTime('09:00');
              setEndTime('17:00');
              setNotes('');
              setSelectedDates([selectedDateStr]);
              setFormOriginalStartTime(null);
              setFormOriginalEndTime(null);
              setIsModalOpen(true);
            }}
            className="text-xs bg-[#795548] hover:bg-[#6D4C41] text-white font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <span>➕</span> 新增此日班次
          </button>
        </div>

        {selectedDateShifts.length === 0 ? (
          <div className="py-8 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-xl">
            <p className="text-xs text-[#6D4C41]/80 font-medium">此日期目前尚無排定班次</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {selectedDateShifts.map(schedule => {
              const theme = getScheduleTheme(schedule);
              const managerNote = getManagerNote(schedule);
              return (
                <div
                  key={schedule.id}
                  onClick={(e) => handleOpenEditModal(schedule, e)}
                  className={`glass-card p-3.5 rounded-xl border flex flex-col justify-between gap-3 cursor-pointer transition-all hover:scale-[1.01] ${theme.bg} ${theme.border}`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold flex items-center gap-1 ${theme.text} font-mono`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`}></span>
                        {schedule.startTime} - {schedule.endTime}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/80 text-[#5D4037] border border-[#DAC0A3]/40 font-bold">
                        📍 {schedule.workplace || '咖啡吧檯'}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-[#3E2723] text-sm flex items-center justify-between">
                      <span>👤 {schedule.employeeName}</span>
                      {schedule.markedBlue && <span className="text-xs">🔵</span>}
                    </h4>
                    {managerNote && (
                      <p className="text-[10px] text-[#5D4037] bg-white/60 p-1.5 rounded border border-[#DAC0A3]/40 border-dashed truncate">
                        📝 {managerNote}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end items-center gap-2 pt-1 border-t border-[#DAC0A3]/25">
                    <button
                      onClick={(e) => handleOpenEditModal(schedule, e)}
                      className="text-[10px] px-2 py-1 bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/60 text-[#5D4037] rounded-md font-bold transition-colors cursor-pointer"
                    >
                      編輯
                    </button>
                    <button
                      onClick={(e) => handleDelete(schedule.id, e)}
                      className="text-[10px] px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-650 rounded-md font-bold transition-colors cursor-pointer"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Daily Staffing Coverage Timeline */}
      <section className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-base font-bold text-[#3E2723] flex flex-wrap items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2E7D32] animate-pulse"></span>
              當日工時人力覆蓋率
              <div className="inline-flex items-center gap-1.5 ml-2 bg-[#F5EBE6] border border-[#DAC0A3]/65 p-0.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleAdjustSelectedDate(-1)}
                  className="p-1 hover:bg-white text-[#6D4C41] rounded-lg transition-colors cursor-pointer"
                  title="前一天"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-xs px-1.5 font-mono text-[#795548] font-extrabold select-none">
                  {selectedDateStr} ({selectedDayInfo.name})
                </span>
                <button
                  type="button"
                  onClick={() => handleAdjustSelectedDate(1)}
                  className="p-1 hover:bg-white text-[#6D4C41] rounded-lg transition-colors cursor-pointer"
                  title="後一天"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </h3>
            <p className="text-xs text-[#6D4C41] mt-1 font-medium">
              檢視各小時時段排班人數是否達標。點擊 +/- 調整，或在輸入框內直接修改目標人數需求。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {analysisHoursRange.map(hour => {
            const scheduledWorkersInHour = selectedDateShifts.filter(shift =>
              isShiftActiveAtHour(shift.startTime, shift.endTime, hour)
            );
            const currentCount = scheduledWorkersInHour.length;
            const targetCount = getStaffingTargetForHour(hour, selectedDateStr);

            let status: 'under' | 'optimal' | 'over' = 'optimal';
            if (currentCount < targetCount) {
              status = 'under';
            } else if (currentCount > targetCount) {
              status = 'over';
            }

            const statusColors = {
              under: {
                bg: 'bg-[#E65100]/5 hover:bg-[#E65100]/8',
                border: 'border-[#E65100]/20 hover:border-[#E65100]/35',
                text: 'text-[#BF360C]',
                badge: 'bg-[#E65100]/10 text-[#BF360C] border border-[#E65100]/20',
                label: '不足'
              },
              optimal: {
                bg: 'bg-[#2E7D32]/5 hover:bg-[#2E7D32]/8',
                border: 'border-[#2E7D32]/20 hover:border-[#2E7D32]/35',
                text: 'text-[#1B5E20]',
                badge: 'bg-[#2E7D32]/10 text-[#1B5E20] border border-[#2E7D32]/20',
                label: '達標'
              },
              over: {
                bg: 'bg-[#5D4037]/5 hover:bg-[#5D4037]/8',
                border: 'border-[#5D4037]/20 hover:border-[#5D4037]/35',
                text: 'text-[#3E2723]',
                badge: 'bg-[#5D4037]/10 text-[#3E2723] border border-[#5D4037]/20',
                label: '超出'
              }
            };

            const colors = statusColors[status];
            const hourStr = `${hour.toString().padStart(2, '0')}:00`;
            const hourEndStr = `${(hour + 1).toString().padStart(2, '0')}:00`;

            return (
              <div
                key={hour}
                className={`glass-card p-3 rounded-xl border flex flex-col justify-between items-center transition-all ${colors.bg} ${colors.border}`}
              >
                <span className="text-[10px] text-[#6D4C41] font-bold font-mono">
                  {hourStr} - {hourEndStr}
                </span>

                <div className="my-2.5 text-center">
                  <div className="text-2xl font-black font-mono tracking-tight text-[#3E2723] flex items-center justify-center">
                    <span>{currentCount}</span>
                    <span className="text-lg text-[#6D4C41]/35 font-normal mx-1">/</span>
                    <span className="text-2xl text-[#795548]">{targetCount}</span>
                    <span className="text-[10px] text-[#6D4C41]/60 font-bold font-sans ml-0.5">人</span>
                  </div>
                  <div className="mt-1">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${colors.badge}`}>
                      {colors.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-1 bg-[#FAF7F2] p-0.5 rounded-lg border border-[#DAC0A3]/50">
                  <button
                    type="button"
                    onClick={() => handleUpdateTarget(hour, -1)}
                    className="w-5 h-5 rounded bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-[#3E2723] transition-all flex items-center justify-center cursor-pointer text-xs font-bold font-mono"
                    title="減少目標人數"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={targetCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 0) {
                        updateStaffingTarget(hour, val, selectedDateStr);
                      }
                    }}
                    className="w-8 text-center bg-transparent border-0 text-[10px] font-black font-mono text-[#795548] py-0.5 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    title="直接輸入修改目標人數"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateTarget(hour, 1)}
                    className="w-5 h-5 rounded bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-[#3E2723] transition-all flex items-center justify-center cursor-pointer text-xs font-bold font-mono"
                    title="增加目標人數"
                  >
                    +
                  </button>
                </div>

                <div className="mt-2 w-full pt-1.5 border-t border-[#DAC0A3]/30 text-[9px] text-center truncate min-h-[18px]">
                  {scheduledWorkersInHour.length > 0 ? (
                    <span className="text-[#6D4C41] font-semibold" title={scheduledWorkersInHour.map(w => w.employeeName).join(', ')}>
                      {scheduledWorkersInHour.map(w => w.employeeName).join(', ')}
                    </span>
                  ) : (
                    <span className="text-[#6D4C41]/35 font-medium select-none">
                      (無排班)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
