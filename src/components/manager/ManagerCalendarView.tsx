import React from 'react';
import type { WorkSchedule, WorkerAvailability } from '../../services/scheduler';
import { DAYS_OF_WEEK } from '../../utils/constants';

interface ManagerCalendarViewProps {
  monthGridDates: Date[];
  todayStr: string;
  selectedDateStr: string;
  setSelectedDateStr: (val: string) => void;
  currentMonthStart: Date;
  getSchedulesForDate: (dateStr: string) => WorkSchedule[];
  getDateTotalHours: (dateStr: string) => number;
  getAvailabilitiesForDate: (dateStr: string) => WorkerAvailability[];
  getIsDayUnderstaffed: (dateStr: string) => boolean;
  getScheduleTheme: (schedule: WorkSchedule) => any;
  handleOpenAddModal: (dateStr?: string) => void;
  handleOpenEditModal: (schedule: WorkSchedule, e: React.MouseEvent) => void;
}

export const ManagerCalendarView: React.FC<ManagerCalendarViewProps> = ({
  monthGridDates,
  todayStr,
  selectedDateStr,
  setSelectedDateStr,
  currentMonthStart,
  getSchedulesForDate,
  getDateTotalHours,
  getAvailabilitiesForDate,
  getIsDayUnderstaffed,
  getScheduleTheme,
  handleOpenAddModal,
  handleOpenEditModal
}) => {
  return (
    <main className="glass-panel rounded-2xl overflow-hidden border border-[#DAC0A3]/50 shadow-sm animate-fade-in">
      {/* Weekday columns labels */}
      <div className="grid grid-cols-7 border-b border-[#DAC0A3]/50 bg-[#F5EBE6]/60">
        {DAYS_OF_WEEK.map(day => (
          <div key={day.value} className="py-2 text-center text-xs font-bold text-[#6D4C41]">
            {day.name}
          </div>
        ))}
      </div>

      {/* Monthly dates grid (42 cells) */}
      <div className="grid grid-cols-7 gap-px bg-[#EADBC8]/60">
        {monthGridDates.map((dateObj) => {
          const dateStr = dateObj.getFullYear() + '-' + (dateObj.getMonth() + 1).toString().padStart(2, '0') + '-' + dateObj.getDate().toString().padStart(2, '0');
          const isToday = dateStr === todayStr;
          const isCurrentMonth = dateObj.getMonth() === currentMonthStart.getMonth();
          const isSelected = dateStr === selectedDateStr;

          const daySchedules = getSchedulesForDate(dateStr);
          const totalDayHours = getDateTotalHours(dateStr);
          const dateAvails = getAvailabilitiesForDate(dateStr);
          const isUnderstaffed = getIsDayUnderstaffed(dateStr);

          const isFirstOfMonth = dateObj.getDate() === 1;
          const dateLabel = isFirstOfMonth ? `${dateObj.getMonth() + 1}/1` : dateObj.getDate().toString();

          return (
            <div
              key={dateStr}
              onClick={() => setSelectedDateStr(dateStr)}
              className={`min-h-[75px] md:min-h-[135px] p-1.5 flex flex-col justify-between transition-colors cursor-pointer select-none relative group ${isSelected
                ? 'bg-[#8D6E63]/10'
                : isToday
                  ? 'bg-[#FAF7F2]'
                  : isCurrentMonth
                    ? 'bg-white/90 hover:bg-[#FAF7F2]'
                    : 'bg-[#FAF7F2]/50 text-[#8D6E63]/40 opacity-50 hover:bg-[#FAF7F2]'
                }`}
            >
              {/* Date cell header */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded-full flex items-center justify-center ${isToday
                    ? 'bg-[#795548] text-white shadow-sm shadow-[#795548]/20'
                    : isSelected
                      ? 'text-[#5D4037] bg-[#8D6E63]/10'
                      : isCurrentMonth
                        ? 'text-[#3E2723] font-extrabold'
                        : 'text-[#8D6E63]/60'
                    }`}
                >
                  {dateLabel}
                </span>

                {/* Availability Count Badge */}
                {(() => {
                  const actualAvailCount = dateAvails.filter(a => !(a.startTime === '00:00' && a.endTime === '00:00')).length;
                  const offCount = dateAvails.filter(a => a.startTime === '00:00' && a.endTime === '00:00').length;
                  return (
                    <div className="flex flex-col gap-0.5 items-end">
                      {actualAvailCount > 0 && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-600/10 border border-emerald-600/20 text-[#2E7D32] font-bold flex items-center gap-0.5" title={`${actualAvailCount} 位人員今日可用`}>
                          🙋{actualAvailCount}
                        </span>
                      )}
                      {offCount > 0 && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-red-50 text-red-700 border border-red-200 font-bold flex items-center gap-0.5" title={`${offCount} 位人員今日請假`}>
                          ❌{offCount}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Total Daily Hours badge (desktop only) */}
                {totalDayHours > 0 && (
                  <span className="hidden md:inline-block text-[9px] px-1 py-0.2 rounded bg-white/80 text-[#6D4C41] border border-[#DAC0A3]/50 font-mono flex items-center gap-1">
                    {totalDayHours}h
                    {isUnderstaffed && (
                      <span className="w-1 h-1 rounded-full bg-[#E65100] animate-pulse" title="排班未達目標人數"></span>
                    )}
                  </span>
                )}

                {/* Plus Icon to quick add shift (desktop hover only) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenAddModal(dateStr);
                  }}
                  className="hidden md:group-hover:flex items-center justify-center p-0.5 rounded hover:bg-[#FAF7F2] text-[#8D6E63] hover:text-[#5D4037] border border-transparent hover:border-[#DAC0A3]/50 transition-all"
                  title="在此日新增排班"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Shifts contents */}
              <div className="flex-1 space-y-1 overflow-y-auto">
                {/* Desktop View */}
                <div className="hidden md:block space-y-1">
                  {daySchedules.slice(0, 5).map(schedule => {
                    const theme = getScheduleTheme(schedule);
                    return (
                      <div
                        key={schedule.id}
                        onClick={(e) => handleOpenEditModal(schedule, e)}
                        className={`group/item text-[10px] py-1 px-1.5 rounded truncate select-none border font-semibold flex items-center justify-between ${theme.bg} ${theme.border} ${theme.hover}`}
                        title={`👤 ${schedule.employeeName} (${schedule.startTime} - ${schedule.endTime})${schedule.workplace ? ` | 📍 ${schedule.workplace}` : ''}`}
                      >
                        <span className="truncate">
                          {schedule.employeeName}{schedule.workplace ? ` (${schedule.workplace.substring(0, 2)})` : ''} {schedule.startTime}-{schedule.endTime}
                        </span>
                      </div>
                    );
                  })}
                  {daySchedules.length > 5 && (
                    <div className="text-[9px] text-[#6D4C41] font-bold text-center pl-1">
                      還有 {daySchedules.length - 5} 個班...
                    </div>
                  )}
                </div>

                {/* Mobile View */}
                <div className="md:hidden flex flex-wrap gap-0.5 justify-center mt-1">
                  {daySchedules.map(schedule => {
                    const theme = getScheduleTheme(schedule);
                    return (
                      <span
                        key={schedule.id}
                        className={`w-1.5 h-1.5 rounded-full ${theme.dot}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
};
