import type { WorkSchedule } from '../services/scheduler';

export const safeConfirm = (message: string): boolean => {
  const isNoConfirm = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('noconfirm') === 'true';
  return isNoConfirm || window.confirm(message);
};

export const getDatesInRange = (startStr: string, endStr: string): Date[] => {
  const dates: Date[] = [];
  const start = new Date(startStr);
  const end = new Date(endStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [];
  }

  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

export const compareTimeStrings = (timeA: string, timeB: string): number => {
  if (!timeA || !timeB) return 0;
  const [hA, mA] = timeA.split(':').map(val => parseInt(val, 10) || 0);
  const [hB, mB] = timeB.split(':').map(val => parseInt(val, 10) || 0);
  if (hA !== hB) return hA - hB;
  return mA - mB;
};

export const formatDateString = (date: Date): string => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatMMDD = (date: Date): string => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

export const getMonthGridDates = (monthStart: Date): Date[] => {
  const start = new Date(monthStart);
  const day = start.getDay();
  const daysToSubtract = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysToSubtract);

  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
};

export const getDaysInMonth = (monthStart: Date): Date[] => {
  if (!monthStart || !(monthStart instanceof Date) || isNaN(monthStart.getTime())) {
    const fallback = new Date();
    monthStart = new Date(fallback.getFullYear(), fallback.getMonth(), 1);
  }
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const date = new Date(year, month, 1);
  const days: Date[] = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

export const calculateDuration = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;

  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  return (endMinutes - startMinutes) / 60;
};

export const isOverEightHours = (start: string, end: string): boolean => {
  const raw = calculateDuration(start, end);
  const effective = raw - 1; // deduct mandatory 1-hour break
  return effective > 8;
};

export const hasSevenConsecutiveDays = (dateStrings: string[]): boolean => {
  if (dateStrings.length < 7) return false;
  const sorted = [...dateStrings]
    .map(s => new Date(s).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);
  const unique = Array.from(new Set(sorted));
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const diffDays = (unique[i] - unique[i - 1]) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      streak++;
      if (streak >= 7) return true;
    } else {
      streak = 1;
    }
  }
  return false;
};

export const getColorFromName = (name: string): string => {
  if (!name || !name.trim()) return 'emerald';
  const trimmed = name.trim();
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = trimmed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['emerald', 'amber', 'teal', 'indigo', 'purple', 'rose', 'blue'];
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export const isShiftActiveAtHour = (startTime: string, endTime: string, hourIndex: number, useHalfHourOffset: boolean = true): boolean => {
  if (!startTime || !endTime) return false;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;

  const start = sh + sm / 60;
  let end = eh + em / 60;
  if (end < start) end += 24;

  const checkTime = useHalfHourOffset ? hourIndex + 1.0 : hourIndex + 0.5;

  return (checkTime >= start) && (checkTime < end);
};

export const getCleanNote = (notes?: string): string => {
  if (!notes) return '';
  let trimmed = notes.trim();

  const systemPrefixes = [
    '由登記可用時間自動排入',
    '智能自動帶入',
    '🤖 Gemini AI 智慧排班',
    '🤖 AI 智慧分析',
    '🤖 AI 排班',
    '🤖'
  ];

  for (const prefix of systemPrefixes) {
    if (trimmed.startsWith(prefix)) {
      const colonIdx = trimmed.indexOf(': ');
      if (colonIdx !== -1) {
        trimmed = trimmed.substring(colonIdx + 2).trim();
      } else {
        trimmed = '';
      }
      break;
    }
  }

  const automatedPhrases = [
    'Opening shift to meet target',
    'Closing shift',
    'Midday shift',
    '符合最佳人力效益',
    '智能自動帶入排班'
  ];

  if (automatedPhrases.some(phrase => trimmed.toLowerCase().includes(phrase.toLowerCase()))) {
    return '';
  }

  return trimmed;
};

export const getManagerNote = (sched: WorkSchedule): string => {
  const note = (sched.managerNotes !== undefined && sched.managerNotes !== '')
    ? sched.managerNotes
    : (sched.notes || '');
  const trimmed = note.trim();

  if (trimmed === 'AI生成' || trimmed === '🤖 AI生成') {
    return 'AI生成';
  }

  const automatedPhrases = [
    'Opening shift',
    'Closing shift',
    'Midday shift',
    'Shift length is',
    '符合最佳人力效益',
    '智能自動帶入',
    '由登記可用時間自動排入',
    '🤖 AI 智慧',
    'AI 智慧'
  ];

  if (automatedPhrases.some(phrase => trimmed.toLowerCase().includes(phrase.toLowerCase()))) {
    return '';
  }

  return trimmed;
};

export const getWorkerNote = (sched: WorkSchedule): string => {
  if (sched.workerNotes !== undefined && sched.workerNotes !== '') return sched.workerNotes;
  return getCleanNote(sched.notes);
};

export const getTooltipAlignment = (dayIndex: number, totalDays: number): string => {
  if (dayIndex < 5) return 'left-0';
  if (dayIndex > totalDays - 6) return 'right-0';
  return 'left-1/2 -translate-x-1/2';
};

export const getTooltipArrowAlignment = (dayIndex: number, totalDays: number): string => {
  if (dayIndex < 5) return 'left-4';
  if (dayIndex > totalDays - 6) return 'right-4';
  return 'left-1/2 -translate-x-1/2';
};
