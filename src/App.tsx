import React, { useState, useEffect } from 'react';
import { 
  subscribeToSchedules, 
  addSchedule, 
  updateSchedule, 
  deleteSchedule 
} from './services/scheduler';
import type { WorkSchedule } from './services/scheduler';
import { isValidConfig } from './firebase';
import workplaces from './config/workplaces.json';

const DAYS_OF_WEEK = [
  { value: 1, name: '週一', english: 'Monday', short: 'Mon' },
  { value: 2, name: '週二', english: 'Tuesday', short: 'Tue' },
  { value: 3, name: '週三', english: 'Wednesday', short: 'Wed' },
  { value: 4, name: '週四', english: 'Thursday', short: 'Thu' },
  { value: 5, name: '週五', english: 'Friday', short: 'Fri' },
  { value: 6, name: '週六', english: 'Saturday', short: 'Sat' },
  { value: 7, name: '週日', english: 'Sunday', short: 'Sun' }
];

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2).toString().padStart(2, '0');
  const minute = (i % 2 === 0 ? '00' : '30');
  return `${hour}:${minute}`;
});

const COLOR_THEMES: Record<string, { bg: string, border: string, text: string, dot: string, hover: string, badgeBg: string }> = {
  indigo: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    text: 'text-indigo-300',
    dot: 'bg-indigo-400',
    hover: 'hover:border-indigo-500/40',
    badgeBg: 'bg-indigo-500'
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    hover: 'hover:border-emerald-500/40',
    badgeBg: 'bg-emerald-500'
  },
  violet: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    text: 'text-violet-300',
    dot: 'bg-violet-400',
    hover: 'hover:border-violet-500/40',
    badgeBg: 'bg-violet-500'
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    hover: 'hover:border-amber-500/40',
    badgeBg: 'bg-amber-500'
  },
  rose: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    text: 'text-rose-300',
    dot: 'bg-rose-400',
    hover: 'hover:border-rose-500/40',
    badgeBg: 'bg-rose-500'
  }
};

// Date helper: Find Monday of the week for a given Date
const getMondayOfDate = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

// Date helper: Generate YYYY-MM-DD string
const formatDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Date helper: Format month and day (e.g. "5/25")
const formatMMDD = (date: Date): string => {
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

// Date helper: Generate calendar grid dates (42 days, starting on Monday of the first week of the month)
const getMonthGridDates = (monthStart: Date): Date[] => {
  const start = new Date(monthStart);
  const day = start.getDay();
  // Find how many days to go back to reach Monday (0=Sun, 1=Mon, ..., 6=Sat)
  const daysToSubtract = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysToSubtract);
  
  const dates = [];
  // Generate 42 days (6 weeks) to cover all calendar rows
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
};

// Date helper: Get 14 days starting on the Monday of the current week (aligned for 2-row selection)
const getAlign14Days = (monday: Date): Date[] => {
  const list = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    list.push(d);
  }
  return list;
};

// Date helper: Calculate duration (supporting overnight shifts)
const calculateDuration = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;
  
  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  
  if (endMinutes < startMinutes) {
    // Overnight shift
    endMinutes += 24 * 60;
  }
  
  return (endMinutes - startMinutes) / 60;
};

// Automate color mapping based on Employee Name
const getColorFromName = (name: string): string => {
  if (!name || !name.trim()) return 'indigo';
  const trimmed = name.trim();
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = trimmed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['indigo', 'emerald', 'violet', 'amber', 'rose'];
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

function App() {
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  
  // Month Calendar View states
  const [currentMonthStart, setCurrentMonthStart] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDateString(new Date()));

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [employeeName, setEmployeeName] = useState('');
  const [workplace, setWorkplace] = useState(workplaces[0]?.name || '');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');

  // Creation Mode: multiple date selects (aligned in 2 rows of 7 columns)
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  // Editing Mode: single date picker input
  const [singleDate, setSingleDate] = useState('');

  // Generate date checklist for the modal form (aligned in 2 rows of 7 columns, starting Monday of current week)
  const pickerWeekStart = getMondayOfDate(new Date());
  const pickerDates = getAlign14Days(pickerWeekStart);

  useEffect(() => {
    const unsubscribe = subscribeToSchedules((data) => {
      setSchedules(data);
    });
    return () => unsubscribe();
  }, []);

  // Open modal to add shift
  const handleOpenAddModal = (defaultDateStr?: string) => {
    setModalMode('create');
    setEditingId(null);
    setEmployeeName('');
    setWorkplace(workplaces[0]?.name || '');
    setStartTime('09:00');
    setEndTime('17:00');
    setNotes('');
    
    if (defaultDateStr) {
      setSelectedDates([defaultDateStr]);
    } else {
      setSelectedDates([formatDateString(new Date())]);
    }
    setIsModalOpen(true);
  };

  // Open modal to edit shift
  const handleOpenEditModal = (schedule: WorkSchedule, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalMode('edit');
    setEditingId(schedule.id);
    setEmployeeName(schedule.employeeName);
    setWorkplace(schedule.workplace || workplaces[0]?.name || '');
    setStartTime(schedule.startTime);
    setEndTime(schedule.endTime);
    setNotes(schedule.notes || '');
    setSingleDate(schedule.date);

    setIsModalOpen(true);
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeName.trim() || !startTime || !endTime || !workplace) {
      alert('請填寫所有必要欄位。');
      return;
    }

    if (modalMode === 'create' && selectedDates.length === 0) {
      alert('請至少選擇一個排班日期。');
      return;
    }

    try {
      const derivedColor = getColorFromName(employeeName);
      
      if (modalMode === 'create') {
        const promises = selectedDates.map(dateStr => {
          const payload = {
            title: employeeName.trim(),
            employeeName: employeeName.trim(),
            date: dateStr,
            workplace,
            startTime,
            endTime,
            notes: notes.trim(),
            color: derivedColor
          };
          return addSchedule(payload);
        });
        await Promise.all(promises);
      } else if (modalMode === 'edit' && editingId) {
        const payload = {
          title: employeeName.trim(),
          employeeName: employeeName.trim(),
          date: singleDate,
          workplace,
          startTime,
          endTime,
          notes: notes.trim(),
          color: derivedColor
        };
        await updateSchedule(editingId, payload);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving schedule: ", error);
      alert('儲存排程失敗，請稍後再試。');
    }
  };

  // Delete handler
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('確定要刪除此排程紀錄嗎？')) {
      try {
        await deleteSchedule(id);
      } catch (error) {
        console.error("Error deleting schedule: ", error);
      }
    }
  };

  // Date Navigation handlers (by Month)
  const handlePrevMonth = () => {
    const prev = new Date(currentMonthStart);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentMonthStart(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(currentMonthStart);
    next.setMonth(next.getMonth() + 1);
    setCurrentMonthStart(next);
  };

  const handleGoToToday = () => {
    const today = new Date();
    setSelectedDateStr(formatDateString(today));
    setCurrentMonthStart(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  // Date Selector Helpers inside Modal
  const toggleDateSelection = (dateStr: string) => {
    if (selectedDates.includes(dateStr)) {
      setSelectedDates(selectedDates.filter(d => d !== dateStr));
    } else {
      setSelectedDates([...selectedDates, dateStr]);
    }
  };

  const handleSelectAllDays = () => {
    setSelectedDates(pickerDates.map(formatDateString));
  };

  const handleSelectMonWedFri = () => {
    const mwf = pickerDates
      .filter(d => d.getDay() === 1 || d.getDay() === 3 || d.getDay() === 5)
      .map(formatDateString);
    setSelectedDates(mwf);
  };

  const handleSelectTueThu = () => {
    const tt = pickerDates
      .filter(d => d.getDay() === 2 || d.getDay() === 4)
      .map(formatDateString);
    setSelectedDates(tt);
  };

  const handleClearAllSelected = () => {
    setSelectedDates([]);
  };

  // Calendar calculations (filtered by the currently active visible month grid)
  const monthGridDates = getMonthGridDates(currentMonthStart);

  const getSchedulesForDate = (dateStr: string) => {
    return schedules
      .filter(item => item.date === dateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getDateTotalHours = (dateStr: string) => {
    const daySchedules = getSchedulesForDate(dateStr);
    const hours = daySchedules.reduce((sum, item) => sum + calculateDuration(item.startTime, item.endTime), 0);
    return Math.round(hours * 10) / 10;
  };

  // Visible Month Statistics
  const visibleSchedules = schedules.filter(item => {
    if (!item.date) return false;
    const [y, m] = item.date.split('-').map(Number);
    return y === currentMonthStart.getFullYear() && m === (currentMonthStart.getMonth() + 1);
  });

  const totalShifts = visibleSchedules.length;
  const totalHours = visibleSchedules.reduce((sum, item) => sum + calculateDuration(item.startTime, item.endTime), 0);
  const totalEmployees = new Set(visibleSchedules.map(item => item.employeeName.trim().toLowerCase()).filter(Boolean)).size;

  const todayStr = formatDateString(new Date());

  // Get selected day details (used in mobile view detail block)
  const selectedDateObject = new Date(selectedDateStr);
  const selectedDateShifts = getSchedulesForDate(selectedDateStr);
  const selectedDateTotalHours = getDateTotalHours(selectedDateStr);
  const selectedDayOfWeekIndex = selectedDateObject.getDay();
  const selectedDayOfWeekMapped = selectedDayOfWeekIndex === 0 ? 7 : selectedDayOfWeekIndex;
  const selectedDayInfo = DAYS_OF_WEEK.find(d => d.value === selectedDayOfWeekMapped) || DAYS_OF_WEEK[0];

  return (
    <div className="min-h-screen text-slate-100 font-sans pb-12">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        
        {/* Header Banner */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 p-6 md:p-8 rounded-2xl border border-slate-800/80 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
          
          <div className="space-y-2 z-10">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                工作排程日曆
              </h1>
              {isValidConfig ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  雲端同步
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                  本機儲存 (LocalStorage)
                </span>
              )}
            </div>
            <p className="text-slate-400 text-xs md:text-sm">
              按月檢視班表，支援雙週多選排程，工時統計與智慧人員色彩標示。
            </p>
          </div>

          <button
            onClick={() => handleOpenAddModal(selectedDateStr)}
            className="z-10 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 cursor-pointer text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            多選日期排班
          </button>
        </header>

        {/* Calendar Toolbar */}
        <section className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          {/* Left: Month Nav */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleGoToToday}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 hover:border-slate-600 text-xs font-semibold transition-all cursor-pointer"
            >
              今天
            </button>
            <div className="flex items-center rounded-lg border border-slate-700/60 bg-slate-800 overflow-hidden">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-slate-700 text-slate-300 border-r border-slate-700/60 transition-colors cursor-pointer"
                title="前一個月"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                title="後一個月"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* Displaying current Month/Year */}
            <h2 className="text-base md:text-lg font-bold text-slate-100 ml-2">
              {currentMonthStart.getFullYear()}年 {currentMonthStart.getMonth() + 1}月
            </h2>
          </div>

          {/* Right: Quick monthly stats info */}
          <div className="flex items-center gap-4 text-[11px] md:text-xs text-slate-400 bg-slate-950/40 px-3 md:px-4 py-2 rounded-lg border border-slate-850">
            <div>本月班次：<span className="font-semibold text-slate-200 font-mono">{totalShifts}</span> 次</div>
            <div className="w-px h-3 bg-slate-800"></div>
            <div>本月工時：<span className="font-semibold text-indigo-400 font-mono">{Math.round(totalHours * 10) / 10}</span> 小時</div>
            <div className="w-px h-3 bg-slate-800"></div>
            <div>排班人數：<span className="font-semibold text-pink-400 font-mono">{totalEmployees}</span> 人</div>
          </div>
        </section>

        {/* Month View Calendar Layout */}
        <main className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
          
          {/* Weekday columns labels */}
          <div className="grid grid-cols-7 border-b border-slate-850 bg-slate-900/60">
            {DAYS_OF_WEEK.map(day => (
              <div key={day.value} className="py-2 text-center text-xs font-bold text-slate-400">
                {day.name}
              </div>
            ))}
          </div>

          {/* Monthly dates grid (42 cells) */}
          <div className="grid grid-cols-7 gap-px bg-slate-850">
            {monthGridDates.map((dateObj) => {
              const dateStr = formatDateString(dateObj);
              const isToday = dateStr === todayStr;
              const isCurrentMonth = dateObj.getMonth() === currentMonthStart.getMonth();
              const isSelected = dateStr === selectedDateStr;
              
              const daySchedules = getSchedulesForDate(dateStr);
              const totalDayHours = getDateTotalHours(dateStr);
              
              const isFirstOfMonth = dateObj.getDate() === 1;
              const dateLabel = isFirstOfMonth ? `${dateObj.getMonth() + 1}/1` : dateObj.getDate().toString();

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDateStr(dateStr)}
                  className={`min-h-[75px] md:min-h-[110px] p-1.5 flex flex-col justify-between transition-colors cursor-pointer select-none relative group ${
                    isSelected 
                      ? 'bg-indigo-500/5' 
                      : isToday 
                        ? 'bg-slate-900/40' 
                        : isCurrentMonth 
                          ? 'bg-slate-900/10 hover:bg-slate-900/30' 
                          : 'bg-slate-950/20 text-slate-600 opacity-40 hover:bg-slate-900/20'
                  }`}
                >
                  {/* Date cell header */}
                  <div className="flex items-center justify-between mb-1">
                    <span 
                      className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded-full flex items-center justify-center ${
                        isToday 
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/35' 
                          : isSelected 
                            ? 'text-indigo-400 bg-indigo-500/10'
                            : isCurrentMonth
                              ? 'text-slate-300'
                              : 'text-slate-600'
                      }`}
                    >
                      {dateLabel}
                    </span>

                    {/* Total Daily Hours badge (desktop only) */}
                    {totalDayHours > 0 && (
                      <span className="hidden md:inline-block text-[9px] px-1 py-0.2 rounded bg-slate-950/40 text-slate-400 border border-slate-850/50 font-mono">
                        {totalDayHours}h
                      </span>
                    )}

                    {/* Plus Icon to quick add shift (desktop hover only) */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAddModal(dateStr);
                      }}
                      className="hidden md:group-hover:flex items-center justify-center p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-300 border border-transparent hover:border-slate-700 transition-all"
                      title="在此日新增排班"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>

                  {/* Shifts contents */}
                  <div className="flex-1 space-y-1 overflow-y-auto">
                    {/* Desktop View: lists the shift pills */}
                    <div className="hidden md:block space-y-1">
                      {daySchedules.slice(0, 3).map(schedule => {
                        const theme = COLOR_THEMES[schedule.color] || COLOR_THEMES.indigo;
                        return (
                          <div
                            key={schedule.id}
                            onClick={(e) => handleOpenEditModal(schedule, e)}
                            className={`group/item text-[10px] py-1 px-1.5 rounded truncate select-none border font-semibold flex items-center justify-between ${theme.bg} ${theme.border} ${theme.hover}`}
                            title={`👤 ${schedule.employeeName} (${schedule.startTime} - ${schedule.endTime})${schedule.workplace ? ` | 📍 ${schedule.workplace}` : ''}`}
                          >
                            <span className="truncate">
                              {schedule.employeeName}{schedule.workplace ? ` (${schedule.workplace.substring(0, 2)})` : ''} {schedule.startTime}
                            </span>
                          </div>
                        );
                      })}
                      {daySchedules.length > 3 && (
                        <div className="text-[9px] text-slate-500 font-bold text-center pl-1">
                          還有 {daySchedules.length - 3} 個班...
                        </div>
                      )}
                    </div>

                    {/* Mobile View: displays small colored indicator dots */}
                    <div className="md:hidden flex flex-wrap gap-0.5 justify-center mt-1">
                      {daySchedules.map(schedule => {
                        const theme = COLOR_THEMES[schedule.color] || COLOR_THEMES.indigo;
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

        {/* Selected Date Detail Block (Crucial for mobile experience, elegant for desktop too) */}
        <section className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-850 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                已選日期：{selectedDateObject.getFullYear()}年 {formatMMDD(selectedDateObject)} ({selectedDayInfo.name})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                此日共排定 {selectedDateShifts.length} 個班次，合計 {selectedDateTotalHours} 小時。
              </p>
            </div>
            
            <button
              onClick={() => handleOpenAddModal(selectedDateStr)}
              className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/25 border border-indigo-500/35 hover:border-indigo-500 text-indigo-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
            >
              ＋ 在此日新增排班
            </button>
          </div>

          {selectedDateShifts.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-slate-850/40 rounded-xl">
              <p className="text-xs text-slate-500 font-medium">此日尚無排班班次紀錄</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {selectedDateShifts.map(schedule => {
                const theme = COLOR_THEMES[schedule.color] || COLOR_THEMES.indigo;
                const duration = calculateDuration(schedule.startTime, schedule.endTime);
                
                return (
                  <div
                    key={schedule.id}
                    onClick={(e) => handleOpenEditModal(schedule, e)}
                    className={`group glass-card p-3 rounded-xl border relative cursor-pointer flex flex-col justify-between gap-3 ${theme.bg} ${theme.border} ${theme.hover}`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${theme.text} font-mono`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`}></span>
                          {schedule.startTime} - {schedule.endTime}
                        </span>
                        <div className="flex items-center gap-1">
                          {schedule.workplace && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950/60 text-slate-300 border border-slate-850/50 font-semibold flex items-center gap-0.5">
                              📍{schedule.workplace}
                            </span>
                          )}
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950/60 text-slate-400 border border-slate-850/50 font-mono font-bold">
                            {duration}h
                          </span>
                        </div>
                      </div>
                      
                      <h4 className="font-extrabold text-slate-200 text-sm flex items-center gap-1.5 leading-tight group-hover:text-white transition-colors">
                        👤 {schedule.employeeName}
                      </h4>
                    </div>

                    {schedule.notes && (
                      <div className="text-[10px] text-slate-400 bg-slate-900/10 px-2 py-1 rounded border border-dashed border-slate-850 text-left truncate">
                        📝 {schedule.notes}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-1.5 border-t border-slate-800/40 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleOpenEditModal(schedule, e)}
                        className="p-1 rounded bg-slate-850 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="編輯"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => handleDelete(schedule.id, e)}
                        className="p-1 rounded bg-slate-850 hover:bg-red-950/50 text-slate-300 hover:text-red-400 transition-colors"
                        title="刪除"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-panel rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-800/80 animate-scale-in flex flex-col">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-850 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                {modalMode === 'create' ? '新增排班時段 (可複選日期)' : '編輯排班時段'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
              
              {/* Employee Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">排班人員姓名</label>
                <input 
                  type="text"
                  required
                  placeholder="填寫排班同仁姓名"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                />
              </div>

              {/* Workplace Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">工作地點</label>
                <select
                  value={workplace}
                  onChange={(e) => setWorkplace(e.target.value)}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                >
                  {workplaces.map(loc => (
                    <option key={loc.id} value={loc.name} className="bg-slate-950 text-slate-100">
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Selection */}
              {modalMode === 'create' ? (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">選擇排班日期 (可選取多天，自動入帳)</label>
                    <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded font-mono">
                      已選 {selectedDates.length} 天
                    </span>
                  </div>
                  
                  {/* Quick select shortcuts */}
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    <button
                      type="button"
                      onClick={handleSelectMonWedFri}
                      className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white cursor-pointer font-bold"
                    >
                      一/三/五
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectTueThu}
                      className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white cursor-pointer font-bold"
                    >
                      二/四
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllDays}
                      className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white cursor-pointer font-bold"
                    >
                      全選 (雙週)
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllSelected}
                      className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:border-slate-750 cursor-pointer font-bold"
                    >
                      清除
                    </button>
                  </div>

                  {/* 2-Week Grid (2 rows of 7 columns matching Mon-Sun) */}
                  <div className="p-2 border border-slate-850 rounded-xl bg-slate-950/30">
                    {/* Weekday names */}
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500 font-bold mb-1">
                      <div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div>
                    </div>
                    {/* Date buttons grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {pickerDates.map(dateObj => {
                        const dateStr = formatDateString(dateObj);
                        const isSelected = selectedDates.includes(dateStr);
                        const isToday = dateStr === todayStr;

                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => toggleDateSelection(dateStr)}
                            className={`relative py-1.5 px-0.5 rounded-lg border text-center transition-all cursor-pointer text-[10px] font-mono font-bold flex flex-col items-center justify-center ${
                              isSelected
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm'
                                : 'bg-slate-900/40 border-slate-850 text-slate-400 hover:border-slate-750 hover:bg-slate-900/60'
                            } ${isToday ? 'ring-1 ring-indigo-500/30' : ''}`}
                            title={formatDateString(dateObj)}
                          >
                            <span>{formatMMDD(dateObj)}</span>
                            {isToday && (
                              <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-indigo-400"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                // Edit mode: single date selection (HTML5 date input for ultimate flexibility)
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">排班日期</label>
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
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">開始時間</label>
                  <select
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                  >
                    {TIME_SLOTS.map(slot => (
                      <option key={slot} value={slot} className="bg-slate-950 text-slate-100 font-mono">
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">結束時間</label>
                  <select
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                  >
                    {TIME_SLOTS.map(slot => (
                      <option key={slot} value={slot} className="bg-slate-950 text-slate-100 font-mono">
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Auto calculated hours warning/info */}
              {startTime && endTime && (
                <div className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-850 flex items-center justify-between">
                  <span className="text-xs text-slate-400">預估單次工時：</span>
                  <span className="text-sm font-bold text-indigo-400 font-mono">
                    {calculateDuration(startTime, endTime)} 小時 
                    {calculateDuration(startTime, endTime) > 12 && <span className="text-[10px] font-normal text-amber-400 ml-1">(長時間班次)</span>}
                  </span>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">備註項目 (選填)</label>
                <textarea 
                  placeholder="班次注意事項、特別交辦事項..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm min-h-[70px] resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 border-t border-slate-850 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 font-semibold px-4 py-3 rounded-xl transition-all cursor-pointer text-center text-sm"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/10 cursor-pointer text-center text-sm"
                >
                  儲存
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
