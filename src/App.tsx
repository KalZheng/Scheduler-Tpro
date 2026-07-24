import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  subscribeToSchedules,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  subscribeToAvailabilities,
  addAvailability,
  deleteAvailability,
  subscribeToStaffingTargets,
  updateStaffingTarget,
  syncActiveMonth,
  subscribeToEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  updateDayNote,
  subscribeToDeadlineDay,
  updateDeadlineDay,
  subscribeToStartDay,
  updateStartDay,
  subscribeToOperatingStartTime,
  updateOperatingStartTime,
  subscribeToOperatingEndTime,
  updateOperatingEndTime,
  subscribeToShiftMorningStart,
  updateShiftMorningStart,
  subscribeToShiftMorningEnd,
  updateShiftMorningEnd,
  subscribeToShiftEveningStart,
  updateShiftEveningStart,
  subscribeToShiftEveningEnd,
  updateShiftEveningEnd,
  subscribeToShiftPresets,
  updateShiftPresets,
  subscribeToEmployeeOrder,
  updateEmployeeOrder,
  updateAvailability,
  subscribeToMonthlyRevenues,
  updateMonthlyRevenues
} from './services/scheduler';
import type { WorkSchedule, WorkerAvailability, StaffingTarget, Employee, ShiftPreset } from './services/scheduler';
import { isValidConfig } from './firebase';
declare const google: any;
import workplaces from './config/workplaces.json';
import * as XLSX from 'xlsx-js-style';

export interface WorkerAvailConfig {
  date: string;
  startIdx: number;
  endIdx: number;
  workplace: string;
  notes: string;
}


const safeConfirm = (message: string): boolean => {
  const isNoConfirm = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('noconfirm') === 'true';
  return isNoConfirm || window.confirm(message);
};

const ALL_POSITIONS: ('餐吧' | 'POS機' | '後吧' | '收班' | '開早')[] = ['餐吧', 'POS機', '後吧', '收班', '開早'];

const DAYS_OF_WEEK = [
  { value: 1, name: '週一', english: 'Monday', short: 'Mon' },
  { value: 2, name: '週二', english: 'Tuesday', short: 'Tue' },
  { value: 3, name: '週三', english: 'Wednesday', short: 'Wed' },
  { value: 4, name: '週四', english: 'Thursday', short: 'Thu' },
  { value: 5, name: '週五', english: 'Friday', short: 'Fri' },
  { value: 6, name: '週六', english: 'Saturday', short: 'Sat' },
  { value: 7, name: '週日', english: 'Sunday', short: 'Sun' }
];

// Helper: Calculate date list in a start-end range
const getDatesInRange = (startStr: string, endStr: string): Date[] => {
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
const ALL_TIME_CHOICES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

const compareTimeStrings = (timeA: string, timeB: string): number => {
  if (!timeA || !timeB) return 0;
  const [hA, mA] = timeA.split(':').map(val => parseInt(val, 10) || 0);
  const [hB, mB] = timeB.split(':').map(val => parseInt(val, 10) || 0);
  if (hA !== hB) return hA - hB;
  return mA - mB;
};

const COLOR_THEMES: Record<string, { bg: string, border: string, text: string, dot: string, hover: string, badgeBg: string }> = {
  indigo: {
    // Espresso / Deep Roasted Coffee
    bg: 'bg-[#5D4037]/8',
    border: 'border-[#4E342E]/25',
    text: 'text-[#3E2723]',
    dot: 'bg-[#4E342E]',
    hover: 'hover:border-[#4E342E]/50 hover:bg-[#5D4037]/12',
    badgeBg: 'bg-[#4E342E]'
  },
  emerald: {
    // Matcha / Green Tea Accent
    bg: 'bg-[#2E7D32]/8',
    border: 'border-[#2E7D32]/25',
    text: 'text-[#1B5E20]',
    dot: 'bg-[#2E7D32]',
    hover: 'hover:border-[#2E7D32]/50 hover:bg-[#2E7D32]/12',
    badgeBg: 'bg-[#2E7D32]'
  },
  violet: {
    // Cappuccino / Cinnamon Warm Cocoa
    bg: 'bg-[#8D6E63]/10',
    border: 'border-[#8D6E63]/30',
    text: 'text-[#5D4037]',
    dot: 'bg-[#8D6E63]',
    hover: 'hover:border-[#8D6E63]/60 hover:bg-[#8D6E63]/15',
    badgeBg: 'bg-[#8D6E63]'
  },
  amber: {
    // Caramel / Sweet Orange Tan
    bg: 'bg-[#E65100]/8',
    border: 'border-[#E65100]/25',
    text: 'text-[#BF360C]',
    dot: 'bg-[#E65100]',
    hover: 'hover:border-[#E65100]/50 hover:bg-[#E65100]/12',
    badgeBg: 'bg-[#E65100]'
  },
  rose: {
    // Latte / Milky Tan Beige
    bg: 'bg-[#D7CCC8]/35',
    border: 'border-[#BCAAA4]/40',
    text: 'text-[#6D4C41]',
    dot: 'bg-[#A1887F]',
    hover: 'hover:border-[#BCAAA4]/70 hover:bg-[#D7CCC8]/50',
    badgeBg: 'bg-[#8D6E63]'
  },
  lightBlue: {
    bg: '!bg-[#E0F2FE]',
    border: '!border-[#bae6fd]',
    text: 'text-[#0369a1]',
    dot: 'bg-[#0284c7]',
    hover: 'hover:border-[#38bdf8] hover:bg-[#e0f2fe]/90',
    badgeBg: 'bg-[#0284c7]'
  }
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



// Date helper: Get all dates in the currently selected month
const getDaysInMonth = (monthStart: Date): Date[] => {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const date = new Date(year, month, 1);
  const days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};


// Date helper: Calculate duration (supporting overnight shifts)
const calculateDuration = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;

  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  if (endMinutes < startMinutes) {
    // Overnight shift
    endMinutes += 24 * 60;
  }

  return (endMinutes - startMinutes) / 60;
};

// Check 1: Effective work hours check (1 hour break deducted)
// Returns true if effective work hours (raw - 1h break) exceed 8 hours
const isOverEightHours = (start: string, end: string): boolean => {
  const raw = calculateDuration(start, end);
  const effective = raw - 1; // deduct mandatory 1-hour break
  return effective > 8;
};

// Check 2: Consecutive days check
// Given a set of date strings (YYYY-MM-DD), returns true if any run of consecutive days >= 7
const hasSevenConsecutiveDays = (dateStrings: string[]): boolean => {
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

// Helper: check if scheduled shift is active during a specific hour Index (0-23)
const isShiftActiveAtHour = (startTime: string, endTime: string, hourIndex: number): boolean => {
  if (!startTime || !endTime) return false;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;

  const start = sh + sm / 60;
  const end = eh + em / 60;
  const checkTime = hourIndex + 0.5; // midpoint of the hour

  if (end < start) {
    // Overnight shift
    return (checkTime >= start) || (checkTime < end);
  }
  return (checkTime >= start) && (checkTime < end);
};

const getCleanNote = (notes?: string): string => {
  if (!notes) return '';
  const prefix = '由登記可用時間自動排入: ';
  if (notes.startsWith(prefix)) {
    return notes.substring(prefix.length).trim();
  }
  if (notes === '由登記可用時間自動排入') {
    return '';
  }
  return notes.trim();
};

const getManagerNote = (sched: WorkSchedule): string => {
  if (sched.managerNotes !== undefined) return sched.managerNotes;
  const n = sched.notes || '';
  if (n.startsWith('由登記可用時間自動排入')) {
    return '';
  }
  return n;
};

const getWorkerNote = (sched: WorkSchedule): string => {
  if (sched.workerNotes !== undefined) return sched.workerNotes;
  const n = sched.notes || '';
  if (n.startsWith('由登記可用時間自動排入: ')) {
    return n.substring('由登記可用時間自動排入: '.length);
  }
  if (n === '由登記可用時間自動排入') {
    return '';
  }
  return '';
};

function App() {
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [availabilities, setAvailabilities] = useState<WorkerAvailability[]>([]);
  const [staffingTargets, setStaffingTargets] = useState<StaffingTarget[]>([]);

  // Role selection state: worker or manager
  const [activeRole, setActiveRole] = useState<'worker' | 'manager'>('worker');

  // Manager authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => sessionStorage.getItem('manager_auth') === 'true');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Hash-based routing to separate Worker and Manager views
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#/manager') {
        setActiveRole('manager');
      } else {
        setActiveRole('worker');
      }
    };

    // Run once on load
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Handle Login authentication
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const MANAGER_PASSCODE = 'coffee888';
    if (passcodeInput === MANAGER_PASSCODE) {
      setIsAuthenticated(true);
      sessionStorage.setItem('manager_auth', 'true');
      setLoginError('');
      setPasscodeInput('');
    } else {
      setLoginError('密碼不正確，請重新輸入 ☕');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('manager_auth');
    setPasscodeInput('');
    window.location.hash = '#/worker';
  };

  // Manager view sub-mode: calendar or grid or employees or calculation or system
  const [managerViewMode, setManagerViewMode] = useState<'calendar' | 'grid' | 'employees' | 'calculation' | 'system'>('calendar');
  const [deadlineDay, setDeadlineDay] = useState<number>(20);
  const [startDay, setStartDay] = useState<number>(15);
  const [operatingStartTime, setOperatingStartTime] = useState<string>('06:30');
  const [operatingEndTime, setOperatingEndTime] = useState<string>('20:00');
  const [shiftMorningStart, setShiftMorningStart] = useState<string>('06:30');
  const [shiftMorningEnd, setShiftMorningEnd] = useState<string>('15:30');
  const [shiftEveningStart, setShiftEveningStart] = useState<string>('08:30');
  const [shiftEveningEnd, setShiftEveningEnd] = useState<string>('17:30');
  const [shiftPresets, setShiftPresets] = useState<ShiftPreset[]>([]);
  const [employeeOrder, setEmployeeOrder] = useState<string[]>([]);



  const timeSlots = useMemo(() => {
    if (!operatingStartTime || !operatingEndTime) return [];
    const [startH, startM] = operatingStartTime.split(':').map(Number);
    const [endH, endM] = operatingEndTime.split(':').map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return [];

    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    if (endMinutes < startMinutes) {
      // Overnight shift
      endMinutes += 24 * 60;
    }

    const slots: string[] = [];
    for (let min = startMinutes; min <= endMinutes; min += 30) {
      const adjustedMin = min % (24 * 60);
      const h = Math.floor(adjustedMin / 60).toString().padStart(2, '0');
      const m = (adjustedMin % 60).toString().padStart(2, '0');
      slots.push(`${h}:${m}`);
    }
    return slots;
  }, [operatingStartTime, operatingEndTime]);

  // Reference to the grid scroll container to enable horizontal scrolling via mouse wheel
  const gridContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [managerViewMode, activeRole, isAuthenticated]);

  // Revenue-based staffing calculation states (persisted to database)
  const [monthlyRevenues, setMonthlyRevenues] = useState<Record<number, number>>({});

  // Employee list states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [employeeFormMode, setEmployeeFormMode] = useState<'create' | 'edit'>('create');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);

  // Employee Form fields
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empStatus, setEmpStatus] = useState<'正式夥伴' | '兼職夥伴'>('兼職夥伴');
  const [empActive, setEmpActive] = useState<boolean>(true);
  const [empTrainingPos, setEmpTrainingPos] = useState<'餐吧' | 'POS機' | '後吧' | '收班' | '開早' | null>(null);
  const [empTrainedPoss, setEmpTrainedPoss] = useState<('餐吧' | 'POS機' | '後吧' | '收班' | '開早')[]>([]);
  const [empCertificates, setEmpCertificates] = useState<('FBI' | '黃金吧檯手')[]>([]);
  const [empIsNewcomer, setEmpIsNewcomer] = useState<boolean>(false);
  const [isUploadingExcel, setIsUploadingExcel] = useState<boolean>(false);
  const [uploadExcelStatus, setUploadExcelStatus] = useState<'idle' | 'success' | 'error' | 'noconfig'>('idle');
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  // Search/Filter for employee list
  const [empSearch, setEmpSearch] = useState('');
  const [empStatusFilter, setEmpStatusFilter] = useState<'all' | '正式夥伴' | '兼職夥伴'>('all');
  const [empActiveFilter, setEmpActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');

  // Worker identity (cached in localStorage)
  const [workerName, setWorkerName] = useState(() => localStorage.getItem('scheduler_worker_name') || '');
  const [isWorkerVerified, setIsWorkerVerified] = useState(() => localStorage.getItem('scheduler_worker_verified') === 'true' && !!localStorage.getItem('scheduler_worker_name'));

  const loggedInEmployee = employees.find(
    emp => emp.name.trim().toLowerCase() === workerName.trim().toLowerCase() && emp.active !== false
  );
  const isFullTime = loggedInEmployee?.status === '正式夥伴';

  const [selectedWorkerName, setSelectedWorkerName] = useState('');
  const [workerPhoneInput, setWorkerPhoneInput] = useState('');
  const [workerVerifyError, setWorkerVerifyError] = useState('');

  // Worker availability submission form states
  const [availNotes, setAvailNotes] = useState('');
  const [availSelectedDates, setAvailSelectedDates] = useState<string[]>([]);


  // Modal and config state for per-day availability settings
  const [isWorkerAvailModalOpen, setIsWorkerAvailModalOpen] = useState(false);
  const [availConfigs, setAvailConfigs] = useState<WorkerAvailConfig[]>([]);


  // Worker confirmed shifts calendar month state
  const [workerCalendarMonth, setWorkerCalendarMonth] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  });

  // Month Calendar View states
  const [currentMonthStart, setCurrentMonthStart] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  });
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return formatDateString(nextMonth);
  });
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFTAssignModalOpen, setIsFTAssignModalOpen] = useState(false);
  const [pendingAssignAvail, setPendingAssignAvail] = useState<WorkerAvailability | null>(null);

  // Form states
  const [employeeName, setEmployeeName] = useState('');
  const [workplace, setWorkplace] = useState(workplaces[0]?.name || '');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [workerNotes, setWorkerNotes] = useState('');
  const [formOriginalStartTime, setFormOriginalStartTime] = useState<string | null>(null);
  const [formOriginalEndTime, setFormOriginalEndTime] = useState<string | null>(null);

  // Creation Mode: multiple date selects (aligned in 2 rows of 7 columns)
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  // Editing Mode: single date picker input
  const [singleDate, setSingleDate] = useState('');

  // Generate date checklist for the modal form aligned with the current viewing month
  const pickerDates = getMonthGridDates(currentMonthStart);

  // Date calculations for worker's availability selection (Next Month)
  const workerNextMonthStart = (() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  })();
  const workerCalendarGridDates = getMonthGridDates(workerNextMonthStart);
  const workerDaysInMonth = getDaysInMonth(workerNextMonthStart);

  const isWorkerEditable = (() => {
    if (!workerName.trim()) return true;
    const targetMonthStr = formatDateString(workerNextMonthStart).substring(0, 7);
    const hasConfirmed = schedules.some(
      s => s.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase() &&
        s.date.startsWith(targetMonthStr)
    );
    const todayNum = new Date().getDate();
    if (todayNum < startDay) return false;
    return (todayNum <= deadlineDay) || !hasConfirmed;
  })();

  const handleStatusChange = (status: '正式夥伴' | '兼職夥伴') => {
    setEmpStatus(status);
  };

  const handleTagClick = (pos: '餐吧' | 'POS機' | '後吧' | '收班' | '開早') => {
    if (empTrainingPos === pos) {
      // Training -> Trained
      setEmpTrainingPos(null);
      setEmpTrainedPoss(prev => {
        const next = prev.includes(pos) ? prev : [...prev, pos];
        return next;
      });
    } else if (empTrainedPoss.includes(pos)) {
      // Trained -> Available
      setEmpTrainedPoss(prev => prev.filter(p => p !== pos));
    } else {
      // Available -> Training if empty, else -> Trained
      if (!empTrainingPos) {
        setEmpTrainingPos(pos);
      } else {
        setEmpTrainedPoss(prev => {
          const next = prev.includes(pos) ? prev : [...prev, pos];
          setEmpTrainingPos(null);
          return next;
        });
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, pos: '餐吧' | 'POS機' | '後吧' | '收班' | '開早') => {
    e.dataTransfer.setData('text/plain', pos);
  };

  const handleDropToAvailable = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = e.dataTransfer.getData('text/plain') as '餐吧' | 'POS機' | '後吧' | '收班' | '開早';
    if (!pos) return;
    if (empTrainingPos === pos) setEmpTrainingPos(null);
    setEmpTrainedPoss(prev => prev.filter(p => p !== pos));
  };

  const handleDropToTraining = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = e.dataTransfer.getData('text/plain') as '餐吧' | 'POS機' | '後吧' | '收班' | '開早';
    if (!pos) return;
    setEmpTrainingPos(pos);
    setEmpTrainedPoss(prev => prev.filter(p => p !== pos));
  };

  const handleDropToTrained = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = e.dataTransfer.getData('text/plain') as '餐吧' | 'POS機' | '後吧' | '收班' | '開早';
    if (!pos) return;
    if (empTrainingPos === pos) setEmpTrainingPos(null);
    setEmpTrainedPoss(prev => {
      const next = prev.includes(pos) ? prev : [...prev, pos];
      return next;
    });
  };

  const handleOpenEmployeeModal = (emp?: Employee) => {
    if (emp) {
      setEmployeeFormMode('edit');
      setEditingEmployeeId(emp.id);
      setEmpName(emp.name);
      setEmpPhone(emp.phone || '');
      setEmpStatus(emp.status);
      setEmpActive(emp.active !== false);
      setEmpIsNewcomer(emp.isNewcomer || false);
      setEmpTrainingPos(emp.trainingPosition || null);
      setEmpTrainedPoss(emp.trainedPositions || []);
      setEmpCertificates(emp.certificates || []);
    } else {
      setEmployeeFormMode('create');
      setEditingEmployeeId(null);
      setEmpName('');
      setEmpPhone('');
      setEmpStatus('兼職夥伴');
      setEmpActive(true);
      setEmpIsNewcomer(false);
      setEmpTrainingPos(null);
      setEmpTrainedPoss([]);
      setEmpCertificates([]);
    }
    setIsEmployeeModalOpen(true);
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) {
      alert('請輸入員工姓名');
      return;
    }
    if (!empPhone.trim()) {
      alert('請輸入聯絡電話');
      return;
    }
    const payload = {
      name: empName.trim(),
      phone: empPhone.trim(),
      status: empStatus,
      active: empActive,
      isNewcomer: empIsNewcomer,
      trainingPosition: empTrainingPos,
      trainedPositions: empTrainedPoss,
      certificates: empCertificates
    };

    try {
      if (employeeFormMode === 'create') {
        await addEmployee(payload);
      } else if (employeeFormMode === 'edit' && editingEmployeeId) {
        await updateEmployee(editingEmployeeId, payload);
      }
      setIsEmployeeModalOpen(false);
    } catch (error) {
      console.error("Failed to save employee:", error);
      alert("儲存員工失敗，請稍後再試。");
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (safeConfirm("確定要刪除此員工嗎？這不會刪除已有的排班紀錄。")) {
      try {
        await deleteEmployee(id);
      } catch (error) {
        console.error("Failed to delete employee:", error);
      }
    }
  };

  useEffect(() => {
    const unsubSchedules = subscribeToSchedules((data) => {
      setSchedules(data);
    });
    const unsubAvailabilities = subscribeToAvailabilities((data) => {
      setAvailabilities(data);
    });
    const unsubStaffingTargets = subscribeToStaffingTargets((data) => {
      setStaffingTargets(data);
    });
    const unsubEmployees = subscribeToEmployees((data) => {
      setEmployees(data);
    });
    const unsubDeadlineDay = subscribeToDeadlineDay((day) => {
      setDeadlineDay(day);
    });
    const unsubStartDay = subscribeToStartDay((day) => {
      setStartDay(day);
    });
    const unsubOperatingStartTime = subscribeToOperatingStartTime((time) => {
      setOperatingStartTime(time);
    });
    const unsubOperatingEndTime = subscribeToOperatingEndTime((time) => {
      setOperatingEndTime(time);
    });
    const unsubShiftMorningStart = subscribeToShiftMorningStart((time) => {
      setShiftMorningStart(time);
    });
    const unsubShiftMorningEnd = subscribeToShiftMorningEnd((time) => {
      setShiftMorningEnd(time);
    });
    const unsubShiftEveningStart = subscribeToShiftEveningStart((time) => {
      setShiftEveningStart(time);
    });
    const unsubShiftEveningEnd = subscribeToShiftEveningEnd((time) => {
      setShiftEveningEnd(time);
    });
    const unsubShiftPresets = subscribeToShiftPresets((data) => {
      setShiftPresets(data);
    });
    const unsubEmployeeOrder = subscribeToEmployeeOrder((data) => {
      setEmployeeOrder(data);
    });
    const unsubMonthlyRevenues = subscribeToMonthlyRevenues((data) => {
      setMonthlyRevenues(data);
    });

    return () => {
      unsubSchedules();
      unsubAvailabilities();
      unsubStaffingTargets();
      unsubEmployees();
      unsubDeadlineDay();
      unsubStartDay();
      unsubOperatingStartTime();
      unsubOperatingEndTime();
      unsubShiftMorningStart();
      unsubShiftMorningEnd();
      unsubShiftEveningStart();
      unsubShiftEveningEnd();
      unsubShiftPresets();
      unsubEmployeeOrder();
      unsubMonthlyRevenues();
    };
  }, []);

  useEffect(() => {
    if (currentMonthStart) {
      const year = currentMonthStart.getFullYear();
      const month = currentMonthStart.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      setExportStartDate(formatDateString(firstDay));
      setExportEndDate(formatDateString(lastDay));

      const monthStr = (month + 1).toString().padStart(2, '0');
      syncActiveMonth(`${year}-${monthStr}`);
    }
  }, [currentMonthStart]);

  // Compute full-time worker's database registered rest days
  const dbRestDates = useMemo(() => {
    if (!isFullTime || !workerName.trim()) return [];
    const targetMonthStr = formatDateString(workerNextMonthStart).substring(0, 7);
    const workerAvails = availabilities.filter(
      a => a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase()
    );
    const hasRecords = workerAvails.some(a => a.date.startsWith(targetMonthStr));
    if (!hasRecords) return [];

    const workDates = workerAvails
      .filter(a => a.date.startsWith(targetMonthStr) && !(a.startTime === '00:00' && a.endTime === '00:00'))
      .map(a => a.date);

    const daysInMonth = getDaysInMonth(workerNextMonthStart);
    const computedRestDates = daysInMonth
      .map(formatDateString)
      .filter(dateStr => !workDates.includes(dateStr));

    const legacyRestDates = workerAvails
      .filter(a => a.date.startsWith(targetMonthStr) && a.startTime === '00:00' && a.endTime === '00:00')
      .map(a => a.date);

    return Array.from(new Set([...computedRestDates, ...legacyRestDates])).sort();
  }, [availabilities, workerName, isFullTime, workerNextMonthStart]);

  // Keep track of the last synced DB rest dates to detect when DB actually changes
  const lastSyncedDbRestDatesRef = useRef<string[]>([]);

  // Synchronize full-time worker's calendar selection with registered rest days in the database
  useEffect(() => {
    // Only update availSelectedDates if the database state itself has changed
    const isDbChanged = dbRestDates.length !== lastSyncedDbRestDatesRef.current.length ||
      !dbRestDates.every((d, i) => d === lastSyncedDbRestDatesRef.current[i]);

    if (isDbChanged) {
      lastSyncedDbRestDatesRef.current = dbRestDates;
      setAvailSelectedDates(dbRestDates);
    }
  }, [dbRestDates]);

  // Worker Identity handlers
  const handleWorkerVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerName) {
      setWorkerVerifyError('請選擇您的姓名');
      return;
    }
    const matchingEmp = employees.find(
      emp => emp.name === selectedWorkerName && emp.active !== false
    );
    if (!matchingEmp) {
      setWorkerVerifyError('找不到此員工資料，請聯絡主管。');
      return;
    }

    // Normalize phone numbers to do a robust comparison (strip spaces, dashes, etc.)
    const cleanInput = workerPhoneInput.replace(/[-\s]/g, '');
    const cleanDb = (matchingEmp.phone || '').replace(/[-\s]/g, '');

    if (cleanInput && cleanInput === cleanDb) {
      setWorkerName(selectedWorkerName);
      setIsWorkerVerified(true);
      localStorage.setItem('scheduler_worker_name', selectedWorkerName);
      localStorage.setItem('scheduler_worker_verified', 'true');
      setWorkerVerifyError('');
      setWorkerPhoneInput('');
    } else {
      setWorkerVerifyError('電話號碼不正確，請重新輸入。');
    }
  };

  const handleWorkerLogout = () => {
    setWorkerName('');
    setIsWorkerVerified(false);
    setSelectedWorkerName('');
    localStorage.removeItem('scheduler_worker_name');
    localStorage.removeItem('scheduler_worker_verified');
  };

  // Apply revenue-calculated staffing targets to global default targets
  const handleApplyRevenuesToGlobalTargets = async () => {
    if (safeConfirm('確定要將此營業額計算出的建議人數，套用為系統的預設排班目標 (db-global) 嗎？\n這將直接覆蓋目前的預設排班人數需求。')) {
      try {
        for (let hour = 6; hour <= 19; hour++) {
          const monthlyVal = monthlyRevenues[hour] || 0;
          const dailyAvg = monthlyVal / 30;
          let recommendedStaff = 2;
          if (dailyAvg > 1500) {
            if (dailyAvg <= 2500) {
              recommendedStaff = 3;
            } else if (dailyAvg <= 3500) {
              recommendedStaff = 4;
            } else {
              recommendedStaff = Math.min(8, Math.floor((dailyAvg - 2501) / 1000) + 4);
            }
          }
          await updateStaffingTarget(hour, recommendedStaff); // no date -> updates global default targets
        }
        alert('已成功將營業額建議人數套用為預設排班目標需求！');
      } catch (error) {
        console.error("Failed to apply revenue targets: ", error);
        alert('套用預設目標失敗，請重試。');
      }
    }
  };

  // Reset monthly revenues input data
  const handleResetRevenues = async () => {
    if (safeConfirm('確定要清空所有時段的月營業額輸入數據嗎？')) {
      try {
        await updateMonthlyRevenues({});
      } catch (error) {
        console.error("Failed to reset monthly revenues: ", error);
      }
    }
  };

  // Submit worker availability
  const handleAddAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim()) {
      alert('請先輸入您的姓名。');
      return;
    }

    if (!isWorkerEditable) {
      if (new Date().getDate() < startDay) {
        alert(`尚未開放下月排班登記。開放時間為每月 ${startDay} 日至 ${deadlineDay} 日。`);
      } else {
        alert(`已逾本月登記/修改截止時間（${deadlineDay}日），且已有已確認之排班，無法再進行登記。`);
      }
      return;
    }

    if (!isFullTime && availSelectedDates.length === 0) {
      alert('請至少選擇一個可用日期。');
      return;
    }

    if (!isFullTime) {
      handleOpenWorkerAvailModal();
      return;
    }

    if (isFullTime) {
      try {
        const nextMonthStr = formatDateString(workerNextMonthStart).substring(0, 7);
        const existingRecords = availabilities.filter(
          a => a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase() &&
            a.date.startsWith(nextMonthStr)
        );

        // Delete existing availability records for the month sequentially
        for (const record of existingRecords) {
          await deleteAvailability(record.id);
        }

        // Calculate working days (all month days except selected rest days)
        const activeMonthDays = getDaysInMonth(workerNextMonthStart);
        const workDays = activeMonthDays
          .map(formatDateString)
          .filter(dateStr => !availSelectedDates.includes(dateStr));

        // Save working days sequentially
        for (const dateStr of workDays) {
          await addAvailability({
            employeeName: workerName.trim(),
            date: dateStr,
            workplace: workplaces[0]?.name || '',
            startTime: shiftMorningStart,
            endTime: shiftMorningEnd,
            notes: availNotes.trim()
          });
        }

        setAvailSelectedDates([]);
        setAvailNotes('');
        alert('已成功送出您的不克排班日期！');
      } catch (error) {
        console.error("Error saving availability: ", error);
        alert('送出可用日期失敗，請稍後再試。');
      }
      return;
    }
  };

  // Open the Part-Time availability configurations modal
  const handleOpenWorkerAvailModal = () => {
    if (!workerName.trim()) {
      alert('請先輸入您的姓名。');
      return;
    }

    if (availSelectedDates.length === 0) {
      alert('請至少選擇一個可用日期。');
      return;
    }

    // Sort selected dates chronologically
    const sortedDates = [...availSelectedDates].sort((a, b) => a.localeCompare(b));

    // Pre-populate configs: use existing DB record if available, then in-memory config, then defaults
    const initialConfigs: WorkerAvailConfig[] = sortedDates.map(date => {
      // Already edited in this modal session
      const inSession = availConfigs.find(c => c.date === date);
      if (inSession) return inSession;

      // Existing DB record for this worker+date
      const dbRecord = availabilities.find(
        a => a.date === date && a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase()
      );
      if (dbRecord) {
        const startIdx = timeSlots.indexOf(dbRecord.startTime);
        const endIdx = timeSlots.indexOf(dbRecord.endTime);
        return {
          date,
          startIdx: startIdx >= 0 ? startIdx : 0,
          endIdx: endIdx >= 0 ? endIdx : timeSlots.length - 1,
          workplace: dbRecord.workplace || workplaces[0]?.name || '',
          notes: dbRecord.notes || ''
        };
      }

      // Brand-new date — default to shiftMorningStart & shiftMorningEnd if exists
      const defStart = Math.max(0, timeSlots.indexOf(shiftMorningStart));
      const defEnd = Math.max(0, timeSlots.indexOf(shiftMorningEnd));
      return {
        date,
        startIdx: defStart,
        endIdx: defEnd >= 0 ? defEnd : timeSlots.length - 1,
        workplace: workplaces[0]?.name || '',
        notes: ''
      };
    });

    setAvailConfigs(initialConfigs);
    setIsWorkerAvailModalOpen(true);
  };

  // Update a single config in the list
  const updateAvailConfig = (index: number, updates: Partial<WorkerAvailConfig>) => {
    setAvailConfigs(prev => prev.map((config, idx) => {
      if (idx === index) {
        const newConfig = { ...config, ...updates };
        // Enforce start time is less than or equal to end time
        if (newConfig.startIdx > newConfig.endIdx) {
          if (updates.startIdx !== undefined) {
            newConfig.endIdx = newConfig.startIdx;
          } else if (updates.endIdx !== undefined) {
            newConfig.startIdx = newConfig.endIdx;
          }
        }
        return newConfig;
      }
      return config;
    }));
  };

  // Remove a config from the modal and deselect it in the calendar
  const removeAvailConfig = (index: number) => {
    const configToRemove = availConfigs[index];
    if (!configToRemove) return;

    setAvailConfigs(prev => prev.filter((_, idx) => idx !== index));
    setAvailSelectedDates(prev => prev.filter(d => d !== configToRemove.date));
  };

  // Synchronize first card's details to all other cards in the list
  const handleSyncAllAvailConfigs = () => {
    if (availConfigs.length < 2) return;
    const base = availConfigs[0];
    setAvailConfigs(prev => prev.map((config, idx) => {
      if (idx === 0) return config;
      return {
        ...config,
        startIdx: base.startIdx,
        endIdx: base.endIdx,
        workplace: base.workplace
      };
    }));
  };

  // Submit all PT availability configurations
  const handleWorkerAvailModalSubmit = async () => {
    if (!workerName.trim()) {
      alert('請先輸入您的姓名。');
      return;
    }

    if (!isWorkerEditable) {
      if (new Date().getDate() < startDay) {
        alert(`尚未開放下月排班登記。開放時間為每月 ${startDay} 日至 ${deadlineDay} 日。`);
      } else {
        alert(`已逾本月登記/修改截止時間（${deadlineDay}日），且已有已確認之排班，無法再進行登記。`);
      }
      return;
    }

    if (availConfigs.length === 0) {
      alert('請至少選擇一個可用日期。');
      return;
    }

    // Check consecutive 7 days limit
    const existingDates = availabilities
      .filter(a => a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase())
      .map(a => a.date);
    const activeDates = availConfigs.map(c => c.date);
    const allDates = Array.from(new Set([...existingDates, ...activeDates]));

    if (hasSevenConsecutiveDays(allDates)) {
      alert('⚠️ 無法送出：登記後將出現連續 7 天或以上的工作天。\n\n根據勞工法規，員工每 7 天中至少需有 1 天例假日，不可連續工作超過 6 天。\n\n請重新調整您的可用日期。');
      return;
    }


    try {
      // Upsert each configured availability: delete existing record first if present, then add new
      for (const config of availConfigs) {
        // Find and delete any existing record for this worker+date
        const existing = availabilities.filter(
          a => a.date === config.date &&
            a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase()
        );
        for (const old of existing) {
          await deleteAvailability(old.id);
        }

        await addAvailability({
          employeeName: workerName.trim(),
          date: config.date,
          workplace: config.workplace,
          startTime: timeSlots[config.startIdx],
          endTime: timeSlots[config.endIdx],
          notes: config.notes.trim()
        });
      }

      setIsWorkerAvailModalOpen(false);
      setAvailSelectedDates([]);
      setAvailConfigs([]);
      setTimeout(() => {
        alert('已成功送出您的可用時間！');
      }, 100);
    } catch (error) {
      console.error("Error saving availability: ", error);
      alert('送出可用時間失敗，請稍後再試。');
    }
  };



  // Instant Schedule Assign (Zero-Click Modal)
  // Instant Schedule Assign (Zero-Click Modal)
  const handleInstantAssign = async (avail: WorkerAvailability) => {
    if (avail.startTime === '00:00' && avail.endTime === '00:00') {
      alert('此同仁此日登記為休假，無法直接指派排班！');
      return;
    }

    const emp = employees.find(
      e => e.name.trim().toLowerCase() === avail.employeeName.trim().toLowerCase() && e.active !== false
    );
    const isFT = emp?.status === '正式夥伴';

    if (isFT) {
      setPendingAssignAvail(avail);
      setIsFTAssignModalOpen(true);
      return;
    }

    // Part-time worker assign logic
    try {
      // Check staffing limit warning
      const daySchedules = schedules.filter(s => s.date === avail.date);
      let wouldExceedOrReach = false;
      let limitHour = -1;
      let limitCount = 0;
      let currentCount = 0;

      for (let hour = 0; hour < 24; hour++) {
        if (isShiftActiveAtHour(avail.startTime, avail.endTime, hour)) {
          const target = getStaffingTargetForHour(hour, avail.date);
          const current = daySchedules.filter(s => isShiftActiveAtHour(s.startTime, s.endTime, hour)).length;
          if (current >= target) {
            wouldExceedOrReach = true;
            limitHour = hour;
            limitCount = target;
            currentCount = current;
            break;
          }
        }
      }

      if (wouldExceedOrReach) {
        const confirmAssign = safeConfirm(
          `警告：該日期 ${avail.date} 在 ${limitHour}:00-${limitHour + 1}:00 的排班人數 (${currentCount}人) 已達到或超過目標上限 (${limitCount}人)。確定仍要指派此班次嗎？`
        );
        if (!confirmAssign) return;
      }

      const derivedColor = getColorFromName(avail.employeeName);
      const payload = {
        title: avail.employeeName.trim(),
        employeeName: avail.employeeName.trim(),
        date: avail.date,
        workplace: avail.workplace,
        startTime: avail.startTime,
        endTime: avail.endTime,
        notes: avail.notes ? `由登記可用時間自動排入: ${avail.notes.trim()}` : '由登記可用時間自動排入',
        workerNotes: avail.notes ? avail.notes.trim() : '',
        managerNotes: '',
        color: derivedColor,
        originalStartTime: avail.startTime,
        originalEndTime: avail.endTime,
        availabilityId: avail.id
      };
      await addSchedule(payload);
      // Mark availability as confirmed so it no longer shows as unconfirmed in the grid
      await updateAvailability(avail.id, { confirmed: true });
    } catch (error) {
      console.error("Error doing instant assign: ", error);
      alert('自動排程失敗，請重試。');
    }
  };

  const executeFTAssign = async (avail: WorkerAvailability, shiftName: string, sTime: string, eTime: string) => {
    setIsFTAssignModalOpen(false);
    setPendingAssignAvail(null);

    try {
      // Check staffing limit warning
      const daySchedules = schedules.filter(s => s.date === avail.date);
      let wouldExceedOrReach = false;
      let limitHour = -1;
      let limitCount = 0;
      let currentCount = 0;

      for (let hour = 0; hour < 24; hour++) {
        if (isShiftActiveAtHour(sTime, eTime, hour)) {
          const target = getStaffingTargetForHour(hour, avail.date);
          const current = daySchedules.filter(s => isShiftActiveAtHour(s.startTime, s.endTime, hour)).length;
          if (current >= target) {
            wouldExceedOrReach = true;
            limitHour = hour;
            limitCount = target;
            currentCount = current;
            break;
          }
        }
      }

      if (wouldExceedOrReach) {
        const confirmAssign = safeConfirm(
          `警告：該日期 ${avail.date} 在 ${limitHour}:00-${limitHour + 1}:00 的排班人數 (${currentCount}人) 已達到或超過目標上限 (${limitCount}人)。確定仍要指派此班次嗎？`
        );
        if (!confirmAssign) return;
      }

      const derivedColor = getColorFromName(avail.employeeName);
      const payload = {
        title: avail.employeeName.trim(),
        employeeName: avail.employeeName.trim(),
        date: avail.date,
        workplace: avail.workplace,
        startTime: sTime,
        endTime: eTime,
        notes: avail.notes ? `由登記可用時間自動排入 (${shiftName}): ${avail.notes.trim()}` : `由登記可用時間自動排入 (${shiftName})`,
        workerNotes: avail.notes ? avail.notes.trim() : '',
        managerNotes: '',
        color: derivedColor,
        originalStartTime: sTime,
        originalEndTime: eTime,
        availabilityId: avail.id
      };
      await addSchedule(payload);
      await updateAvailability(avail.id, { confirmed: true });
    } catch (error) {
      console.error("Error doing full-time assign: ", error);
      alert('自動排程失敗，請重試。');
    }
  };

  const getIsDayUnderstaffed = (dateStr: string) => {
    const daySchedules = schedules.filter(s => s.date === dateStr);
    for (let hour = 6; hour <= 20; hour++) {
      const target = getStaffingTargetForHour(hour, dateStr);
      if (target > 0) {
        const current = daySchedules.filter(s => isShiftActiveAtHour(s.startTime, s.endTime, hour)).length;
        if (current < target) return true;
      }
    }
    return false;
  };


  // Update staffing target
  const handleUpdateTarget = async (hour: number, change: number) => {
    const currentCount = getStaffingTargetForHour(hour, selectedDateStr);
    const newCount = Math.max(0, currentCount + change);
    try {
      await updateStaffingTarget(hour, newCount, selectedDateStr);
    } catch (error) {
      console.error("Error updating staffing target: ", error);
    }
  };

  const getStaffingTargetForHour = (hour: number, dateStr?: string): number => {
    const targetDate = dateStr || selectedDateStr;
    const dateMatch = staffingTargets.find(t => t.hour === hour && t.date === targetDate);
    if (dateMatch) return dateMatch.targetCount;

    const globalMatch = staffingTargets.find(t => t.hour === hour && !t.date);
    if (globalMatch) return globalMatch.targetCount;

    return 2;
  };

  const handleAdjustSelectedDate = (days: number) => {
    const current = new Date(selectedDateStr);
    current.setDate(current.getDate() + days);
    const newDateStr = formatDateString(current);
    setSelectedDateStr(newDateStr);

    const currentMonth = currentMonthStart.getMonth();
    const currentYear = currentMonthStart.getFullYear();
    if (current.getMonth() !== currentMonth || current.getFullYear() !== currentYear) {
      setCurrentMonthStart(new Date(current.getFullYear(), current.getMonth(), 1));
    }
  };

  // Toggle date selection for worker availability form
  const toggleAvailDateSelection = (dateStr: string) => {
    if (availSelectedDates.includes(dateStr)) {
      setAvailSelectedDates(availSelectedDates.filter(d => d !== dateStr));
    } else {
      setAvailSelectedDates([...availSelectedDates, dateStr]);
    }
  };

  // Quick select shortcuts for worker availability
  const handleSelectAvailAllDays = () => {
    setAvailSelectedDates(workerDaysInMonth.map(formatDateString));
  };

  const handleSelectAvailMonWedFri = () => {
    const mwf = workerDaysInMonth
      .filter(d => d.getDay() === 1 || d.getDay() === 3 || d.getDay() === 5)
      .map(formatDateString);
    setAvailSelectedDates(mwf);
  };

  const handleSelectAvailTueThu = () => {
    const tt = workerDaysInMonth
      .filter(d => d.getDay() === 2 || d.getDay() === 4)
      .map(formatDateString);
    setAvailSelectedDates(tt);
  };

  const handleClearAvailAllSelected = () => {
    setAvailSelectedDates([]);
  };

  // Open modal to add shift
  const handleOpenAddModal = (defaultDateStr?: string) => {
    setModalMode('create');
    setEditingId(null);
    setEmployeeName('');
    setWorkplace(workplaces[0]?.name || '');
    setStartTime('09:00');
    setEndTime('17:00');
    setNotes('');
    setWorkerNotes('');
    setFormOriginalStartTime(null);
    setFormOriginalEndTime(null);

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
    setNotes(schedule.managerNotes !== undefined ? schedule.managerNotes : getManagerNote(schedule));
    setWorkerNotes(schedule.workerNotes !== undefined ? schedule.workerNotes : getWorkerNote(schedule));
    setSingleDate(schedule.date);
    setFormOriginalStartTime(schedule.originalStartTime || schedule.startTime);
    setFormOriginalEndTime(schedule.originalEndTime || schedule.endTime);

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

    const targetName = employeeName.trim();

    // Check 2: Consecutive 7 days for schedules
    if (modalMode === 'create') {
      const existingScheduleDates = schedules
        .filter(s => s.employeeName.trim().toLowerCase() === targetName.toLowerCase())
        .map(s => s.date);
      const allScheduleDates = Array.from(new Set([...existingScheduleDates, ...selectedDates]));
      if (hasSevenConsecutiveDays(allScheduleDates)) {
        alert(`⚠️ 無法排班：為「${targetName}」排班後將出現連續 7 天或以上的班次。\n\n根據勞工法規，員工每 7 天中至少需有 1 天例假日，不可連續排班超過 6 天。\n\n請重新調整排班日期。`);
        return;
      }
    } else if (modalMode === 'edit' && editingId && singleDate) {
      const existingScheduleDates = schedules
        .filter(s => s.employeeName.trim().toLowerCase() === targetName.toLowerCase() && s.id !== editingId)
        .map(s => s.date);
      const allScheduleDates = Array.from(new Set([...existingScheduleDates, singleDate]));
      if (hasSevenConsecutiveDays(allScheduleDates)) {
        alert(`⚠️ 無法排班：為「${targetName}」修改後將出現連續 7 天或以上的班次。\n\n根據勞工法規，員工每 7 天中至少需有 1 天例假日，不可連續排班超過 6 天。\n\n請重新調整排班日期。`);
        return;
      }
    }

    // Check 1: Over 8 effective hours warning for schedules
    if (isOverEightHours(startTime, endTime)) {
      const proceed = window.confirm(
        `⚠️ 注意：此班次（${startTime} - ${endTime}）扣除 1 小時休息後，有效工時超過 8 小時。\n\n建議單次排班不超過 8 小時（含休息共 9 小時）。\n\n確定仍要儲存此排班嗎？`
      );
      if (!proceed) return;
    }

    try {
      const derivedColor = getColorFromName(employeeName);

      if (modalMode === 'create') {
        for (const dateStr of selectedDates) {
          const payload = {
            title: employeeName.trim(),
            employeeName: employeeName.trim(),
            date: dateStr,
            workplace,
            startTime,
            endTime,
            notes: notes.trim(),
            managerNotes: notes.trim(),
            workerNotes: '',
            color: derivedColor,
            originalStartTime: formOriginalStartTime || null,
            originalEndTime: formOriginalEndTime || null
          };
          await addSchedule(payload);
        }
      } else if (modalMode === 'edit' && editingId) {
        const payload = {
          title: employeeName.trim(),
          employeeName: employeeName.trim(),
          date: singleDate,
          workplace,
          startTime,
          endTime,
          notes: notes.trim(),
          managerNotes: notes.trim(),
          workerNotes: workerNotes,
          color: derivedColor,
          originalStartTime: formOriginalStartTime || null,
          originalEndTime: formOriginalEndTime || null
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
    if (safeConfirm('確定要刪除此排程紀錄嗎？')) {
      try {
        const scheduleToDelete = schedules.find(s => s.id === id);
        await deleteSchedule(id);
        if (scheduleToDelete?.availabilityId) {
          await updateAvailability(scheduleToDelete.availabilityId, { confirmed: false });
        }
      } catch (error) {
        console.error("Error deleting schedule: ", error);
      }
    }
  };

  // Delete availability handler
  const handleDeleteAvailability = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isWorkerEditable) {
      if (new Date().getDate() < startDay) {
        alert(`尚未開放下月排班登記。開放時間為每月 ${startDay} 日至 ${deadlineDay} 日。`);
      } else {
        alert(`已逾本月登記/修改截止時間（${deadlineDay}日），且已有已確認之排班，無法刪除登記。`);
      }
      return;
    }

    // Check if it is a virtual ID or a real rest day record (00:00 - 00:00)
    const avail = id.startsWith('virtual-off-') ? null : availabilities.find(a => a.id === id);
    const isRestDay = id.startsWith('virtual-off-') || (avail && avail.startTime === '00:00' && avail.endTime === '00:00');

    if (isRestDay) {
      const dateStr = id.startsWith('virtual-off-') ? id.replace('virtual-off-', '') : avail!.date;
      const targetMonthStr = dateStr.substring(0, 7);

      // Get all availabilities for this worker in this target month
      const workerAvails = availabilities.filter(
        a => a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase() && a.date.startsWith(targetMonthStr)
      );

      const workDates = workerAvails
        .filter(a => !(a.startTime === '00:00' && a.endTime === '00:00'))
        .map(a => a.date);

      const daysInMonth = getDaysInMonth(new Date(dateStr));
      const computedRestDates = daysInMonth
        .map(formatDateString)
        .filter(d => !workDates.includes(d));

      const legacyRestDates = workerAvails
        .filter(a => a.startTime === '00:00' && a.endTime === '00:00')
        .map(a => a.date);

      const allRestDates = Array.from(new Set([...computedRestDates, ...legacyRestDates]));

      if (allRestDates.length === 1 && allRestDates.includes(dateStr)) {
        // Deleting the last rest day means they have 0 rest days, which means we should clear their entire month's registration
        if (safeConfirm(`這是您本月最後一個休假日期。變更此日期將會清除您本月的整月排班登記（避免因無休息日而違反連續工作規定）。確定要清除所有登記嗎？`)) {
          try {
            // Delete all worker availabilities for this month
            for (const record of workerAvails) {
              await deleteAvailability(record.id);
            }
          } catch (error) {
            console.error("Error clearing availabilities: ", error);
          }
        }
        return;
      }

      if (safeConfirm(`確定要將 ${dateStr} 的休假改為配合排班（早班，${shiftMorningStart}-${shiftMorningEnd}）嗎？`)) {
        try {
          if (avail) {
            await deleteAvailability(avail.id);
          }
          await addAvailability({
            employeeName: workerName.trim(),
            date: dateStr,
            workplace: workplaces[0]?.name || '',
            startTime: shiftMorningStart,
            endTime: shiftMorningEnd,
            notes: ''
          });
        } catch (error) {
          console.error("Error changing rest day to work day: ", error);
        }
      }
      return;
    }

    // Real work day DB record (avail is found and not 00:00-00:00)
    if (!avail) return;

    if (avail.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase() && isFullTime) {
      if (safeConfirm(`確定要將 ${avail.date} 的工作登記改為休假嗎？`)) {
        try {
          await deleteAvailability(avail.id);
        } catch (error) {
          console.error("Error deleting availability: ", error);
        }
      }
    } else {
      if (safeConfirm('確定要刪除此可用時間登記嗎？')) {
        try {
          await deleteAvailability(avail.id);
        } catch (error) {
          console.error("Error deleting availability: ", error);
        }
      }
    }
  };

  // Edit availability handler for worker page
  const handleEditAvailability = (avail: WorkerAvailability) => {
    if (!isWorkerEditable) {
      if (new Date().getDate() < startDay) {
        alert(`尚未開放下月排班登記。開放時間為每月 ${startDay} 日至 ${deadlineDay} 日。`);
      } else {
        alert(`已逾本月登記/修改截止時間（${deadlineDay}日），且已有已確認之排班，無法修改登記。`);
      }
      return;
    }

    const startIdx = timeSlots.indexOf(avail.startTime);
    const endIdx = timeSlots.indexOf(avail.endTime);

    setAvailConfigs([
      {
        date: avail.date,
        startIdx: startIdx >= 0 ? startIdx : 0,
        endIdx: endIdx >= 0 ? endIdx : timeSlots.length - 1,
        workplace: avail.workplace || workplaces[0]?.name || '',
        notes: avail.notes || ''
      }
    ]);
    setAvailSelectedDates([avail.date]);
    setIsWorkerAvailModalOpen(true);
  };

  const getDayNote = (dateStr: string): string => {
    const match = staffingTargets.find(t => t.hour === 99 && t.date === dateStr);
    return match ? match.note || '' : '';
  };

  const handleUpdateDayNote = async (dateStr: string, note: string) => {
    try {
      await updateDayNote(dateStr, note);
    } catch (error) {
      console.error("Error updating day note: ", error);
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
    setSelectedDates(getDaysInMonth(currentMonthStart).map(formatDateString));
  };

  const handleSelectMonWedFri = () => {
    const mwf = getDaysInMonth(currentMonthStart)
      .filter(d => d.getDay() === 1 || d.getDay() === 3 || d.getDay() === 5)
      .map(formatDateString);
    setSelectedDates(mwf);
  };

  const handleSelectTueThu = () => {
    const tt = getDaysInMonth(currentMonthStart)
      .filter(d => d.getDay() === 2 || d.getDay() === 4)
      .map(formatDateString);
    setSelectedDates(tt);
  };

  const handleClearAllSelected = () => {
    setSelectedDates([]);
  };

  const handleEmployeeNameChange = (newName: string) => {
    setEmployeeName(newName);
    if (!newName) return;

    const emp = employees.find(
      x => x.name.trim().toLowerCase() === newName.trim().toLowerCase() && x.active !== false
    );
    const isFT = emp?.status === '正式夥伴';

    if (isFT) {
      setStartTime(shiftMorningStart);
      setEndTime(shiftMorningEnd);

      const monthStr = formatDateString(currentMonthStart).substring(0, 7);
      const empMonthAvails = availabilities.filter(
        a => a.employeeName.trim().toLowerCase() === newName.trim().toLowerCase() &&
          a.date.startsWith(monthStr)
      );

      const activeMonthDays = getDaysInMonth(currentMonthStart);
      if (empMonthAvails.length > 0) {
        const workDates = empMonthAvails
          .filter(a => !(a.startTime === '00:00' && a.endTime === '00:00'))
          .map(a => a.date);
        setSelectedDates(workDates);
      } else {
        setSelectedDates(activeMonthDays.map(formatDateString));
      }
    } else {
      setStartTime('09:00');
      setEndTime('17:00');
    }
  };

  const getScheduleTheme = (schedule: WorkSchedule) => {
    if (schedule.originalStartTime && schedule.originalEndTime) {
      if (schedule.startTime !== schedule.originalStartTime || schedule.endTime !== schedule.originalEndTime) {
        return COLOR_THEMES.lightBlue;
      }
    }
    return COLOR_THEMES.indigo;
  };

  // Calendar calculations (filtered by the currently active visible month grid)
  const monthGridDates = getMonthGridDates(currentMonthStart);
  const gridDates = getDaysInMonth(currentMonthStart);

  const allEmployees = useMemo(() => {
    const uniqueNames = Array.from(
      new Set([
        ...employees.map(e => e.name.trim()),
        ...schedules.map(s => s.employeeName.trim()),
        ...availabilities.map(a => a.employeeName.trim())
      ])
    ).filter(Boolean);

    return uniqueNames.sort((a, b) => {
      const idxA = employeeOrder.indexOf(a);
      const idxB = employeeOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) {
        return idxA - idxB;
      }
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, 'zh-Hant');
    });
  }, [employees, schedules, availabilities, employeeOrder]);

  const handleMoveEmployeeUp = async (name: string) => {
    const currentOrder = [...allEmployees];
    const index = currentOrder.indexOf(name);
    if (index > 0) {
      // Swap with index - 1
      currentOrder[index] = currentOrder[index - 1];
      currentOrder[index - 1] = name;
      setEmployeeOrder(currentOrder);
      try {
        await updateEmployeeOrder(currentOrder);
      } catch (error) {
        console.error("Failed to move employee up: ", error);
      }
    }
  };

  const handleMoveEmployeeDown = async (name: string) => {
    const currentOrder = [...allEmployees];
    const index = currentOrder.indexOf(name);
    if (index !== -1 && index < currentOrder.length - 1) {
      // Swap with index + 1
      currentOrder[index] = currentOrder[index + 1];
      currentOrder[index + 1] = name;
      setEmployeeOrder(currentOrder);
      try {
        await updateEmployeeOrder(currentOrder);
      } catch (error) {
        console.error("Failed to move employee down: ", error);
      }
    }
  };


  const getSchedulesForDate = (dateStr: string) => {
    return schedules
      .filter(item => item.date === dateStr)
      .sort((a, b) => compareTimeStrings(a.startTime, b.startTime));
  };

  const getAvailabilitiesForDate = (dateStr: string) => {
    return availabilities
      .filter(item => item.date === dateStr && item.confirmed !== true)
      .sort((a, b) => compareTimeStrings(a.startTime, b.startTime));
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

  const generateExcelWorkbook = (): { wb: XLSX.WorkBook; filename: string } | null => {
    if (!exportStartDate || !exportEndDate) {
      alert('請先選擇匯出的日期範圍。');
      return null;
    }

    const start = new Date(exportStartDate);
    const end = new Date(exportEndDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      alert('請輸入有效的日期範圍。');
      return null;
    }

    const exportDates = getDatesInRange(exportStartDate, exportEndDate);
    if (exportDates.length === 0) {
      alert('選擇的日期範圍內沒有日期。');
      return null;
    }

    const exportSchedules = schedules.filter(item => {
      return item.date && item.date >= exportStartDate && item.date <= exportEndDate;
    });

    if (exportSchedules.length === 0) {
      alert('在此日期範圍內尚無排班資料可供匯出。');
      return null;
    }

    const getDayOfWeekName = (dateStr: string): string => {
      if (!dateStr) return '';
      const parts = dateStr.split('-').map(Number);
      if (parts.length < 3) return '';
      const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
      const dayIdx = dateObj.getDay();
      const mapped = dayIdx === 0 ? 7 : dayIdx;
      const match = DAYS_OF_WEEK.find(d => d.value === mapped);
      return match ? match.name : '';
    };

    // Columns: Personnel Name, Date 1, Date 2, ..., Date N
    const dateHeaders = exportDates.map(dateObj => {
      const dateStr = formatDateString(dateObj);
      const dayName = getDayOfWeekName(dateStr);
      const parts = dateStr.split('-');
      const mmdd = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : dateStr;
      const dayOfWeekIndex = dateObj.getDay();
      const mappedDayIndex = dayOfWeekIndex === 0 ? 7 : dayOfWeekIndex;
      const isERP = mappedDayIndex === 1 || mappedDayIndex === 3 || mappedDayIndex === 5;
      const customNote = getDayNote(dateStr);

      let headerVal = isERP ? `${mmdd}\n(${dayName} ERP)` : `${mmdd}\n(${dayName})`;
      if (customNote) {
        headerVal += `\n[${customNote}]`;
      }
      return headerVal;
    });

    const headers = ['人員姓名', ...dateHeaders, '總工時(hrs)'];
    const rows: string[][] = [];
    const changedCells = new Set<string>();
    const redFontCells = new Set<string>();

    // Add employee rows
    allEmployees.forEach((empName, empIdx) => {
      let totalHours = 0;

      const dateCells = exportDates.map((dateObj, dateIdx) => {
        const dateStr = formatDateString(dateObj);
        const empSchedules = schedules.filter(
          s => s.employeeName.trim().toLowerCase() === empName.trim().toLowerCase() && s.date === dateStr
        ).sort((a, b) => compareTimeStrings(a.startTime, b.startTime));

        // Get availability submissions for this employee on this date
        const empAvailabilities = availabilities.filter(
          a => a.employeeName.trim().toLowerCase() === empName.trim().toLowerCase() && a.date === dateStr
        );

        // Check if worker registered standard work hours (not 00:00 to 00:00 rest day)
        const registeredToWork = empAvailabilities.some(a => !(a.startTime === '00:00' && a.endTime === '00:00'));

        const hasChangedShift = empSchedules.some(
          s => s.originalStartTime && s.originalEndTime && (s.startTime !== s.originalStartTime || s.endTime !== s.originalEndTime)
        );

        if (hasChangedShift) {
          // +1 because col 0 = name, col 1+ = dates
          const cellRef = XLSX.utils.encode_cell({ r: empIdx + 1, c: dateIdx + 1 });
          changedCells.add(cellRef);
        }

        // Accumulate hours
        empSchedules.forEach(sched => {
          totalHours += calculateDuration(sched.startTime, sched.endTime);
        });

        if (empSchedules.length === 0) {
          const cellRef = XLSX.utils.encode_cell({ r: empIdx + 1, c: dateIdx + 1 });
          redFontCells.add(cellRef);
          return registeredToWork ? 'X' : 'RO';
        }

        return empSchedules.map(sched => {
          const note = getCleanNote(sched.notes);
          return note
            ? `${sched.startTime}-${sched.endTime}\n(${note})`
            : `${sched.startTime}-${sched.endTime}`;
        }).join('\n');
      });

      const totalHoursStr = totalHours > 0 ? `${Math.round(totalHours * 10) / 10}` : '';
      const row = [empName, ...dateCells, totalHoursStr];
      rows.push(row);
    });

    // Combine headers and data for the sheet
    const aoaData = [headers, ...rows];

    // Generate XLSX workbook & sheet
    const ws = XLSX.utils.aoa_to_sheet(aoaData);

    // Enable wrap text style and center alignment on all cells
    for (const cellRef in ws) {
      if (cellRef[0] === '!') continue;
      if (ws[cellRef]) {
        const decoded = XLSX.utils.decode_cell(cellRef);
        const { r, c } = decoded;
        const isChanged = changedCells.has(cellRef);
        const isRedFont = redFontCells.has(cellRef);

        // Check if employee for this row is a newcomer
        let isNewcomer = false;
        if (r > 0) {
          const empName = allEmployees[r - 1];
          if (empName) {
            const empObj = employees.find(e => e.name.trim().toLowerCase() === empName.trim().toLowerCase());
            isNewcomer = empObj ? !!empObj.isNewcomer : false;
          }
        }

        // Check if this column represents a weekend date (Saturday or Sunday)
        let isWeekend = false;
        if (c > 0 && c < headers.length - 1) {
          const dateObj = exportDates[c - 1];
          const day = dateObj.getDay();
          isWeekend = day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
        }

        // Check if this column's header contains the word/comment "包"
        let isPackageHeader = false;
        if (c > 0 && c < headers.length - 1) {
          const headerText = headers[c];
          if (headerText && headerText.includes('包')) {
            isPackageHeader = true;
          }
        }

        ws[cellRef].s = {
          alignment: { wrapText: true, vertical: 'center', horizontal: 'center' },
          font: {
            // Apply red color and bold text to the weekend date headers
            ...(isWeekend && r === 0 ? { color: { rgb: "EF4444" }, bold: true } : {}),
            // Apply red color and bold text to RO / X cells
            ...(isRedFont ? { color: { rgb: "EF4444" }, bold: true } : {})
          },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          },
          ...((isPackageHeader && r === 0) ? {
            fill: {
              fgColor: { rgb: "86EFAC" } // Darker green background for headers containing "包"
            }
          } : (r > 0 && isNewcomer) ? {
            fill: {
              fgColor: { rgb: "FFC0CB" } // Pink background for newcomer row
            }
          } : isChanged ? {
            fill: {
              fgColor: { rgb: "93C5FD" } // Light blue background for changed shifts
            }
          } : {})
        };
      }
    }

    // Auto-fit column widths
    const maxCols = headers.length;
    const colWidths = Array(maxCols).fill({ wch: 10 });
    colWidths[0] = { wch: 15 }; // Employee name
    colWidths[maxCols - 1] = { wch: 12 }; // Total hours (last column)

    // Set column widths in the sheet
    ws['!cols'] = colWidths;

    // Freeze the first column (Column A - Personnel Name) and the header row (Row 1)
    ws['!views'] = [
      {
        state: 'frozen',
        xSplit: 1,
        ySplit: 1,
        topLeftCell: 'B2',
        activePane: 'bottomRight'
      }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '排班網格表');

    return {
      wb,
      filename: `${exportStartDate}_至_${exportEndDate}_精品咖啡館排班網格表.xlsx`
    };
  };

  const handleExportToExcel = () => {
    const result = generateExcelWorkbook();
    if (result) {
      XLSX.writeFile(result.wb, result.filename);
    }
  };

  const uploadToGoogleDrive = async (token: string, filename: string, blob: Blob) => {
    try {
      setIsUploadingExcel(true);
      setUploadExcelStatus('idle');

      const reader = new FileReader();
      reader.readAsArrayBuffer(blob);
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;

          const metadata = {
            name: filename,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          };

          const boundary = 'foo_bar_boundary';
          const delimiter = `\r\n--${boundary}\r\n`;
          const closeDelimiter = `\r\n--${boundary}--`;

          const metadataPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
          const mediaHeader = `Content-Type: ${metadata.mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;

          const base64Data = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          const multipartBody = 
            delimiter + 
            metadataPart + 
            delimiter + 
            mediaHeader + 
            base64Data + 
            closeDelimiter;

          const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
          const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody
          });

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Google Drive API responded with status ${res.status}: ${errorText}`);
          }

          setUploadExcelStatus('success');
          alert(`已成功將排班表備份至您的 Google 雲端硬碟！☁️\n檔案名稱: ${filename}`);

          setTimeout(() => {
            setUploadExcelStatus('idle');
          }, 3000);

        } catch (innerErr: any) {
          console.error('Constructing Google Drive upload body failed:', innerErr);
          setUploadExcelStatus('error');
          alert(`備份至 Google Drive 失敗，請稍後再試。\n錯誤原因: ${innerErr?.message || innerErr}`);
        }
      };
      
      reader.onerror = () => {
        throw new Error('FileReader failed to read the Excel Blob.');
      };

    } catch (error: any) {
      console.error('Google Drive upload failed:', error);
      setUploadExcelStatus('error');
      alert(`備份至 Google Drive 失敗，請確認您的網路連線與授權狀態。\n錯誤原因: ${error?.message || error}`);
    } finally {
      setIsUploadingExcel(false);
    }
  };

  const handleUploadToStorage = () => {
    const result = generateExcelWorkbook();
    if (!result) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId) {
      setUploadExcelStatus('noconfig');
      alert('Google OAuth 2.0 Client ID 尚未設定，無法進行備份。\n請至 .env.local 檔案中填寫 VITE_GOOGLE_CLIENT_ID。');
      return;
    }

    const excelBuffer = XLSX.write(result.wb, { bookType: 'xlsx', type: 'array' });
    const excelBlob = new Blob([excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });

    if (googleAccessToken) {
      uploadToGoogleDrive(googleAccessToken, result.filename, excelBlob);
      return;
    }

    try {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        alert('無法載入 Google 驗證模組，請確認您的網路連線或 index.html 的 script 載入是否正常。');
        return;
      }

      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error('Google Auth Token Client returned error:', tokenResponse);
            alert('Google 授權驗證失敗，無法備份。');
            return;
          }
          if (tokenResponse.access_token) {
            setGoogleAccessToken(tokenResponse.access_token);
            uploadToGoogleDrive(tokenResponse.access_token, result.filename, excelBlob);
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      console.error('Failed to initialize Google GSI Client:', err);
      alert('Google 登入驗證初始化失敗，請稍後再試。');
    }
  };

  const todayStr = formatDateString(new Date());

  // Get selected day details (used in mobile view detail block)
  const selectedDateObject = new Date(selectedDateStr);
  const selectedDateShifts = getSchedulesForDate(selectedDateStr);
  const selectedDateTotalHours = getDateTotalHours(selectedDateStr);
  const selectedDayOfWeekIndex = selectedDateObject.getDay();
  const selectedDayOfWeekMapped = selectedDayOfWeekIndex === 0 ? 7 : selectedDayOfWeekIndex;
  const selectedDayInfo = DAYS_OF_WEEK.find(d => d.value === selectedDayOfWeekMapped) || DAYS_OF_WEEK[0];

  // Availabilities on selected day
  const dayAvailabilities = getAvailabilitiesForDate(selectedDateStr);

  const getWorkerDisplayAvailabilities = () => {
    const cleanWorkerName = workerName.trim().toLowerCase();
    if (!cleanWorkerName) return [];

    const workerAvails = availabilities.filter(
      a => a.employeeName.trim().toLowerCase() === cleanWorkerName
    );

    if (!isFullTime) {
      const nextMonthStr = formatDateString(workerNextMonthStart).substring(0, 7);
      return workerAvails.filter(a => a.date.startsWith(nextMonthStr));
    }


    const registeredMonths = Array.from(
      new Set(
        workerAvails
          .filter(a => !(a.startTime === '00:00' && a.endTime === '00:00'))
          .map(a => a.date.substring(0, 7))
      )
    );

    const computedOffDays: any[] = [];

    for (const monthStr of registeredMonths) {
      const [year, month] = monthStr.split('-').map(Number);
      const monthStartDate = new Date(year, month - 1, 1);
      const daysInMonth = getDaysInMonth(monthStartDate);

      const workDates = workerAvails
        .filter(a => a.date.startsWith(monthStr) && !(a.startTime === '00:00' && a.endTime === '00:00'))
        .map(a => a.date);

      const offDates = daysInMonth
        .map(formatDateString)
        .filter(dateStr => !workDates.includes(dateStr));

      const monthNote = workerAvails.find(a => a.date.startsWith(monthStr) && a.notes && a.notes.trim())?.notes || '';

      for (const offDate of offDates) {
        computedOffDays.push({
          id: `virtual-off-${offDate}`,
          employeeName: workerName,
          date: offDate,
          workplace: '不克排班',
          startTime: '00:00',
          endTime: '00:00',
          notes: monthNote || '休假',
          isVirtual: true
        });
      }
    }

    const legacyOffDays = workerAvails.filter(a => a.startTime === '00:00' && a.endTime === '00:00');
    const allOffDays = [...computedOffDays];
    for (const legacy of legacyOffDays) {
      if (!allOffDays.some(o => o.date === legacy.date)) {
        allOffDays.push(legacy);
      }
    }

    return allOffDays;
  };

  return (
    <div className="min-h-screen text-[#3E2723] font-sans pb-12">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

        {/* Header Banner */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/60 p-6 md:p-8 rounded-2xl border border-[#DAC0A3]/50 backdrop-blur-md relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#8D6E63]/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>

          <div className="space-y-2 z-10">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#5D4037] via-[#8D6E63] to-[#A1887F] bg-clip-text text-transparent flex items-center gap-2">
                精品咖啡館 ☕ 夥伴排班系統
              </h1>
              {isValidConfig ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-600/10 border border-emerald-600/20 text-[#2E7D32]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32] animate-ping"></span>
                  雲端同步已啟用
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#8D6E63]/10 border border-[#8D6E63]/20 text-[#6D4C41]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8D6E63]"></span>
                  本機儲存 (LocalStorage)
                </span>
              )}
            </div>
            <p className="text-[#6D4C41]/80 text-xs md:text-sm font-medium">
              提供排班夥伴登記可用時段與店長排班規劃，支援咖啡館人力覆蓋率與工時即時同步。
            </p>
          </div>

          <div className="z-10 flex gap-2 w-full md:w-auto">
            {activeRole === 'manager' && isAuthenticated && (
              <div className="flex gap-2 w-full md:w-auto">
                <button
                  onClick={() => handleOpenAddModal(selectedDateStr)}
                  className="flex-1 md:flex-initial bg-[#795548] hover:bg-[#6D4C41] text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-[#795548]/15 hover:shadow-[#795548]/25 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  新增排班紀錄
                </button>
                <button
                  onClick={handleLogout}
                  className="bg-white hover:bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] hover:text-[#3E2723] font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer text-sm"
                  title="登出管理模式"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h4a3 3 0 013 3v1" />
                  </svg>
                  登出
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Role Switcher - Only visible to authenticated managers */}
        {isAuthenticated && (
          <div className="flex justify-center">
            <div className="bg-white/60 p-1.5 rounded-2xl border border-[#DAC0A3]/50 backdrop-blur-md flex gap-2 shadow-sm">
              <button
                onClick={() => {
                  window.location.hash = '#/worker';
                }}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${activeRole === 'worker'
                  ? 'bg-[#6D4C41] text-white shadow-md shadow-[#6D4C41]/15'
                  : 'text-[#8D6E63] hover:text-[#5D4037] hover:bg-[#F5EBE6]/60'
                  }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                員工：登記可用時間
              </button>
              <button
                onClick={() => {
                  window.location.hash = '#/manager';
                }}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${activeRole === 'manager'
                  ? 'bg-[#6D4C41] text-white shadow-md shadow-[#6D4C41]/15'
                  : 'text-[#8D6E63] hover:text-[#5D4037] hover:bg-[#F5EBE6]/60'
                  }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                主管：排班規劃中心
              </button>
            </div>
          </div>
        )}

        {/* WORKER ROLE VIEW */}
        {activeRole === 'worker' && (
          !isWorkerVerified ? (
            /* Worker Verification Screen */
            <div className="max-w-md mx-auto my-12 animate-scale-in">
              <div className="glass-panel p-8 rounded-3xl border border-[#DAC0A3]/50 shadow-2xl flex flex-col space-y-6">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#DAC0A3]/50 text-3xl shadow-sm">
                    👤
                  </div>
                  <h2 className="text-xl font-black text-[#3E2723] pt-2">
                    員工可用時間系統 ☕ 驗證身分
                  </h2>
                  <p className="text-xs text-[#6D4C41] font-medium">
                    請選擇您的姓名並輸入聯絡電話以確認身分
                  </p>
                </div>

                <form onSubmit={handleWorkerVerify} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">員工姓名</label>
                    <select
                      required
                      value={selectedWorkerName}
                      onChange={(e) => setSelectedWorkerName(e.target.value)}
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                    >
                      <option value="" className="bg-white text-[#3E2723]">請選擇您的姓名...</option>
                      {employees.filter(emp => emp.active !== false).map(emp => (
                        <option key={emp.id} value={emp.name} className="bg-white text-[#3E2723]">
                          {emp.name} ({emp.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">聯絡電話</label>
                    <input
                      type="tel"
                      required
                      placeholder="請輸入您的聯絡電話..."
                      value={workerPhoneInput}
                      onChange={(e) => setWorkerPhoneInput(e.target.value)}
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-center"
                    />
                  </div>

                  {workerVerifyError && (
                    <div className="text-xs text-red-650 font-bold text-center bg-red-50/50 py-2 rounded-lg border border-red-100 animate-pulse">
                      {workerVerifyError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-[#795548] hover:bg-[#5D4037] text-white font-semibold px-4 py-3 rounded-xl transition-all shadow-lg shadow-[#795548]/15 cursor-pointer text-center text-sm"
                  >
                    驗證並登入
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Name Input Banner Card */}
              <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 flex flex-col sm:flex-row items-center gap-4 justify-between shadow-sm">
                <div className="space-y-1 text-center sm:text-left">
                  <h2 className="text-lg font-bold text-[#3E2723] flex items-center justify-center sm:justify-start gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2E7D32]"></span>
                    員工身分已驗證
                  </h2>
                  <p className="text-xs text-[#6D4C41]">
                    您目前是以「<span className="font-extrabold text-[#3E2723]">{workerName}</span>」的身分填寫可用時間
                  </p>
                </div>
                <button
                  onClick={handleWorkerLogout}
                  className="w-full sm:w-auto bg-white hover:bg-red-50 border border-[#E5DCD5] text-[#5D4037] hover:text-red-650 font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer text-center text-sm shadow-sm"
                >
                  切換/變更身分
                </button>
              </div>

              {/* Worker Dashboard Split Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* Submission Form Card */}
                <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 lg:col-span-5 space-y-4 shadow-sm">
                  <div>
                    <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#2E7D32]"></span>
                      {isFullTime ? '登記不克排班日期' : '登記可用日期'} ({workerNextMonthStart.getFullYear()}年 {workerNextMonthStart.getMonth() + 1}月)
                    </h3>
                    <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
                      {isFullTime
                        ? '正式夥伴預設為全配合，請選取您下個月「無法上班/休假/請假」的日期。'
                        : '請選取您可以配合的日期，下一步即可設定地點與時間。'}
                    </p>
                  </div>

                  {!isWorkerEditable && (
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                      <span className="text-lg leading-none mt-0.5">⚠️</span>
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-amber-800">
                          {new Date().getDate() < startDay ? '尚未開放登記' : '登記已截止/鎖定'}
                        </p>
                        <p className="text-[11px] text-amber-700 leading-snug">
                          {new Date().getDate() < startDay
                            ? `目前尚未開放下月排班登記。開放登記時間為每月 ${startDay} 日至 ${deadlineDay} 日。`
                            : `目前已逾下月排班登記截止時間（每月 {deadlineDay} 日），且店長已開始為您確認/安排排班，因此目前已鎖定登記。如有特殊需求，請直接聯繫店長。`}
                        </p>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleAddAvailability} className="space-y-4 pt-2">
                    {/* Date Multi-selector */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider">
                          {isFullTime ? '選擇不克排班日期 (可複選)' : '選擇可用日期 (可複選)'}
                        </label>
                        <span className="text-[10px] text-[#795548] font-bold bg-[#8D6E63]/10 px-2 py-0.5 rounded font-mono">
                          已選 {availSelectedDates.length} 天
                        </span>
                      </div>

                      {/* Shortcuts */}
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        <button
                          type="button"
                          onClick={handleSelectAvailMonWedFri}
                          disabled={!isWorkerEditable}
                          className={`text-[10px] px-2.5 py-1 rounded bg-white border border-[#DAC0A3]/65 text-[#6D4C41] hover:border-[#8D6E63] hover:text-[#3E2723] hover:bg-[#FAF7F2] font-bold transition-all ${!isWorkerEditable ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400' : 'cursor-pointer'
                            }`}
                        >
                          一/三/五
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectAvailTueThu}
                          disabled={!isWorkerEditable}
                          className={`text-[10px] px-2.5 py-1 rounded bg-white border border-[#DAC0A3]/65 text-[#6D4C41] hover:border-[#8D6E63] hover:text-[#3E2723] hover:bg-[#FAF7F2] font-bold transition-all ${!isWorkerEditable ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400' : 'cursor-pointer'
                            }`}
                        >
                          二/四
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectAvailAllDays}
                          disabled={!isWorkerEditable}
                          className={`text-[10px] px-2.5 py-1 rounded bg-white border border-[#DAC0A3]/65 text-[#6D4C41] hover:border-[#8D6E63] hover:text-[#3E2723] hover:bg-[#FAF7F2] font-bold transition-all ${!isWorkerEditable ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400' : 'cursor-pointer'
                            }`}
                        >
                          全選 (整月)
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAvailAllSelected}
                          disabled={!isWorkerEditable}
                          className={`text-[10px] px-2.5 py-1 rounded bg-white border border-[#DAC0A3]/65 text-[#6D4C41]/70 hover:border-[#DAC0A3] font-bold transition-all ${!isWorkerEditable ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400' : 'cursor-pointer'
                            }`}
                        >
                          清除
                        </button>
                      </div>

                      {/* Monthly Calendar checklist grid */}
                      <div className="p-2 border border-[#DAC0A3]/50 rounded-xl bg-white/40">
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[#6D4C41]/80 font-bold mb-1">
                          <div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {workerCalendarGridDates.map(dateObj => {
                            const dateStr = formatDateString(dateObj);
                            const isSelected = availSelectedDates.includes(dateStr);
                            const isToday = dateStr === todayStr;
                            const isNextMonth = dateObj.getMonth() === workerNextMonthStart.getMonth() && dateObj.getFullYear() === workerNextMonthStart.getFullYear();

                            if (!isNextMonth) {
                              return <div key={dateStr} className="h-9" />;
                            }

                            return (
                              <button
                                key={dateStr}
                                type="button"
                                onClick={() => toggleAvailDateSelection(dateStr)}
                                disabled={!isWorkerEditable}
                                className={`relative py-1.5 px-0.5 rounded-lg border text-center transition-all text-[10px] font-mono font-bold flex flex-col items-center justify-center h-9 ${!isWorkerEditable
                                  ? 'bg-gray-100/70 border-gray-200/50 text-gray-400 cursor-not-allowed'
                                  : isSelected
                                    ? 'bg-[#8D6E63]/20 border-[#8D6E63] text-[#5D4037] shadow-sm cursor-pointer'
                                    : 'bg-white/70 border-[#DAC0A3]/40 text-[#6D4C41] hover:border-[#8D6E63]/60 hover:bg-white cursor-pointer'
                                  } ${isToday ? 'ring-1 ring-[#8D6E63]/40' : ''}`}
                              >
                                <span>{dateObj.getDate()}</span>
                                {isToday && (
                                  <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-[#8D6E63]"></span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Notes for Full-Time only */}
                    {isFullTime && (
                      <div>
                        <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">
                          請假/休假備註事項 (選填)
                        </label>
                        <textarea
                          placeholder="填寫不克排班原因或備註..."
                          value={availNotes}
                          onChange={(e) => setAvailNotes(e.target.value)}
                          disabled={!isWorkerEditable}
                          className={`w-full glass-input px-4 py-2.5 rounded-xl text-sm min-h-[70px] resize-none ${!isWorkerEditable ? 'opacity-50 cursor-not-allowed bg-gray-50/50 text-[#8D6E63]/60' : ''
                            }`}
                        />
                      </div>
                    )}

                    <button
                      type={isFullTime ? "submit" : "button"}
                      onClick={!isFullTime ? handleOpenWorkerAvailModal : undefined}
                      disabled={!isWorkerEditable}
                      className={`w-full font-bold py-3 rounded-xl transition-all text-center text-sm ${!isWorkerEditable
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                        : 'bg-[#795548] hover:bg-[#6D4C41] text-white shadow-lg shadow-[#795548]/15 cursor-pointer'
                        }`}
                    >
                      {isFullTime ? '送出不克排班日期' : '下一步：設定時間與地點 →'}
                    </button>
                  </form>

                </div>

                {/* Submitted Availabilities List */}
                <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 lg:col-span-7 space-y-4 shadow-sm">
                  <div>
                    <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#8D6E63]"></span>
                      {isFullTime ? '您登記的不克排班日期紀錄' : '您登記的可用時間紀錄'}
                    </h3>
                    <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
                      {isFullTime
                        ? `以下為「${workerName || '未填寫姓名'}」已登記提交的「不克排班/休假」日期。店長排班時會避開這些日期。`
                        : `以下為「${workerName || '未填寫姓名'}」已登記並提交的可用時段。店長可以在此時段安排您的排班。`}
                    </p>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {!workerName.trim() ? (
                      <div className="py-12 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-xl">
                        <p className="text-xs text-[#6D4C41]/80 font-medium">請在上方輸入姓名以檢信您的可用時間紀錄</p>
                      </div>
                    ) : getWorkerDisplayAvailabilities().length === 0 ? (
                      <div className="py-12 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-xl">
                        <p className="text-xs text-[#6D4C41]/80 font-medium">
                          {isFullTime ? '尚無登記任何不克排班日期' : '尚無登記任何可用時間'}
                        </p>
                      </div>
                    ) : (
                      getWorkerDisplayAvailabilities()
                        .sort((a, b) => {
                          const dateCompare = b.date.localeCompare(a.date);
                          if (dateCompare !== 0) return dateCompare;
                          return compareTimeStrings(a.startTime, b.startTime);
                        })
                        .map(avail => {
                          const dateObj = new Date(avail.date);
                          const dayOfWeekIndex = dateObj.getDay();
                          const mappedDayIndex = dayOfWeekIndex === 0 ? 7 : dayOfWeekIndex;
                          const dayInfo = DAYS_OF_WEEK.find(d => d.value === mappedDayIndex) || DAYS_OF_WEEK[0];
                          const isOffDay = avail.startTime === '00:00' && avail.endTime === '00:00';

                          if (isOffDay) {
                            return (
                              <div
                                key={avail.id}
                                className="glass-card p-4 rounded-xl border border-red-200/60 bg-red-50/20 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2 border-b border-red-200/40 pb-1.5">
                                  <span className="text-sm font-extrabold text-red-800">
                                    ❌ {avail.date} ({dayInfo.name})
                                  </span>
                                  {isWorkerEditable && !avail.confirmed && (
                                    <div className="flex gap-1.5">
                                      {!isFullTime && (
                                        <button
                                          onClick={() => handleEditAvailability(avail)}
                                          className="p-1 rounded-lg bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-[#3E2723] transition-colors cursor-pointer"
                                          title="編輯此登記"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                          </svg>
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => handleDeleteAvailability(avail.id, e)}
                                        className="p-1 rounded-lg bg-white hover:bg-red-50 border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-red-650 transition-colors cursor-pointer"
                                        title="刪除此登記"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 font-bold w-fit">
                                    不克排班 (休假)
                                  </span>
                                  {avail.notes && (
                                    <p className="text-xs text-red-800/80 font-medium">
                                      📝 備註：{getCleanNote(avail.notes) || avail.notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={avail.id}
                              className="glass-card p-4 rounded-xl border border-[#DAC0A3]/45 space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-[#DAC0A3]/30 pb-1.5">
                                <span className="text-sm font-extrabold text-[#3E2723]">
                                  {avail.date} ({dayInfo.name})
                                </span>
                                {isWorkerEditable && !avail.confirmed && (
                                  <div className="flex gap-1.5">
                                    {!isFullTime && (
                                      <button
                                        onClick={() => handleEditAvailability(avail)}
                                        className="p-1 rounded-lg bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-[#3E2723] transition-colors cursor-pointer"
                                        title="編輯此登記"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => handleDeleteAvailability(avail.id, e)}
                                      className="p-1 rounded-lg bg-white hover:bg-red-50 border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-red-650 transition-colors cursor-pointer"
                                      title="刪除此登記"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#F5EBE6] text-[#5D4037] border border-[#DAC0A3]/40 font-bold w-fit">
                                    📍 {avail.workplace}
                                  </span>
                                  {avail.confirmed && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-[#1B5E20] border border-[#2E7D32]/25 font-extrabold w-fit flex items-center gap-0.5 animate-scale-in">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32]"></span>
                                      已確認排班
                                    </span>
                                  )}
                                  <span className="hidden">
                                  </span>
                                  <span className="text-xs text-[#6D4C41]/90 font-medium flex items-center gap-1 font-mono">
                                    🕒 可配合時間：{avail.startTime} - {avail.endTime}
                                  </span>
                                </div>
                                {avail.notes && (
                                  <p className="text-xs text-[#5D4037] bg-white/50 px-2.5 py-1.5 rounded border border-[#DAC0A3]/40 border-dashed w-fit text-left">
                                    📝 備註：{avail.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>

              {/* Team Availability Calendar — all workers' registered times for next month */}
              {(() => {
                const nextMonthStr = formatDateString(workerNextMonthStart).substring(0, 7);
                const teamAvails = availabilities.filter(a =>
                  a.date.startsWith(nextMonthStr) &&
                  !(a.startTime === '00:00' && a.endTime === '00:00') &&
                  a.confirmed !== true
                );
                const teamCalendarDates = workerCalendarGridDates;

                return (
                  <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-4 bg-white/40 hidden sm:block">
                    <div className="border-b border-[#DAC0A3]/35 pb-3">
                      <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#8D6E63]"></span>
                        團隊可用時段總覽 ({workerNextMonthStart.getFullYear()}年 {workerNextMonthStart.getMonth() + 1}月)
                      </h3>
                      <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
                        以下為所有同仁在下個月已登記的可用時段，供參考排班協調。
                      </p>
                    </div>

                    {/* Calendar grid */}
                    <div className="border border-[#DAC0A3]/50 rounded-2xl overflow-hidden bg-white/70">
                      {/* Day headers */}
                      <div className="grid grid-cols-7 border-b border-[#DAC0A3]/50 bg-[#F5EBE6]/60">
                        {DAYS_OF_WEEK.map(day => (
                          <div key={day.value} className="py-2 text-center text-xs font-bold text-[#6D4C41]">
                            {day.name}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-px bg-[#EADBC8]/60">
                        {teamCalendarDates.map(dateObj => {
                          const dateStr = formatDateString(dateObj);
                          const isToday = dateStr === todayStr;
                          const isInMonth = dateObj.getMonth() === workerNextMonthStart.getMonth() &&
                            dateObj.getFullYear() === workerNextMonthStart.getFullYear();

                          // All workers available on this date
                          const dayAvails = teamAvails
                            .filter(a => a.date === dateStr)
                            .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

                          const isFirstOfMonth = dateObj.getDate() === 1;
                          const dateLabel = isFirstOfMonth ? `${dateObj.getMonth() + 1}/1` : dateObj.getDate().toString();

                          return (
                            <div
                              key={dateStr}
                              className={`min-h-[90px] p-1.5 flex flex-col gap-0.5 relative ${isToday ? 'bg-[#FAF7F2]'
                                : isInMonth ? 'bg-white/95'
                                  : 'bg-[#FAF7F2]/40 opacity-40'
                                }`}
                            >
                              {/* Date label */}
                              <span className={`text-[11px] font-bold font-mono px-1 py-0.5 rounded-full w-fit mb-0.5 ${isToday ? 'bg-[#795548] text-white' : 'text-[#3E2723]'
                                }`}>
                                {dateLabel}
                              </span>

                              {/* Worker chips */}
                              {isInMonth && dayAvails.map(avail => {
                                const isMe = avail.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase();
                                return (
                                  <div
                                    key={avail.id}
                                    className={`text-[11px] leading-tight px-1.5 py-0.5 rounded font-bold truncate ${isMe
                                      ? 'bg-[#795548] text-white'
                                      : 'bg-[#8D6E63]/15 text-[#5D4037]'
                                      }`}
                                    title={`${avail.employeeName}: ${avail.startTime}–${avail.endTime} @ ${avail.workplace}`}
                                  >
                                    {avail.employeeName.split('').slice(0, 3).join('')}
                                    {' '}
                                    <span className="opacity-80 font-mono text-[10px]">
                                      {avail.startTime.substring(0, 5)}-{avail.endTime.substring(0, 5)}
                                    </span>
                                  </div>
                                );
                              })}

                              {/* "empty" indicator */}
                              {isInMonth && dayAvails.length === 0 && (
                                <span className="text-[9px] text-[#8D6E63]/40 mt-auto">-</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-[#795548]"></span>
                        <span className="text-[10px] text-[#6D4C41] font-medium">您自己的登記</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-[#8D6E63]/15 border border-[#8D6E63]/30"></span>
                        <span className="text-[10px] text-[#6D4C41] font-medium">其他同仁的登記</span>
                      </div>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[10px] text-[#8D6E63] font-medium">顯示格式：姓名 + 時間區間 (例: 09:00-17:00)</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Confirmed Schedule Calendar Card */}

              <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-4 bg-white/40">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#DAC0A3]/35 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
                      您的已確認班表 (個人行事曆)
                    </h3>
                    <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
                      以下為您在該月份已被主管確認並安排的排班時段。
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date();
                        setWorkerCalendarMonth(new Date(today.getFullYear(), today.getMonth() + 1, 1));
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#FAF7F2] text-[#5D4037] border border-[#DAC0A3]/65 text-xs font-semibold transition-all cursor-pointer"
                    >
                      預設
                    </button>
                    <div className="flex items-center rounded-lg border border-[#DAC0A3]/60 bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          const prev = new Date(workerCalendarMonth);
                          prev.setMonth(prev.getMonth() - 1);
                          setWorkerCalendarMonth(prev);
                        }}
                        className="p-1.5 hover:bg-[#FAF7F2] text-[#6D4C41] border-r border-[#DAC0A3]/60 transition-colors cursor-pointer"
                        title="前一個月"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Date(workerCalendarMonth);
                          next.setMonth(next.getMonth() + 1);
                          setWorkerCalendarMonth(next);
                        }}
                        className="p-1.5 hover:bg-[#FAF7F2] text-[#6D4C41] transition-colors cursor-pointer"
                        title="後一個月"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    <span className="text-sm font-bold text-[#3E2723] ml-1 select-none">
                      {workerCalendarMonth.getFullYear()}年 {workerCalendarMonth.getMonth() + 1}月
                    </span>
                  </div>
                </div>

                {/* Calendar monthly grid */}
                <div className="border border-[#DAC0A3]/50 rounded-2xl overflow-hidden bg-white/70">
                  <div className="grid grid-cols-7 border-b border-[#DAC0A3]/50 bg-[#F5EBE6]/60">
                    {DAYS_OF_WEEK.map(day => (
                      <div key={day.value} className="py-2 text-center text-xs font-bold text-[#6D4C41]">
                        {day.name}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-px bg-[#EADBC8]/60">
                    {getMonthGridDates(workerCalendarMonth).map((dateObj) => {
                      const dateStr = formatDateString(dateObj);
                      const isToday = dateStr === todayStr;
                      const isCurrentMonth = dateObj.getMonth() === workerCalendarMonth.getMonth();

                      // Filter confirmed schedules for this employee on this date
                      const daySchedules = schedules.filter(
                        s => s.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase() && s.date === dateStr
                      ).sort((a, b) => compareTimeStrings(a.startTime, b.startTime));

                      const isFirstOfMonth = dateObj.getDate() === 1;
                      const dateLabel = isFirstOfMonth ? `${dateObj.getMonth() + 1}/1` : dateObj.getDate().toString();

                      return (
                        <div
                          key={dateStr}
                          className={`min-h-[85px] p-1.5 flex flex-col justify-between select-none relative ${isToday
                            ? 'bg-[#FAF7F2]'
                            : isCurrentMonth
                              ? 'bg-white/95'
                              : 'bg-[#FAF7F2]/40 text-[#8D6E63]/40 opacity-40'
                            }`}
                        >
                          {/* Date Label */}
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-[11px] font-bold font-mono px-1.5 py-0.5 rounded-full ${isToday
                                ? 'bg-[#795548] text-white shadow-sm'
                                : 'text-[#3E2723]'
                                }`}
                            >
                              {dateLabel}
                            </span>
                          </div>

                          {/* Shifts */}
                          <div className="flex-1 space-y-1 overflow-y-auto">
                            {daySchedules.map(schedule => {
                              const theme = getScheduleTheme(schedule);
                              const mNote = schedule.managerNotes !== undefined ? schedule.managerNotes : getManagerNote(schedule);
                              const wNote = schedule.workerNotes !== undefined ? schedule.workerNotes : getWorkerNote(schedule);

                              let displayNote = '';
                              if (wNote && mNote) {
                                displayNote = `同仁: ${wNote} | 主管: ${mNote}`;
                              } else if (wNote) {
                                displayNote = `同仁: ${wNote}`;
                              } else if (mNote) {
                                displayNote = `主管: ${mNote}`;
                              }

                              return (
                                <div
                                  key={schedule.id}
                                  className={`text-[9px] py-1 px-1.5 rounded border font-semibold flex flex-col gap-0.5 ${theme.bg} ${theme.border} ${theme.text}`}
                                  title={displayNote ? `📝 ${displayNote}` : undefined}
                                >
                                  <div className="font-mono font-bold leading-tight">{schedule.startTime} - {schedule.endTime}</div>
                                  {displayNote && (
                                    <div className="opacity-95 italic truncate" title={displayNote}>({displayNote})</div>
                                  )}
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

              {/* Subtle Manager Login link at the bottom of the Worker view */}
              <div className="flex justify-center pt-8 pb-4">
                <a
                  href="#/manager"
                  className="text-[10px] text-[#6D4C41]/35 hover:text-[#795548] font-bold flex items-center gap-1 transition-all select-none"
                >
                  🔒 管理登入
                </a>
              </div>
            </div>
          )
        )}

        {/* MANAGER ROLE VIEW */}
        {activeRole === 'manager' && (
          !isAuthenticated ? (
            /* Cozy Coffee-Themed Passcode Login Screen */
            <div className="max-w-md mx-auto my-12 animate-scale-in">
              <div className="glass-panel p-8 rounded-3xl border border-[#DAC0A3]/50 shadow-2xl flex flex-col space-y-6">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#DAC0A3]/50 text-3xl shadow-sm">
                    ☕
                  </div>
                  <h2 className="text-xl font-black text-[#3E2723] pt-2">
                    精品咖啡館 ☕ 主管登入
                  </h2>
                  <p className="text-xs text-[#6D4C41] font-medium">
                    請輸入管理密碼以進入排班規劃中心
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">管理密碼</label>
                    <input
                      type="password"
                      required
                      placeholder="請輸入密碼..."
                      value={passcodeInput}
                      onChange={(e) => setPasscodeInput(e.target.value)}
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm font-mono tracking-widest text-center"
                      autoFocus
                    />
                  </div>

                  {loginError && (
                    <div className="text-xs text-red-650 font-bold text-center bg-red-50/50 py-2 rounded-lg border border-red-100 animate-pulse">
                      {loginError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = '#/worker';
                      }}
                      className="flex-1 bg-white hover:bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] font-semibold px-4 py-3 rounded-xl transition-all cursor-pointer text-center text-sm"
                    >
                      返回員工頁面
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-[#795548] hover:bg-[#5D4037] text-white font-semibold px-4 py-3 rounded-xl transition-all shadow-lg shadow-[#795548]/15 cursor-pointer text-center text-sm"
                    >
                      進入系統
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="space-y-6">

              {/* Calendar Toolbar */}
              <section className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/70 p-4 rounded-xl border border-[#DAC0A3]/50 shadow-sm">
                {/* Left: Month Nav */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGoToToday}
                    className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-[#FAF7F2] text-[#5D4037] border border-[#DAC0A3]/60 hover:border-[#8D6E63] text-xs font-semibold transition-all cursor-pointer"
                  >
                    今天
                  </button>
                  <div className="flex items-center rounded-lg border border-[#DAC0A3]/60 bg-white overflow-hidden">
                    <button
                      onClick={handlePrevMonth}
                      className="p-1.5 hover:bg-[#FAF7F2] text-[#6D4C41] border-r border-[#DAC0A3]/60 transition-colors cursor-pointer"
                      title="前一個月"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={handleNextMonth}
                      className="p-1.5 hover:bg-[#FAF7F2] text-[#6D4C41] transition-colors cursor-pointer"
                      title="後一個月"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  {/* Displaying current Month/Year */}
                  <h2 className="text-base md:text-lg font-bold text-[#3E2723] ml-2">
                    {currentMonthStart.getFullYear()}年 {currentMonthStart.getMonth() + 1}月
                  </h2>

                  {/* View Switcher Toggle */}
                  <div className="flex items-center gap-1 bg-[#FAF7F2] border border-[#DAC0A3]/60 p-1 rounded-xl ml-2">
                    <button
                      onClick={() => setManagerViewMode('calendar')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'calendar'
                        ? 'bg-[#795548] text-white shadow-sm'
                        : 'text-[#8D6E63] hover:text-[#3E2723]'
                        }`}
                    >
                      日曆檢視
                    </button>
                    <button
                      onClick={() => setManagerViewMode('grid')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'grid'
                        ? 'bg-[#795548] text-white shadow-sm'
                        : 'text-[#8D6E63] hover:text-[#3E2723]'
                        }`}
                    >
                      網格總覽
                    </button>
                    <button
                      onClick={() => setManagerViewMode('employees')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'employees'
                        ? 'bg-[#795548] text-white shadow-sm'
                        : 'text-[#8D6E63] hover:text-[#3E2723]'
                        }`}
                    >
                      員工管理
                    </button>
                    <button
                      onClick={() => setManagerViewMode('calculation')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'calculation'
                        ? 'bg-[#795548] text-white shadow-sm'
                        : 'text-[#8D6E63] hover:text-[#3E2723]'
                        }`}
                    >
                      營業額計算
                    </button>
                    <button
                      onClick={() => setManagerViewMode('system')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'system'
                        ? 'bg-[#795548] text-white shadow-sm'
                        : 'text-[#8D6E63] hover:text-[#3E2723]'
                        }`}
                    >
                      系統管理
                    </button>
                  </div>
                </div>

                {/* Right: Quick monthly stats info */}
                <div className="flex items-center flex-wrap gap-3">
                  <div className="flex items-center gap-4 text-[11px] md:text-xs text-[#6D4C41] bg-white/85 px-3 md:px-4 py-2 rounded-lg border border-[#DAC0A3]/55 shadow-sm">
                    <div>本月班次：<span className="font-semibold text-[#3E2723] font-mono">{totalShifts}</span> 次</div>
                    <div className="w-px h-3 bg-[#DAC0A3]/45"></div>
                    <div>本月工時：<span className="font-semibold text-[#795548] font-mono">{Math.round(totalHours * 10) / 10}</span> 小時</div>
                    <div className="w-px h-3 bg-[#DAC0A3]/45"></div>
                    <div>排班人數：<span className="font-semibold text-[#E65100] font-mono">{totalEmployees}</span> 人</div>
                  </div>
                </div>
              </section>

              {/* Conditional Main Grid View */}
              {managerViewMode === 'employees' ? (
                /* Employee CRUD Panel */
                <div className="space-y-6 animate-fade-in">
                  {/* Employee Management Header Card */}
                  <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 flex flex-col sm:flex-row items-center gap-4 justify-between shadow-sm">
                    <div className="space-y-1 text-center sm:text-left">
                      <h2 className="text-lg font-bold text-[#3E2723] flex items-center justify-center sm:justify-start gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
                        員工清單管理
                      </h2>
                      <p className="text-xs text-[#6D4C41]">
                        在此管理店內夥伴的培訓進度與在職狀態。培訓完成餐吧、POS機、後吧、收班、開早後將自動晉升為正式夥伴。
                      </p>
                    </div>
                    <button
                      onClick={() => handleOpenEmployeeModal()}
                      className="w-full sm:w-auto bg-[#795548] hover:bg-[#6D4C41] text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-[#795548]/10 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1.5 cursor-pointer text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      新增員工資料
                    </button>
                  </div>

                  {/* Filters Row */}
                  <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white/50 p-4 rounded-xl border border-[#DAC0A3]/40 shadow-xs">
                    {/* Search */}
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="搜尋員工姓名..."
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                        className="w-full glass-input pl-10 pr-4 py-2 rounded-xl text-sm"
                      />
                      <svg className="w-4 h-4 text-[#8D6E63] absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Active Status filter */}
                      <div className="flex items-center gap-1 bg-[#FAF7F2] border border-[#DAC0A3]/50 p-1 rounded-xl">
                        <button
                          onClick={() => setEmpActiveFilter('all')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empActiveFilter === 'all'
                            ? 'bg-[#795548] text-white shadow-xs'
                            : 'text-[#8D6E63] hover:text-[#3E2723]'
                            }`}
                        >
                          全部 ({employees.length})
                        </button>
                        <button
                          onClick={() => setEmpActiveFilter('active')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empActiveFilter === 'active'
                            ? 'bg-[#795548] text-white shadow-xs'
                            : 'text-[#8D6E63] hover:text-[#3E2723]'
                            }`}
                        >
                          在職 ({employees.filter(e => e.active !== false).length})
                        </button>
                        <button
                          onClick={() => setEmpActiveFilter('inactive')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empActiveFilter === 'inactive'
                            ? 'bg-[#795548] text-white shadow-xs'
                            : 'text-[#8D6E63] hover:text-[#3E2723]'
                            }`}
                        >
                          離職 ({employees.filter(e => e.active === false).length})
                        </button>
                      </div>

                      {/* Employment Status filter */}
                      <div className="flex items-center gap-1 bg-[#FAF7F2] border border-[#DAC0A3]/50 p-1 rounded-xl">
                        <button
                          onClick={() => setEmpStatusFilter('all')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empStatusFilter === 'all'
                            ? 'bg-[#795548] text-white shadow-xs'
                            : 'text-[#8D6E63] hover:text-[#3E2723]'
                            }`}
                        >
                          身分: 全部
                        </button>
                        <button
                          onClick={() => setEmpStatusFilter('正式夥伴')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empStatusFilter === '正式夥伴'
                            ? 'bg-[#795548] text-white shadow-xs'
                            : 'text-[#8D6E63] hover:text-[#3E2723]'
                            }`}
                        >
                          正式夥伴
                        </button>
                        <button
                          onClick={() => setEmpStatusFilter('兼職夥伴')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empStatusFilter === '兼職夥伴'
                            ? 'bg-[#795548] text-white shadow-xs'
                            : 'text-[#8D6E63] hover:text-[#3E2723]'
                            }`}
                        >
                          兼職夥伴
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Employees Grid */}
                  {employees.filter(e => {
                    const matchesSearch = e.name.toLowerCase().includes(empSearch.toLowerCase());
                    const matchesStatus = empStatusFilter === 'all' || e.status === empStatusFilter;
                    const matchesActive = empActiveFilter === 'all' ||
                      (empActiveFilter === 'active' && e.active !== false) ||
                      (empActiveFilter === 'inactive' && e.active === false);
                    return matchesSearch && matchesStatus && matchesActive;
                  }).length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-2xl bg-white/40">
                      <p className="text-sm text-[#6D4C41] font-semibold">沒有符合條件的員工紀錄</p>
                      <p className="text-xs text-[#8D6E63] mt-1">請點擊「新增員工資料」按鈕來建立夥伴名單。</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {employees
                        .filter(e => {
                          const matchesSearch = e.name.toLowerCase().includes(empSearch.toLowerCase());
                          const matchesStatus = empStatusFilter === 'all' || e.status === empStatusFilter;
                          const matchesActive = empActiveFilter === 'all' ||
                            (empActiveFilter === 'active' && e.active !== false) ||
                            (empActiveFilter === 'inactive' && e.active === false);
                          return matchesSearch && matchesStatus && matchesActive;
                        })
                        .map(emp => {
                          const isTraining = emp.trainingPosition || (emp.trainedPositions && emp.trainedPositions.length < 3);
                          const trainedCount = emp.trainedPositions ? emp.trainedPositions.length : 0;
                          const progressPercent = Math.round((trainedCount / 3) * 100);

                          return (
                            <div
                              key={emp.id}
                              className={`glass-panel p-5 rounded-2xl border border-[#DAC0A3]/50 hover:border-[#8D6E63]/80 hover:shadow-md transition-all flex flex-col justify-between gap-4 relative overflow-hidden group/card ${emp.active === false ? 'opacity-65 bg-gray-50/20 grayscale-[20%]' : ''}`}
                            >
                              <div className="space-y-3">
                                {/* Header */}
                                <div className="flex items-start justify-between">
                                  <div className="space-y-1">
                                    <h3 className="text-base font-extrabold text-[#3E2723] flex items-center gap-1.5">
                                      👤 {emp.name}
                                    </h3>
                                    <div className="flex flex-wrap gap-1.5 items-center">
                                      <span className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${emp.status === '正式夥伴'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${emp.status === '正式夥伴' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></span>
                                        {emp.status}
                                      </span>
                                      {emp.isNewcomer === true && (
                                        <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold border bg-pink-50 text-pink-700 border-pink-200">
                                          <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                                          新進人員
                                        </span>
                                      )}
                                      {emp.active === false && (
                                        <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold border bg-red-50 text-red-700 border-red-200">
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                          已離職
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-[#6D4C41] font-semibold flex items-center gap-1 mt-1.5">
                                      <span className="opacity-80">📞</span>
                                      <span className="font-mono">{emp.phone || '無電話資料'}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 opacity-60 group-hover/card:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleOpenEmployeeModal(emp)}
                                      className="p-1.5 rounded-lg bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-[#3E2723] transition-colors cursor-pointer"
                                      title="編輯資料"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteEmployee(emp.id)}
                                      className="p-1.5 rounded-lg bg-white hover:bg-red-50 border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-red-650 transition-colors cursor-pointer"
                                      title="刪除夥伴"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>

                                {/* Progress bar */}
                                {isTraining && (
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[10px] font-bold text-[#6D4C41]">
                                      <span>合格進度</span>
                                      <span>{trainedCount}/3 ({progressPercent}%)</span>
                                    </div>
                                    <div className="w-full bg-[#EADBC8]/40 h-2 rounded-full overflow-hidden">
                                      <div
                                        className="bg-gradient-to-r from-amber-400 to-[#795548] h-full rounded-full transition-all duration-500"
                                        style={{ width: `${progressPercent}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                )}

                                {/* Position details */}
                                <div className="space-y-2 pt-1 border-t border-[#DAC0A3]/25">
                                  {isTraining && emp.trainingPosition && (
                                    <div>
                                      <span className="text-[10px] font-bold text-[#8D6E63] block uppercase tracking-wider mb-1">正在培訓崗位</span>
                                      <span className="inline-block text-xs font-extrabold px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[#B7791F]">
                                        📖 {emp.trainingPosition}
                                      </span>
                                    </div>
                                  )}

                                  <div>
                                    <span className="text-[10px] font-bold text-[#8D6E63] block uppercase tracking-wider mb-1">已受訓合格崗位</span>
                                    {emp.trainedPositions && emp.trainedPositions.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {emp.trainedPositions.map(pos => (
                                          <span key={pos} className="inline-block text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-emerald-600/10 border border-emerald-600/20 text-[#2E7D32]">
                                            ✅ {pos}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-[#6D4C41]/60 italic font-medium">尚未受訓合格任何崗位</span>
                                    )}
                                  </div>

                                  {emp.certificates && emp.certificates.length > 0 && (
                                    <div className="pt-2 border-t border-[#DAC0A3]/25">
                                      <span className="text-[10px] font-bold text-[#8D6E63] block uppercase tracking-wider mb-1">持有證照</span>
                                      <div className="flex flex-wrap gap-1">
                                        {emp.certificates.map(cert => {
                                          const isFbi = cert === 'FBI';
                                          return (
                                            <span
                                              key={cert}
                                              className={`inline-block text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border ${isFbi
                                                ? 'bg-blue-50 text-blue-750 border-blue-200'
                                                : 'bg-amber-50 text-amber-850 border-amber-200'
                                                }`}
                                            >
                                              {isFbi ? '🛡️ FBI' : '☕ 黃金吧檯手'}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              ) : managerViewMode === 'calculation' ? (
                /* Revenue-Based Staffing Calculation Panel */
                <div className="space-y-6 animate-fade-in bg-white/40 p-6 rounded-2xl border border-[#DAC0A3]/50">
                  {/* Header & Rules Reference Card */}
                  <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
                    <div className="space-y-2 flex-1">
                      <h2 className="text-lg font-bold text-[#3E2723] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
                        營業額排班需求計算與設定
                      </h2>
                      <p className="text-xs text-[#6D4C41]">
                        依據各時段的月營業額數據，自動估算日平均營業額及對應的建議排班人數。此人數將可作為一鍵套用至 <strong>db-global.json 預設排班目標人數</strong>（無日期限制的基礎人數需求）的參考基準。
                      </p>

                      {/* Rules display for reference */}
                      <div className="mt-4 p-4 rounded-xl border border-[#DAC0A3]/45 bg-[#FAF7F2] space-y-1.5 shadow-xs">
                        <h4 className="text-xs font-extrabold text-[#5D4037] uppercase tracking-wider mb-1">📋 營業額排班人數對照規則：</h4>
                        <ul className="text-[11px] text-[#6D4C41] space-y-1 font-medium list-disc pl-4.5">
                          <li>日平均營業額 <strong>1,500 元以下</strong>：配置 <span className="font-extrabold text-[#3E2723]">2 名</span> 員工</li>
                          <li>日平均營業額 <strong>1,501 - 2,500 元</strong>：配置 <span className="font-extrabold text-[#3E2723]">3 名</span> 員工</li>
                          <li>日平均營業額 <strong>2,501 - 3,500 元</strong>：配置 <span className="font-extrabold text-[#3E2723]">4 名</span> 員工</li>
                          <li>日平均營業額 <strong>3,500 元以上</strong>：配置 <span className="font-extrabold text-[#3E2723]">5 名</span> 員工 (每增加 1,000 元再追加 1 人)</li>
                        </ul>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 w-full md:w-auto shrink-0 md:pt-4">
                      <button
                        onClick={handleApplyRevenuesToGlobalTargets}
                        className="w-full md:w-56 bg-[#795548] hover:bg-[#6D4C41] text-white font-bold px-5 py-3 rounded-xl transition-all shadow-md shadow-[#795548]/10 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                      >
                        💾 套用至預設排班目標 (db-global)
                      </button>
                      <button
                        onClick={handleResetRevenues}
                        className="w-full md:w-56 bg-white hover:bg-red-50 border border-[#E5DCD5] text-[#5D4037] hover:text-red-650 font-bold px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                      >
                        🔄 重設營業額數據
                      </button>
                    </div>
                  </div>

                  {/* Hourly spreadsheet table */}
                  <div className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/50 shadow-sm bg-white/70 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#DAC0A3]/50 text-xs font-bold text-[#6D4C41]/80">
                            <th className="pb-3 pl-2 w-1/4">時段</th>
                            <th className="pb-3 w-1/4">月營業額輸入 (NTD)</th>
                            <th className="pb-3 w-1/6">日平均營業額 (/30)</th>
                            <th className="pb-3 w-1/6">建議配置人數</th>
                            <th className="pb-3 pr-2 w-1/6">目前預設人數 (db-global)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#DAC0A3]/25 text-sm text-[#3E2723]">
                          {Array.from({ length: 14 }, (_, i) => i + 6).map(hour => {
                            const monthlyVal = monthlyRevenues[hour] || 0;
                            const dailyAvg = Number((monthlyVal / 30).toFixed(1));

                            // Recommended staff count based on average income
                            let recommendedStaff = 2;
                            if (dailyAvg > 1500) {
                              if (dailyAvg <= 2500) {
                                recommendedStaff = 3;
                              } else if (dailyAvg <= 3500) {
                                recommendedStaff = 4;
                              } else {
                                recommendedStaff = Math.min(8, Math.floor((dailyAvg - 2501) / 1000) + 4);
                              }
                            }

                            // Current default target count in global database (no specific date)
                            const currentDefaultTarget = staffingTargets.find(t => t.hour === hour && !t.date)?.targetCount ?? 2;

                            return (
                              <tr key={hour} className="hover:bg-[#FAF7F2]/30 transition-colors">
                                <td className="py-3.5 pl-2 font-mono font-bold text-xs text-[#6D4C41]">
                                  ⏰ {hour.toString().padStart(2, '0')}:00 - {(hour + 1).toString().padStart(2, '0')}:00
                                </td>
                                <td className="py-2">
                                  <div className="relative w-44">
                                    <span className="absolute left-3.5 top-2 text-xs text-[#8D6E63] font-mono">$</span>
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="請輸入月營業額"
                                      value={monthlyVal || ''}
                                      onChange={(e) => {
                                        const val = Math.max(0, parseInt(e.target.value) || 0);
                                        const next = { ...monthlyRevenues, [hour]: val };
                                        setMonthlyRevenues(next);
                                        updateMonthlyRevenues(next);
                                      }}
                                      className="w-full glass-input pl-7 pr-3 py-1.5 rounded-xl text-xs font-mono text-left focus:border-[#795548]"
                                    />
                                  </div>
                                </td>
                                <td className="py-3.5 font-mono text-xs font-extrabold text-[#795548]">
                                  ${dailyAvg.toLocaleString()}
                                </td>
                                <td className="py-2.5">
                                  <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1 rounded-full border ${recommendedStaff === 2
                                    ? 'bg-blue-50 text-blue-750 border-blue-200'
                                    : recommendedStaff === 3
                                      ? 'bg-amber-50 text-amber-850 border-amber-200'
                                      : 'bg-emerald-50 text-emerald-750 border-emerald-200'
                                    }`}>
                                    👥 {recommendedStaff} 人
                                  </span>
                                </td>
                                <td className="py-3.5 pr-2 font-mono text-xs font-extrabold text-[#8D6E63]/75 pl-3">
                                  {currentDefaultTarget} 人
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : managerViewMode === 'system' ? (
                /* System Management Panel */
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

                      {/* Action buttons */}
                      <div className="flex border-t border-[#E5DCD5] pt-4">
                        <button
                          onClick={async () => {
                            try {
                              if (startDay > deadlineDay) {
                                alert("警告：開放日期不可晚於截止日期！");
                                return;
                              }
                              await updateOperatingStartTime(operatingStartTime);
                              await updateOperatingEndTime(operatingEndTime);
                              await updateShiftMorningStart(shiftMorningStart);
                              await updateShiftMorningEnd(shiftMorningEnd);
                              await updateShiftEveningStart(shiftEveningStart);
                              await updateShiftEveningEnd(shiftEveningEnd);
                              await updateShiftPresets(shiftPresets);
                              await updateStartDay(startDay);
                              await updateDeadlineDay(deadlineDay);
                              alert("已成功更新門市營業時間與排班限制設定！");
                            } catch (err) {
                              console.error("Failed to update settings:", err);
                              alert("更新失敗，請稍後再試。");
                            }
                          }}
                          className="ml-auto bg-[#795548] hover:bg-[#6D4C41] text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md text-xs cursor-pointer"
                        >
                          儲存設定
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Export Panel */}
                  <div className="glass-panel p-4 rounded-xl border border-[#DAC0A3]/50 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in bg-white/60 mb-6">
                    <div className="flex items-center gap-2 text-sm text-[#5D4037] font-semibold">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>排班表匯出 Excel</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-xs md:text-sm text-[#6D4C41]">
                        <span>匯出區間：</span>
                        <input
                          type="date"
                          value={exportStartDate}
                          onChange={(e) => setExportStartDate(e.target.value)}
                          className="bg-white border border-[#DAC0A3]/50 rounded px-2.5 py-1.5 outline-none font-mono text-xs text-[#3E2723] focus:border-[#795548]"
                        />
                        <span>至</span>
                        <input
                          type="date"
                          value={exportEndDate}
                          onChange={(e) => setExportEndDate(e.target.value)}
                          className="bg-white border border-[#DAC0A3]/50 rounded px-2.5 py-1.5 outline-none font-mono text-xs text-[#3E2723] focus:border-[#795548]"
                        />
                      </div>
                      <button
                        onClick={handleExportToExcel}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4.5 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-1.5 cursor-pointer border border-emerald-600/30"
                        title="匯出指定日期範圍的排班表至 Excel"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        匯出 Excel
                      </button>
                      <button
                        onClick={handleUploadToStorage}
                        disabled={isUploadingExcel}
                        className={`font-bold text-xs px-4.5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer border ${
                          isUploadingExcel
                            ? 'bg-amber-600/50 border-amber-600/20 text-white cursor-not-allowed'
                            : uploadExcelStatus === 'success'
                              ? 'bg-indigo-650 hover:bg-indigo-700 border-indigo-650/30 text-white shadow-indigo-600/15'
                              : 'bg-indigo-600 hover:bg-indigo-700 border-indigo-600/30 text-white hover:shadow-indigo-600/20 hover:-translate-y-0.5 active:translate-y-0'
                        }`}
                        title="備份目前日期範圍的排班表至您的 Google 雲端硬碟 (Google Drive)"
                      >
                        {isUploadingExcel ? (
                          <>
                            <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            備份中...
                          </>
                        ) : uploadExcelStatus === 'success' ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            已備份 ☁️
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                            </svg>
                            備份至雲端硬碟
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Color Code Legend */}
                  <div className="glass-panel p-4 rounded-xl border border-[#DAC0A3]/50 bg-white/40 mb-6 shadow-xs animate-fade-in">
                    <div className="flex items-center gap-1.5 text-xs text-[#5D4037] font-extrabold mb-3">
                      <svg className="w-4.5 h-4.5 text-[#795548]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>班表與登記狀態圖例 (Color Legend)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Available */}
                      <div className="flex items-center gap-3 bg-white/30 p-2.5 rounded-xl border border-[#DAC0A3]/20">
                        <div className="w-20 py-1.5 text-[10px] text-center font-bold border border-dashed border-emerald-600/30 bg-[#E8F5E9]/50 text-[#2E7D32] rounded-md font-mono shrink-0">
                          08:30-17:30
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-extrabold text-[#3E2723]">可用時間登記</span>
                          <span className="text-[10px] text-[#6D4C41]">兼職夥伴登記時段，點擊可直接排班</span>
                        </div>
                      </div>

                      {/* Confirmed */}
                      <div className="flex items-center gap-3 bg-white/30 p-2.5 rounded-xl border border-[#DAC0A3]/20">
                        <div className="w-20 py-1.5 text-[10px] text-center font-bold border border-[#4E342E]/25 bg-[#5D4037]/8 text-[#3E2723] rounded-md font-mono shrink-0">
                          08:30-17:30
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-extrabold text-[#3E2723]">已確認排班</span>
                          <span className="text-[10px] text-[#6D4C41]">已排定之標準班表</span>
                        </div>
                      </div>

                      {/* Modified */}
                      <div className="flex items-center gap-3 bg-white/30 p-2.5 rounded-xl border border-[#DAC0A3]/20">
                        <div className="w-20 py-1.5 text-[10px] text-center font-bold border border-[#bae6fd] bg-[#E0F2FE] text-[#0369a1] rounded-md font-mono shrink-0">
                          08:30-17:30
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-extrabold text-[#3E2723]">已修改班表</span>
                          <span className="text-[10px] text-[#6D4C41]">排班時間已被修改，與原登記可用時間不符</span>
                        </div>
                      </div>

                      {/* Leave */}
                      <div className="flex items-center gap-3 bg-white/30 p-2.5 rounded-xl border border-[#DAC0A3]/20">
                        <div className="w-20 py-1.5 text-[10px] text-center font-bold border border-red-200 bg-red-50 text-red-700 rounded-md shrink-0">
                          ❌ 休假
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-extrabold text-[#3E2723]">不克排班 (休假)</span>
                          <span className="text-[10px] text-[#6D4C41]">夥伴該日請假或休假，防錯機制將自動限制</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {managerViewMode === 'calendar' ? (
                    /* Month View Calendar Layout */
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
                          const dateStr = formatDateString(dateObj);
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
                              className={`min-h-[75px] md:min-h-[110px] p-1.5 flex flex-col justify-between transition-colors cursor-pointer select-none relative group ${isSelected
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
                                {/* Desktop View: lists the shift pills */}
                                <div className="hidden md:block space-y-1">
                                  {daySchedules.slice(0, 3).map(schedule => {
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
                                  {daySchedules.length > 3 && (
                                    <div className="text-[9px] text-[#6D4C41] font-bold text-center pl-1">
                                      還有 {daySchedules.length - 3} 個班...
                                    </div>
                                  )}
                                </div>

                                {/* Mobile View: displays small colored indicator dots */}
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
                  ) : (
                    /* Excel Grid Layout */
                    <main className="glass-panel rounded-2xl overflow-hidden border border-[#DAC0A3]/50 shadow-sm animate-scale-in">
                      <div ref={gridContainerRef} className="overflow-x-auto max-w-full">
                        <table className="w-full border-collapse text-left select-none table-fixed">
                          <thead>
                            <tr className="border-b border-[#DAC0A3]/50 bg-[#F5EBE6]/60">
                              {/* Sticky Employee Row Header */}
                              <th rowSpan={3} className="sticky left-0 z-20 bg-[#F5EBE6] px-4 py-4 text-xs font-black text-[#3E2723] border-r border-b border-[#DAC0A3]/50 w-[145px] shadow-[4px_0_8px_-4px_rgba(100,70,50,0.15)]">
                                人員姓名
                              </th>
                              {/* Date headers */}
                              {gridDates.map(dateObj => {
                                const dateStr = formatDateString(dateObj);
                                const isToday = dateStr === todayStr;
                                const isSelected = dateStr === selectedDateStr;
                                const dayOfWeekIndex = dateObj.getDay();
                                const mappedDayIndex = dayOfWeekIndex === 0 ? 7 : dayOfWeekIndex;
                                const dayInfo = DAYS_OF_WEEK.find(d => d.value === mappedDayIndex) || DAYS_OF_WEEK[0];

                                const totalDayHours = getDateTotalHours(dateStr);
                                const isUnderstaffed = getIsDayUnderstaffed(dateStr);

                                return (
                                  <th
                                    key={dateStr}
                                    onClick={() => setSelectedDateStr(dateStr)}
                                    className={`px-2 py-2 text-center text-xs font-bold border-r border-b border-[#DAC0A3]/50 w-[100px] cursor-pointer transition-colors ${isSelected
                                      ? 'bg-[#8D6E63]/15 text-[#3E2723]'
                                      : isToday
                                        ? 'bg-[#F5EBE6] text-[#3E2723] font-black'
                                        : 'hover:bg-[#FAF7F2]/75 text-[#6D4C41]'
                                      }`}
                                  >
                                    <div className="font-mono text-sm font-extrabold">{dateObj.getDate()}</div>
                                    <div className="text-xs font-bold opacity-90">{dayInfo.name}</div>
                                    {/* Hourly coverage indicator under the header */}
                                    <div className="mt-1 flex items-center justify-center gap-1">
                                      {totalDayHours > 0 && (
                                        <span className={`text-[8px] font-black px-1.5 py-0.2 rounded-md ${isUnderstaffed
                                          ? 'bg-[#E65100]/10 text-[#BF360C] border border-[#E65100]/20'
                                          : 'bg-emerald-600/10 text-[#2E7D32] border border-emerald-600/20'
                                          }`}>
                                          {totalDayHours}h
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                            <tr className="border-b border-[#DAC0A3]/50 bg-[#F5EBE6]/60">
                              {/* ERP labels row */}
                              {gridDates.map(dateObj => {
                                const dateStr = formatDateString(dateObj);
                                const isToday = dateStr === todayStr;
                                const isSelected = dateStr === selectedDateStr;
                                const dayOfWeekIndex = dateObj.getDay();
                                const mappedDayIndex = dayOfWeekIndex === 0 ? 7 : dayOfWeekIndex;
                                const isERP = mappedDayIndex === 1 || mappedDayIndex === 3 || mappedDayIndex === 5;

                                return (
                                  <th
                                    key={dateStr + '-erp'}
                                    onClick={() => setSelectedDateStr(dateStr)}
                                    className={`px-2 py-1 text-center border-r border-b border-[#DAC0A3]/50 w-[100px] cursor-pointer transition-colors ${isSelected
                                      ? 'bg-[#8D6E63]/15 text-[#3E2723]'
                                      : isToday
                                        ? 'bg-[#F5EBE6] text-[#3E2723] font-black'
                                        : 'hover:bg-[#FAF7F2]/75'
                                      }`}
                                  >
                                    {isERP ? (
                                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-black bg-indigo-600/10 text-indigo-750 border border-indigo-600/20 rounded-md">
                                        ERP
                                      </span>
                                    ) : (
                                      <span className="inline-block h-[15px]"></span>
                                    )}
                                  </th>
                                );
                              })}
                            </tr>
                            <tr className="border-b border-[#DAC0A3]/50 bg-[#F5EBE6]/40">
                              {/* Custom notes row */}
                              {gridDates.map(dateObj => {
                                const dateStr = formatDateString(dateObj);
                                const isToday = dateStr === todayStr;
                                const isSelected = dateStr === selectedDateStr;
                                const note = getDayNote(dateStr);

                                return (
                                  <th
                                    key={dateStr + '-note'}
                                    className={`px-1 py-1.5 text-center border-r border-b border-[#DAC0A3]/50 w-[100px] transition-colors relative group/note ${isSelected
                                      ? 'bg-[#8D6E63]/10 text-[#3E2723]'
                                      : isToday
                                        ? 'bg-[#FAF7F2]'
                                        : 'bg-white/50 hover:bg-[#FAF7F2]/80'
                                      }`}
                                  >
                                    <div className="flex flex-col items-center justify-between min-h-[36px] gap-1">
                                      {note ? (
                                        <span
                                          className="text-[9px] font-bold text-[#5D4037] break-words line-clamp-2 px-1 max-w-[92px] leading-tight select-text"
                                          title={note}
                                        >
                                          {note}
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-[#6D4C41]/30 font-medium italic select-none">
                                          無日備註
                                        </span>
                                      )}

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const newNote = window.prompt(`編輯 ${dateStr} 的日備註：`, note);
                                          if (newNote !== null) {
                                            handleUpdateDayNote(dateStr, newNote.trim());
                                          }
                                        }}
                                        className="text-[9px] text-[#8D6E63] hover:text-[#5D4037] hover:underline flex items-center justify-center gap-0.5 cursor-pointer mt-0.5 opacity-65 hover:opacity-100 transition-opacity"
                                      >
                                        備註 📝
                                      </button>
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {allEmployees.length === 0 ? (
                              <tr>
                                <td colSpan={gridDates.length + 1} className="py-16 text-center text-xs text-[#6D4C41] font-medium bg-[#FAF7F2]/40">
                                  目前尚無人員排班或登記資料
                                </td>
                              </tr>
                            ) : (
                              allEmployees.map(empName => {
                                const matchingEmp = employees.find(
                                  e => e.name.trim().toLowerCase() === empName.trim().toLowerCase()
                                );
                                const isNewcomer = matchingEmp ? !!matchingEmp.isNewcomer : false;

                                return (
                                  <tr key={empName} className="border-b border-dotted border-[#DAC0A3]/70 hover:bg-[#FAF7F2]/30 transition-colors group">
                                    {/* Sticky Left Column Employee Initials */}
                                    <td className={`sticky left-0 z-10 backdrop-blur-sm px-3.5 py-1 text-sm font-extrabold border-r-2 border-solid border-b border-dotted border-[#DAC0A3]/90 shadow-[4px_0_8px_-4px_rgba(100,70,50,0.1)] w-[145px] h-[48px] align-middle transition-colors ${
                                      isNewcomer
                                        ? 'bg-pink-100/85 group-hover:bg-pink-200/90 text-pink-700'
                                        : 'bg-[#FAF7F2]/95 group-hover:bg-[#F5EBE6] text-[#3E2723]'
                                    }`}>
                                      <div className="flex items-center gap-2 h-full select-none">
                                        {activeRole === 'manager' && (
                                          <div className="flex flex-col gap-1 shrink-0">
                                            {/* Up Button */}
                                            <button
                                              onClick={() => handleMoveEmployeeUp(empName)}
                                              disabled={allEmployees.indexOf(empName) === 0}
                                              className="p-1 rounded text-[#8D6E63] hover:bg-[#8D6E63]/10 active:bg-[#8D6E63]/20 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                                              title="上移"
                                            >
                                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 4l-8 8h16l-8-8z" />
                                              </svg>
                                            </button>
                                            {/* Down Button */}
                                            <button
                                              onClick={() => handleMoveEmployeeDown(empName)}
                                              disabled={allEmployees.indexOf(empName) === allEmployees.length - 1}
                                              className="p-1 rounded text-[#8D6E63] hover:bg-[#8D6E63]/10 active:bg-[#8D6E63]/20 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                                              title="下移"
                                            >
                                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 20l8-8H4l8 8z" />
                                              </svg>
                                            </button>
                                          </div>
                                        )}
                                        <div className="flex flex-col gap-1 justify-center truncate min-w-0">
                                          <span className="truncate" title={empName}>👤 {empName}</span>
                                          <div className="flex flex-wrap gap-1">
                                            {matchingEmp && matchingEmp.isNewcomer && (
                                              <span className="text-[9px] text-pink-700 bg-pink-50 border border-pink-200 rounded-md px-1.5 py-0.5 w-fit font-bold select-none leading-none truncate animate-pulse">
                                                新進
                                              </span>
                                            )}
                                            {matchingEmp && matchingEmp.trainingPosition && (
                                              <span className="text-[10px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 w-fit font-bold select-none leading-none truncate">
                                                📖 {matchingEmp.trainingPosition}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>

                                  {/* Column cell details */}
                                  {gridDates.map(dateObj => {
                                    const dateStr = formatDateString(dateObj);
                                    const isSelected = dateStr === selectedDateStr;

                                    // Shift scheduled
                                    const empSchedules = schedules.filter(
                                      s => s.employeeName.trim().toLowerCase() === empName.toLowerCase() && s.date === dateStr
                                    ).sort((a, b) => compareTimeStrings(a.startTime, b.startTime));

                                    // Worker Availability
                                    const empAvails = availabilities.filter(
                                      a => a.employeeName.trim().toLowerCase() === empName.toLowerCase() && a.date === dateStr && a.confirmed !== true
                                    ).sort((a, b) => compareTimeStrings(a.startTime, b.startTime));

                                    return (
                                      <td
                                        key={dateStr}
                                        onClick={() => setSelectedDateStr(dateStr)}
                                        className={`p-0.5 pt-1 pb-1 border-r border-solid border-b border-dotted border-[#DAC0A3]/40 text-center w-[100px] h-[48px] relative align-middle transition-colors ${isSelected ? 'bg-[#8D6E63]/5' : ''
                                          }`}
                                      >
                                        {empSchedules.length > 0 || empAvails.length > 0 ? (
                                          // Scheduled shifts + remaining availabilities (both shown together)
                                          <div className="space-y-0.5">
                                            {/* 1. Scheduled shifts */}
                                            {empSchedules.map(sched => {
                                              const theme = getScheduleTheme(sched);
                                              const managerNote = sched.managerNotes !== undefined ? sched.managerNotes : getManagerNote(sched);
                                              return (
                                                <div
                                                  key={sched.id}
                                                  onClick={(e) => handleOpenEditModal(sched, e)}
                                                  className={`text-xs py-0.5 px-1.5 rounded-md border font-semibold truncate cursor-pointer transition-all hover:scale-[1.02] ${theme.bg} ${theme.border} ${theme.text}`}
                                                  title={`👤 ${sched.employeeName} (${sched.startTime}-${sched.endTime})${sched.workplace ? ` @ 📍 ${sched.workplace}` : ''}${managerNote ? ` | 📝 主管備註: ${managerNote}` : ''}`}
                                                >
                                                  {sched.startTime}-{sched.endTime}
                                                  {managerNote && (
                                                    <div className="text-[10px] opacity-90 truncate mt-0.5 leading-normal font-medium" title={managerNote}>
                                                      ({managerNote})
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                            {/* 2. Remaining unconfirmed availabilities (always shown, even when schedules exist) */}
                                            {empAvails.map(avail => {
                                              const cleanNote = getCleanNote(avail.notes);
                                              const isOffDay = avail.startTime === '00:00' && avail.endTime === '00:00';

                                              if (isOffDay) {
                                                return (
                                                  <div
                                                    key={avail.id}
                                                    className="text-xs py-0.5 px-1 border border-red-200 bg-red-50 text-red-700 font-bold rounded-md relative flex flex-col justify-center items-center min-h-[32px] h-auto"
                                                    title={`不克排班 (休假)${cleanNote ? ` | 📝 ${cleanNote}` : ''}`}
                                                  >
                                                    <div className="text-[10px] font-bold leading-none">❌ 休假/請假</div>
                                                    <div className="text-[9px] opacity-75 mt-1 leading-none truncate w-full">不排班</div>
                                                    {cleanNote && (
                                                      <div className="text-[9.5px] opacity-85 mt-1 leading-none truncate w-full">
                                                        ({cleanNote})
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              }

                                              return (
                                                <div
                                                  key={avail.id}
                                                  className="text-xs py-0.5 px-0.5 border border-dashed border-emerald-600/30 bg-[#E8F5E9]/50 text-[#2E7D32] font-black rounded-md relative group/btn flex flex-col justify-center items-center min-h-[32px] h-auto"
                                                  title={`可用時段: ${avail.startTime}-${avail.endTime}${avail.workplace ? ` @ 📍 ${avail.workplace}` : ''}${cleanNote ? ` | 📝 ${cleanNote}` : ''}`}
                                                >
                                                  <div className="text-[10px] font-mono leading-none font-bold">{avail.startTime}-{avail.endTime}</div>
                                                  {cleanNote && (
                                                    <div className="text-[9.5px] opacity-85 mt-1 leading-none truncate w-full">
                                                      ({cleanNote})
                                                    </div>
                                                  )}
                                                  {/* Hover Instant Schedule Button */}
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleInstantAssign(avail);
                                                    }}
                                                    className="absolute inset-0 bg-[#2E7D32]/95 text-white rounded-md flex items-center justify-center gap-0.5 opacity-0 group-hover/btn:opacity-100 transition-opacity text-xs font-extrabold cursor-pointer"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    直接排
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          // 3. Empty cell (Click to quick assign)
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setModalMode('create');
                                              setEditingId(null);
                                              setEmployeeName(empName);
                                              setWorkplace(workplaces[0]?.name || '');
                                              setStartTime('09:00');
                                              setEndTime('17:00');
                                              setNotes('');
                                              setSelectedDates([dateStr]);
                                              setFormOriginalStartTime(null);
                                              setFormOriginalEndTime(null);
                                              setIsModalOpen(true);
                                            }}
                                            className="w-full h-full min-h-[32px] rounded-lg border border-transparent hover:border-[#8D6E63]/40 hover:bg-[#FAF7F2] transition-all flex items-center justify-center text-[#E5D3C3] hover:text-[#795548] cursor-pointer"
                                            title="在此日排班"
                                          >
                                            <svg className="w-4 h-4 opacity-0 hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                            </svg>
                                          </button>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                        </table>
                      </div>
                    </main>
                  )}

                  {/* Selected Date Detail Block (Today's scheduled shifts) */}
                  <section className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#DAC0A3]/35 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
                          今日班證明細：{selectedDateObject.getFullYear()}年 {formatMMDD(selectedDateObject)} ({selectedDayInfo.name})
                        </h3>
                        <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
                          此日共排定 {selectedDateShifts.length} 個班次，合計 {selectedDateTotalHours} 小時。
                        </p>
                      </div>

                      <button
                        onClick={() => handleOpenAddModal(selectedDateStr)}
                        className="px-4 py-2 bg-[#8D6E63]/10 hover:bg-[#8D6E63]/20 border border-[#8D6E63]/30 hover:border-[#8D6E63] text-[#5D4037] font-semibold rounded-xl text-xs transition-all cursor-pointer"
                      >
                        ＋ 在此日新增排班
                      </button>
                    </div>

                    {selectedDateShifts.length === 0 ? (
                      <div className="py-8 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-xl">
                        <p className="text-xs text-[#6D4C41]/80 font-medium">此日尚無排班班次紀錄</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {selectedDateShifts.map(schedule => {
                          const theme = getScheduleTheme(schedule);
                          const duration = calculateDuration(schedule.startTime, schedule.endTime);

                          return (
                            <div
                              key={schedule.id}
                              onClick={(e) => handleOpenEditModal(schedule, e)}
                              className={`group glass-card p-3 rounded-xl border border-[#DAC0A3]/40 relative cursor-pointer flex flex-col justify-between gap-3 ${theme.bg} ${theme.border} ${theme.hover}`}
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`text-[10px] font-bold flex items-center gap-1 ${theme.text} font-mono`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`}></span>
                                    {schedule.startTime} - {schedule.endTime}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {schedule.workplace && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/80 text-[#5D4037] border border-[#DAC0A3]/40 font-semibold flex items-center gap-0.5">
                                        📍{schedule.workplace}
                                      </span>
                                    )}
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/80 text-[#6D4C41] border border-[#DAC0A3]/40 font-mono font-bold">
                                      {duration}h
                                    </span>
                                  </div>
                                </div>

                                <h4 className="font-extrabold text-[#3E2723] text-sm flex items-center gap-1.5 leading-tight group-hover:text-[#4E342E] transition-colors">
                                  👤 {schedule.employeeName}
                                </h4>
                              </div>

                              {schedule.notes && (
                                <div className="text-[10px] text-[#6D4C41] bg-white/50 px-2 py-1 rounded border border-dashed border-[#DAC0A3]/40 text-left truncate">
                                  📝 {schedule.notes}
                                </div>
                              )}

                              <div className="flex items-center justify-end gap-1.5 border-t border-[#DAC0A3]/30 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => handleOpenEditModal(schedule, e)}
                                  className="p-1 rounded bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-[#3E2723] transition-colors cursor-pointer"
                                  title="編輯"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => handleDelete(schedule.id, e)}
                                  className="p-1 rounded bg-white hover:bg-red-50 border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-red-605 transition-colors cursor-pointer"
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

                    {(() => {
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
                        <>
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
                        </>
                      );
                    })()}
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
                      {Array.from({ length: 14 }, (_, i) => i + 6).map(hour => {
                        // Calculate scheduled workers during this hour
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

                            {/* Target adjustment controls */}
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

                            {/* Scheduled employees tooltip/details */}
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
                </>
              )}
            </div>
          )
        )}

      </div>

      {/* Part-Time Worker Availability Config Modal */}
      {isWorkerAvailModalOpen && (
        <div className="fixed inset-0 bg-[#3E2723]/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in">
          {/* Sheet on mobile, centred card on desktop */}
          <div className="glass-panel w-full sm:max-w-2xl shadow-2xl border border-[#DAC0A3]/50 flex flex-col
                          rounded-t-3xl sm:rounded-2xl
                          max-h-[92vh] sm:max-h-[90vh]">

            {/* Drag handle (mobile only) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
              <div className="w-10 h-1 rounded-full bg-[#DAC0A3]/70"></div>
            </div>

            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#DAC0A3]/35 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
                  設定可用時段
                </h3>
                <p className="text-xs text-[#6D4C41] mt-0.5">請為每個已選日期設定可配合的時間與地點</p>
              </div>
              <button
                onClick={() => setIsWorkerAvailModalOpen(false)}
                className="text-[#6D4C41] hover:text-[#3E2723] p-2 rounded-xl hover:bg-[#FAF7F2] transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Sync All Button */}
            {availConfigs.length > 1 && (
              <div className="px-4 pt-3 shrink-0">
                <button
                  type="button"
                  onClick={handleSyncAllAvailConfigs}
                  className="w-full py-2.5 text-xs font-bold text-[#5D4037] bg-[#8D6E63]/10 active:bg-[#8D6E63]/25 hover:bg-[#8D6E63]/20 border border-[#8D6E63]/30 rounded-xl transition-all cursor-pointer"
                >
                  📋 一鍵同步所有日期時間與地點（套用第一筆設定）
                </button>
              </div>
            )}

            {/* Scrollable date cards */}
            <div className="overflow-y-auto px-4 py-3 space-y-4 flex-1">
              {availConfigs.map((config, index) => {
                const dateObj = new Date(config.date);
                const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                const dayName = dayNames[dateObj.getDay()];
                const startTime = timeSlots[config.startIdx];
                const endTime = timeSlots[config.endIdx];
                const duration = calculateDuration(startTime, endTime);
                const overEight = isOverEightHours(startTime, endTime);
                const minStartIdx = 0;
                const maxEndIdx = timeSlots.length - 1;

                // Determine mode and divider position
                let currentMode: 'until' | 'from' = 'until';
                let dividerIdx = config.endIdx;

                if (config.startIdx > minStartIdx && config.endIdx === maxEndIdx) {
                  currentMode = 'from';
                  dividerIdx = config.startIdx;
                } else if (config.startIdx === minStartIdx && config.endIdx < maxEndIdx) {
                  currentMode = 'until';
                  dividerIdx = config.endIdx;
                } else if (config.startIdx === minStartIdx && config.endIdx === maxEndIdx) {
                  currentMode = 'until';
                  dividerIdx = maxEndIdx;
                } else {
                  // Legacy fallback
                  const distToStart = config.startIdx - minStartIdx;
                  const distToEnd = maxEndIdx - config.endIdx;
                  if (distToStart > distToEnd) {
                    currentMode = 'from';
                    dividerIdx = config.startIdx;
                  } else {
                    currentMode = 'until';
                    dividerIdx = config.endIdx;
                  }
                }

                // Calculate percentage relative to minStartIdx and maxEndIdx
                const pct = maxEndIdx > minStartIdx ? ((dividerIdx - minStartIdx) / (maxEndIdx - minStartIdx)) * 100 : 0;

                const handleCommit = (nextDividerIdx: number, nextMode: 'until' | 'from') => {
                  let start = nextMode === 'until' ? minStartIdx : nextDividerIdx;
                  let end = nextMode === 'until' ? nextDividerIdx : maxEndIdx;

                  if (nextMode === 'until') {
                    if (end < minStartIdx + 1) end = minStartIdx + 1; // enforce minimum 30 min duration (1 slot)
                  } else {
                    if (start > maxEndIdx - 1) start = maxEndIdx - 1; // enforce minimum 30 min duration (1 slot)
                  }

                  updateAvailConfig(index, { startIdx: start, endIdx: end });
                };

                const posToIdx = (clientX: number, rect: DOMRect) => {
                  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
                  const rawIdx = minStartIdx + pct * (maxEndIdx - minStartIdx);
                  return Math.round(rawIdx);
                };

                const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  const track = e.currentTarget.parentElement;
                  if (!track) return;
                  const rect = track.getBoundingClientRect();

                  const onMove = (ev: PointerEvent) => {
                    const nextIdx = posToIdx(ev.clientX, rect);
                    handleCommit(nextIdx, currentMode);
                  };

                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };

                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                };

                return (
                  <div key={config.date} className="bg-white/60 border border-[#DAC0A3]/50 rounded-2xl p-4 space-y-4 shadow-sm">

                    {/* Date header — stacked on mobile */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#795548] shrink-0"></span>
                          <span className="text-sm font-bold text-[#3E2723]">{config.date}</span>
                          <span className="text-xs text-[#6D4C41] bg-[#8D6E63]/10 px-2 py-0.5 rounded font-medium">週{dayName}</span>
                        </div>
                        {/* Time + duration below the date on mobile */}
                        <div className="flex flex-wrap items-center gap-1.5 pl-4">
                          <span className="text-sm font-mono font-bold text-[#795548]">{startTime} – {endTime}</span>
                          <span className="text-[11px] text-[#8D6E63]">({Math.round((duration - 1) * 10) / 10} 有效工時)</span>
                          {overEight && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold">⚠️ 超過8小時</span>
                          )}
                        </div>
                      </div>
                      {/* Delete button — larger touch target */}
                      <button
                        type="button"
                        onClick={() => removeAvailConfig(index)}
                        className="p-2 text-[#8D6E63] hover:text-red-500 active:text-red-600 hover:bg-red-50 active:bg-red-100 rounded-xl transition-colors cursor-pointer shrink-0"
                        title="移除此日期"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* Single divider range slider */}
                    <div className="space-y-4 pt-1">
                      <div className="relative h-8 mx-2 select-none">
                        {/* Track background */}
                        <div className="absolute top-2.5 left-0 right-0 h-3 bg-[#EADBC8] rounded-full" />

                        {/* Selected Active segment */}
                        <div
                          onClick={() => handleCommit(dividerIdx, currentMode === 'until' ? 'from' : 'until')}
                          className="absolute top-2.5 h-3 rounded-full cursor-pointer transition-all"
                          style={{
                            left: currentMode === 'until' ? '0%' : `${pct}%`,
                            width: currentMode === 'until' ? `${pct}%` : `${100 - pct}%`,
                            backgroundColor: '#8D6E63',
                          }}
                        />

                        {/* Left segment (click to set until) */}
                        <div
                          onClick={() => handleCommit(dividerIdx, 'until')}
                          className="absolute top-2.5 left-0 h-3 cursor-pointer"
                          style={{ width: `${pct}%` }}
                        />

                        {/* Right segment (click to set from) */}
                        <div
                          onClick={() => handleCommit(dividerIdx, 'from')}
                          className="absolute top-2.5 right-0 h-3 cursor-pointer"
                          style={{ width: `${100 - pct}%` }}
                        />

                        {/* Movable Divider Handle */}
                        <div
                          onPointerDown={onHandleDown}
                          className="absolute top-1.5 w-5 h-5 rounded-full bg-white border-2 shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center"
                          style={{
                            left: `${pct}%`,
                            borderColor: '#795548',
                            transform: 'translateX(-50%)',
                            touchAction: 'none'
                          }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-[#795548]" />
                        </div>
                      </div>

                      {/* Ruler tick labels */}
                      <div className="relative h-5 mx-2 text-[9px] text-[#8D6E63]/60 font-mono select-none">
                        {(() => {
                          const ticks = [];
                          const len = timeSlots.length;
                          if (len > 0) {
                            ticks.push({ label: timeSlots[0], idx: 0 });
                            const step = len <= 10 ? 1 : len <= 20 ? 2 : len <= 40 ? 4 : 6;
                            for (let i = step; i < len - 1; i += step) {
                              if (len - 1 - i >= step / 2) {
                                ticks.push({ label: timeSlots[i], idx: i });
                              }
                            }
                            if (len > 1) {
                              ticks.push({ label: timeSlots[len - 1], idx: len - 1 });
                            }
                          }
                          return ticks.map((tick) => {
                            const tickPct = maxEndIdx > minStartIdx ? ((tick.idx - minStartIdx) / (maxEndIdx - minStartIdx)) * 100 : 0;
                            const isCurrent = tick.idx === dividerIdx;
                            return (
                              <span
                                key={`${tick.label}-${tick.idx}`}
                                className={`absolute transition-all duration-150 ${isCurrent ? 'text-[#3E2723] font-black text-[10px]' : ''
                                  }`}
                                style={{
                                  left: `${tickPct}%`,
                                  transform: 'translateX(-50%)',
                                }}
                              >
                                {tick.label}
                              </span>
                            );
                          });
                        })()}
                      </div>

                      {/* Mode selection buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleCommit(dividerIdx, 'until')}
                          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${currentMode === 'until'
                            ? 'bg-[#795548] text-white border-[#795548] shadow-sm'
                            : 'bg-white text-[#8D6E63] border-[#DAC0A3]/50 hover:bg-[#FAF7F2]'
                            }`}
                        >
                          工作至此時間
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCommit(dividerIdx, 'from')}
                          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${currentMode === 'from'
                            ? 'bg-[#795548] text-white border-[#795548] shadow-sm'
                            : 'bg-white text-[#8D6E63] border-[#DAC0A3]/50 hover:bg-[#FAF7F2]'
                            }`}
                        >
                          自此時間開始
                        </button>
                      </div>
                    </div>

                    {/* Other registered colleagues for this date */}
                    {(() => {
                      const dayAvails = availabilities.filter(
                        a => a.date === config.date &&
                          a.employeeName.trim().toLowerCase() !== workerName.trim().toLowerCase() &&
                          !(a.startTime === '00:00' && a.endTime === '00:00') &&
                          a.confirmed !== true
                      );
                      if (dayAvails.length === 0) return null;
                      return (
                        <div className="bg-[#FAF7F2]/60 border border-[#DAC0A3]/45 rounded-xl p-2.5 space-y-1.5">
                          <div className="text-[10px] font-bold text-[#6D4C41] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#8D6E63]"></span>
                            同日已登記之同仁：
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {dayAvails.map(a => (
                              <span
                                key={a.id}
                                className="text-[10px] bg-white border border-[#DAC0A3]/40 text-[#5D4037] px-2 py-0.5 rounded-md font-bold"
                                title={`備註: ${a.notes || '無'}`}
                              >
                                {a.employeeName} ({a.startTime}-{a.endTime} @ {a.workplace})
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Workplace + Notes — stacked on mobile, side-by-side on sm+ */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-1.5">地點</label>
                        <select
                          value={config.workplace}
                          onChange={(e) => updateAvailConfig(index, { workplace: e.target.value })}
                          className="w-full glass-input px-3 py-2.5 rounded-xl text-sm cursor-pointer"
                        >
                          {workplaces.map(loc => (
                            <option key={loc.id} value={loc.name} className="bg-white text-[#3E2723]">
                              {loc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-1.5">備註 (選填)</label>
                        <input
                          type="text"
                          value={config.notes}
                          onChange={(e) => updateAvailConfig(index, { notes: e.target.value })}
                          placeholder="例如：只能上早班..."
                          className="w-full glass-input px-3 py-2.5 rounded-xl text-sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {availConfigs.length === 0 && (
                <div className="py-16 text-center text-sm text-[#8D6E63]">沒有已選日期，請先在日曆上選擇日期。</div>
              )}
            </div>

            {/* Modal Footer — full-width tall buttons for easy tapping */}
            <div className="px-4 py-4 border-t border-[#DAC0A3]/35 flex gap-3 shrink-0 pb-safe">
              <button
                type="button"
                onClick={() => setIsWorkerAvailModalOpen(false)}
                className="flex-1 py-3.5 text-sm font-semibold text-[#6D4C41] bg-white/70 active:bg-[#FAF7F2] hover:bg-[#FAF7F2] border border-[#DAC0A3]/60 rounded-xl transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleWorkerAvailModalSubmit}
                className="flex-[2] py-3.5 text-sm font-bold text-white bg-[#795548] active:bg-[#5D4037] hover:bg-[#6D4C41] rounded-xl transition-colors cursor-pointer shadow-lg shadow-[#795548]/15"
              >
                送出可用時間 ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Time Direct Assignment Shift Picker Modal */}

      {isFTAssignModalOpen && pendingAssignAvail && (
        <div className="fixed inset-0 bg-[#3E2723]/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-panel rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#DAC0A3]/50 flex flex-col p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
                指派正式夥伴班次
              </h3>
              <p className="text-xs text-[#6D4C41] mt-1 font-medium">
                同仁：{pendingAssignAvail.employeeName}<br />
                日期：{pendingAssignAvail.date}
              </p>
              <p className="text-[11px] text-[#8D6E63] mt-1.5 leading-normal">
                請選擇要指派的班次時間（此指派將設定為該班次的原始時間，因此不會觸變工時調整標記的顏色）：
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              {shiftPresets.map((preset) => {
                const isAvailable = timeSlots.includes(preset.startTime) && timeSlots.includes(preset.endTime);
                if (!isAvailable) return null;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => executeFTAssign(pendingAssignAvail, preset.name, preset.startTime, preset.endTime)}
                    className="w-full py-3 bg-[#795548] hover:bg-[#5D4037] text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:shadow-[#795548]/10"
                  >
                    ☀️ {preset.name} ({preset.startTime} - {preset.endTime})
                  </button>
                );
              })}
            </div>

            <div className="border-t border-[#E5DCD5]/60 pt-3 mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsFTAssignModalOpen(false);
                  setPendingAssignAvail(null);
                }}
                className="px-4 py-2 bg-[#FAF7F2] hover:bg-[#FAF7F2]/80 text-[#6D4C41] font-semibold rounded-lg text-xs transition-colors cursor-pointer border border-[#DAC0A3]/40"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#3E2723]/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-panel rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-[#DAC0A3]/50 flex flex-col">

            {/* Modal Header */}
            <div className="p-6 border-b border-[#DAC0A3]/35 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
                {modalMode === 'create' ? '新增排班時段 (可複選日期)' : '編輯排班時段'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#6D4C41] hover:text-[#3E2723] p-1.5 rounded-lg hover:bg-[#FAF7F2] transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">

              {/* Quick Autofill Helper in Add Modal */}
              {modalMode === 'create' && selectedDates.length === 1 && (() => {
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
                                  setEmployeeName(avail.employeeName);
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
              {modalMode === 'create' ? (
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

                  {/* 4-Week Grid (4 rows of 7 columns matching Mon-Sun) */}
                  <div className="p-2 border border-[#E5DCD5] rounded-xl bg-[#FAF7F2]/50">
                    {/* Weekday names */}
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[#8D6E63] font-bold mb-1">
                      <div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div>
                    </div>
                    {/* Date buttons grid */}
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
                // Edit mode: single date selection (HTML5 date input)
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

              {/* Quick Shift Presets inside scheduling modal */}
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

              {/* Consecutive 7 days warning in manager modal */}
              {(() => {
                if (!employeeName.trim()) return null;
                const targetName = employeeName.trim();
                let datesToCheck: string[] = [];
                if (modalMode === 'create' && selectedDates.length > 0) {
                  const existingDates = schedules
                    .filter(s => s.employeeName.trim().toLowerCase() === targetName.toLowerCase())
                    .map(s => s.date);
                  datesToCheck = Array.from(new Set([...existingDates, ...selectedDates]));
                } else if (modalMode === 'edit' && singleDate) {
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
                const checkDates = modalMode === 'create' ? selectedDates : [singleDate];

                const conflictingDates = checkDates.filter(d => {
                  const monthStr = d.substring(0, 7);
                  // Find all availability records for this employee in this month
                  const monthAvails = availabilities.filter(
                    a => a.employeeName.trim().toLowerCase() === targetName &&
                      a.date.startsWith(monthStr)
                  );
                  // If they haven't registered any availability for this month yet, no conflict
                  if (monthAvails.length === 0) return false;

                  // They have registered availability. They are available on date d ONLY if
                  // they have a record on date d and it is not a legacy/explicit off-day.
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
                {modalMode === 'edit' && workerNotes && (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <span className="block text-xs font-bold text-indigo-850 mb-1">💬 同仁登記備註</span>
                    <p className="text-xs text-indigo-900 break-words whitespace-pre-wrap">{workerNotes}</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">
                    {modalMode === 'edit' && workerNotes ? '主管備註項目 (選填)' : '備註項目 (選填)'}
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
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-white hover:bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] font-semibold px-4 py-3 rounded-xl transition-all cursor-pointer text-center text-sm"
                >
                  取消
                </button>
                {modalMode === 'edit' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (editingId && safeConfirm('確定要刪除此排程紀錄嗎？')) {
                        try {
                          const scheduleToDelete = schedules.find(s => s.id === editingId);
                          await deleteSchedule(editingId);
                          if (scheduleToDelete?.availabilityId) {
                            await updateAvailability(scheduleToDelete.availabilityId, { confirmed: false });
                          }
                          setIsModalOpen(false);
                        } catch (error) {
                          console.error("Error deleting schedule from modal: ", error);
                          alert('刪除排程失敗，請稍後再試。');
                        }
                      }
                    }}
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
      )}

      {/* Employee Add/Edit Modal */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 bg-[#3E2723]/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-panel rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-[#DAC0A3]/50 flex flex-col">

            {/* Modal Header */}
            <div className="p-6 border-b border-[#DAC0A3]/35 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
                {employeeFormMode === 'create' ? '新增員工資料' : '編輯員工資料'}
              </h3>
              <button
                onClick={() => setIsEmployeeModalOpen(false)}
                className="text-[#6D4C41] hover:text-[#3E2723] p-1.5 rounded-lg hover:bg-[#FAF7F2] transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEmployeeSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[85vh]">

              {/* Employee Name */}
              <div>
                <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">員工姓名</label>
                <input
                  type="text"
                  required
                  placeholder="輸入真實姓名 (例如：王大明)"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                />
              </div>

              {/* Employee Phone */}
              <div>
                <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">聯絡電話</label>
                <input
                  type="tel"
                  required
                  placeholder="輸入聯絡電話 (例如：0912345678)"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                />
              </div>

              {/* Status Selector */}
              <div>
                <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">身分狀態</label>
                <div className="grid grid-cols-2 gap-2 bg-[#FAF7F2] p-1.5 rounded-2xl border border-[#DAC0A3]/45">
                  <button
                    type="button"
                    onClick={() => handleStatusChange('兼職夥伴')}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${empStatus === '兼職夥伴'
                      ? 'bg-white text-indigo-700 shadow-sm border border-indigo-200'
                      : 'text-[#8D6E63] hover:text-[#3E2723]'
                      }`}
                  >
                    兼職夥伴 (Part-time)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('正式夥伴')}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${empStatus === '正式夥伴'
                      ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200'
                      : 'text-[#8D6E63] hover:text-[#3E2723]'
                      }`}
                  >
                    正式夥伴 (Full-time)
                  </button>
                </div>
              </div>

              {/* Active Status Selector */}
              <div>
                <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">在職狀態</label>
                <div className="grid grid-cols-2 gap-2 bg-[#FAF7F2] p-1.5 rounded-2xl border border-[#DAC0A3]/45">
                  <button
                    type="button"
                    onClick={() => setEmpActive(true)}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${empActive === true
                      ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200'
                      : 'text-[#8D6E63] hover:text-[#3E2723]'
                      }`}
                  >
                    在職 (Active)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmpActive(false)}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${empActive === false
                      ? 'bg-white text-red-700 shadow-sm border border-red-200'
                      : 'text-[#8D6E63] hover:text-[#3E2723]'
                      }`}
                  >
                    離職 (Resigned)
                  </button>
                </div>
              </div>

              {/* Newcomer Status Selector */}
              <div>
                <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">是否為新進人員</label>
                <div className="grid grid-cols-2 gap-2 bg-[#FAF7F2] p-1.5 rounded-2xl border border-[#DAC0A3]/45">
                  <button
                    type="button"
                    onClick={() => setEmpIsNewcomer(true)}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${empIsNewcomer === true
                      ? 'bg-white text-amber-700 shadow-sm border border-amber-200'
                      : 'text-[#8D6E63] hover:text-[#3E2723]'
                      }`}
                  >
                    新進人員 (Newcomer)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmpIsNewcomer(false)}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${empIsNewcomer === false
                      ? 'bg-white text-[#8D6E63] shadow-sm border border-[#DAC0A3]/30'
                      : 'text-[#8D6E63] hover:text-[#3E2723]'
                      }`}
                  >
                    一般員工 (Regular)
                  </button>
                </div>
              </div>

              {/* Rotation tag board */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col gap-0.5">
                  <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider">
                    崗位訓練輪替板
                  </label>
                  <span className="text-[10px] text-[#8D6E63] font-medium leading-normal">
                    三項崗位皆合格後會自動轉為「正式夥伴」。可以點擊標籤或拖曳標籤以移動位置。
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Column 1: Available */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDropToAvailable}
                    className="flex flex-col gap-2 p-3 rounded-xl border border-dashed border-[#DAC0A3]/50 bg-[#FAF7F2]/30 min-h-[140px] transition-colors"
                  >
                    <span className="text-[10px] font-extrabold text-[#8D6E63] text-center border-b border-[#DAC0A3]/25 pb-1">
                      尚未開始 (Available)
                    </span>
                    <div className="flex flex-wrap gap-1.5 justify-center items-center flex-1">
                      {ALL_POSITIONS
                        .filter(pos => empTrainingPos !== pos && !empTrainedPoss.includes(pos))
                        .map(pos => (
                          <div
                            key={pos}
                            draggable
                            onDragStart={(e) => handleDragStart(e, pos)}
                            onClick={() => handleTagClick(pos)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-[#DAC0A3]/65 text-[#5D4037] hover:border-[#8D6E63] shadow-xs cursor-pointer select-none transition-all active:scale-95"
                          >
                            {pos}
                          </div>
                        ))}
                      {ALL_POSITIONS
                        .filter(pos => empTrainingPos !== pos && !empTrainedPoss.includes(pos))
                        .length === 0 && (
                          <span className="text-[9px] text-[#8D6E63]/40 italic text-center select-none">無崗位</span>
                        )}
                    </div>
                  </div>

                  {/* Column 2: Currently Training */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDropToTraining}
                    className="flex flex-col gap-2 p-3 rounded-xl border border-[#F3E5F5] bg-purple-50/10 min-h-[140px] transition-colors relative"
                  >
                    <span className="text-[10px] font-extrabold text-[#7B1FA2] text-center border-b border-[#F3E5F5] pb-1">
                      📖 正在培訓中 (max 1)
                    </span>
                    <div className="flex flex-wrap gap-1.5 justify-center items-center flex-1">
                      {empTrainingPos ? (
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, empTrainingPos)}
                          onClick={() => handleTagClick(empTrainingPos)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 border border-amber-300 text-amber-700 hover:border-amber-400 shadow-xs cursor-pointer select-none transition-all active:scale-95 animate-pulse"
                        >
                          {empTrainingPos}
                        </div>
                      ) : (
                        <span className="text-[9px] text-[#7B1FA2]/40 text-center select-none p-2 leading-normal">
                          拖入或點擊標籤開始培訓
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Column 3: Trained */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDropToTrained}
                    className="flex flex-col gap-2 p-3 rounded-xl border border-emerald-100 bg-emerald-50/10 min-h-[140px] transition-colors"
                  >
                    <span className="text-[10px] font-extrabold text-[#2E7D32] text-center border-b border-emerald-100 pb-1">
                      ✅ 已考試合格 (Qualified)
                    </span>
                    <div className="flex flex-wrap gap-1.5 justify-center items-center flex-1">
                      {empTrainedPoss && empTrainedPoss.length > 0 ? (
                        empTrainedPoss.map(pos => (
                          <div
                            key={pos}
                            draggable
                            onDragStart={(e) => handleDragStart(e, pos)}
                            onClick={() => handleTagClick(pos)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 border border-emerald-250 text-emerald-700 hover:border-emerald-350 shadow-xs cursor-pointer select-none transition-all active:scale-95"
                          >
                            {pos}
                          </div>
                        ))
                      ) : (
                        <span className="text-[9px] text-[#2E7D32]/40 text-center select-none p-2 leading-normal">
                          尚未有合格項目
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Certificates Selector */}
              <div>
                <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">持有證照</label>
                <div className="flex flex-wrap gap-2">
                  {(['FBI', '黃金吧檯手'] as const).map(cert => {
                    const hasCert = empCertificates.includes(cert);
                    return (
                      <button
                        key={cert}
                        type="button"
                        onClick={() => {
                          setEmpCertificates(prev =>
                            prev.includes(cert)
                              ? prev.filter(c => c !== cert)
                              : [...prev, cert]
                          );
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${hasCert
                          ? 'bg-[#795548] text-white border-[#795548] shadow-xs'
                          : 'bg-white text-[#8D6E63] border-[#DAC0A3]/50 hover:border-[#8D6E63]'
                          }`}
                      >
                        {cert === 'FBI' ? '🛡️ FBI' : '☕ 黃金吧檯手'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 border-t border-[#E5DCD5] pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="flex-1 bg-white hover:bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] font-semibold px-4 py-3 rounded-xl transition-all cursor-pointer text-center text-sm"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#795548] hover:bg-[#5D4037] text-white font-semibold px-4 py-3 rounded-xl transition-all shadow-lg shadow-[#795548]/10 cursor-pointer text-center text-sm"
                >
                  儲存員工
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
