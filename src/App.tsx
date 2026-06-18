import React, { useState, useEffect } from 'react';
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
  updateDayNote
} from './services/scheduler';
import type { WorkSchedule, WorkerAvailability, StaffingTarget, Employee } from './services/scheduler';
import { isValidConfig } from './firebase';
import workplaces from './config/workplaces.json';
import * as XLSX from 'xlsx-js-style';

const safeConfirm = (message: string): boolean => {
  const isNoConfirm = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('noconfirm') === 'true';
  return isNoConfirm || window.confirm(message);
};

const ALL_POSITIONS: ('餐吧' | 'POS機' | '後吧')[] = ['餐吧', 'POS機', '後吧'];

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
const TIME_SLOTS = Array.from({ length: 29 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30; // Starts at 6:00 AM (360 minutes)
  const hour = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minute = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hour}:${minute}`;
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

// Date helper: Get 28 days starting on the Monday of the current week (aligned for 4-row selection)
const getAlign28Days = (monday: Date): Date[] => {
  const list = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    list.push(d);
  }
  return list;
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

  // Manager view sub-mode: calendar or grid or employees or calculation
  const [managerViewMode, setManagerViewMode] = useState<'calendar' | 'grid' | 'employees' | 'calculation'>('calendar');

  // Revenue-based staffing calculation states (persisted to localStorage)
  const [monthlyRevenues, setMonthlyRevenues] = useState<Record<number, number>>(() => {
    const data = localStorage.getItem('monthly_revenue_data');
    if (!data) return {};
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  });

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
  const [empTrainingPos, setEmpTrainingPos] = useState<'餐吧' | 'POS機' | '後吧' | null>(null);
  const [empTrainedPoss, setEmpTrainedPoss] = useState<('餐吧' | 'POS機' | '後吧')[]>([]);
  const [empCertificates, setEmpCertificates] = useState<('FBI' | '黃金吧檯手')[]>([]);

  // Search/Filter for employee list
  const [empSearch, setEmpSearch] = useState('');
  const [empStatusFilter, setEmpStatusFilter] = useState<'all' | '正式夥伴' | '兼職夥伴'>('all');
  const [empActiveFilter, setEmpActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');

  // Worker identity (cached in localStorage)
  const [workerName, setWorkerName] = useState(() => localStorage.getItem('scheduler_worker_name') || '');
  const [isWorkerVerified, setIsWorkerVerified] = useState(() => localStorage.getItem('scheduler_worker_verified') === 'true' && !!localStorage.getItem('scheduler_worker_name'));
  const [selectedWorkerName, setSelectedWorkerName] = useState('');
  const [workerPhoneInput, setWorkerPhoneInput] = useState('');
  const [workerVerifyError, setWorkerVerifyError] = useState('');

  // Worker availability submission form states
  const [availWorkplace, setAvailWorkplace] = useState(workplaces[0]?.name || '');
  const [availStartTime, setAvailStartTime] = useState('09:00');
  const [availEndTime, setAvailEndTime] = useState('17:00');
  const [availNotes, setAvailNotes] = useState('');
  const [availSelectedDates, setAvailSelectedDates] = useState<string[]>([]);

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

  // Form states
  const [employeeName, setEmployeeName] = useState('');
  const [workplace, setWorkplace] = useState(workplaces[0]?.name || '');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [formOriginalStartTime, setFormOriginalStartTime] = useState<string | null>(null);
  const [formOriginalEndTime, setFormOriginalEndTime] = useState<string | null>(null);

  // Creation Mode: multiple date selects (aligned in 2 rows of 7 columns)
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  // Editing Mode: single date picker input
  const [singleDate, setSingleDate] = useState('');

  // Generate date checklist for the modal form (aligned in 2 rows of 7 columns, starting Monday of current week)
  const pickerWeekStart = getMondayOfDate(new Date());
  const pickerDates = getAlign28Days(pickerWeekStart);

  // Date calculations for worker's availability selection (Next Month)
  const workerNextMonthStart = (() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  })();
  const workerCalendarGridDates = getMonthGridDates(workerNextMonthStart);
  const workerDaysInMonth = getDaysInMonth(workerNextMonthStart);

  const handleStatusChange = (status: '正式夥伴' | '兼職夥伴') => {
    setEmpStatus(status);
  };

  const handleTagClick = (pos: '餐吧' | 'POS機' | '後吧') => {
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

  const handleDragStart = (e: React.DragEvent, pos: '餐吧' | 'POS機' | '後吧') => {
    e.dataTransfer.setData('text/plain', pos);
  };

  const handleDropToAvailable = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = e.dataTransfer.getData('text/plain') as '餐吧' | 'POS機' | '後吧';
    if (!pos) return;
    if (empTrainingPos === pos) setEmpTrainingPos(null);
    setEmpTrainedPoss(prev => prev.filter(p => p !== pos));
  };

  const handleDropToTraining = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = e.dataTransfer.getData('text/plain') as '餐吧' | 'POS機' | '後吧';
    if (!pos) return;
    setEmpTrainingPos(pos);
    setEmpTrainedPoss(prev => prev.filter(p => p !== pos));
  };

  const handleDropToTrained = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = e.dataTransfer.getData('text/plain') as '餐吧' | 'POS機' | '後吧';
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

    return () => {
      unsubSchedules();
      unsubAvailabilities();
      unsubStaffingTargets();
      unsubEmployees();
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
  const handleResetRevenues = () => {
    if (safeConfirm('確定要清空所有時段的月營業額輸入數據嗎？')) {
      setMonthlyRevenues({});
      localStorage.removeItem('monthly_revenue_data');
    }
  };

  // Submit worker availability
  const handleAddAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim()) {
      alert('請先輸入您的姓名。');
      return;
    }
    if (availSelectedDates.length === 0) {
      alert('請至少選擇一個可用日期。');
      return;
    }

    // Check 2: Consecutive 7 days (combine existing + newly selected dates)
    const existingDates = availabilities
      .filter(a => a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase())
      .map(a => a.date);
    const allDates = Array.from(new Set([...existingDates, ...availSelectedDates]));
    if (hasSevenConsecutiveDays(allDates)) {
      alert('⚠️ 無法送出：登記後將出現連續 7 天或以上的工作天。\n\n根據勞工法規，員工每 7 天中至少需有 1 天例假日，不可連續工作超過 6 天。\n\n請重新調整您的可用日期。');
      return;
    }

    // Check 1: Over 8 effective hours (warn, but still allow)
    if (isOverEightHours(availStartTime, availEndTime)) {
      const proceed = window.confirm(
        `⚠️ 注意：您登記的時段（${availStartTime} - ${availEndTime}）扣除 1 小時休息後，有效工時超過 8 小時。\n\n建議每次排班不超過 8 小時（加上休息共 9 小時）。\n\n確定仍要以此時段送出嗎？`
      );
      if (!proceed) return;
    }

    try {
      const promises = availSelectedDates.map(dateStr => {
        return addAvailability({
          employeeName: workerName.trim(),
          date: dateStr,
          workplace: availWorkplace,
          startTime: availStartTime,
          endTime: availEndTime,
          notes: availNotes.trim()
        });
      });
      await Promise.all(promises);
      setAvailSelectedDates([]);
      setAvailNotes('');
      alert('已成功送出您的可用時間！');
    } catch (error) {
      console.error("Error saving availability: ", error);
      alert('送出可用時間失敗，請稍後再試。');
    }
  };



  // Instant Schedule Assign (Zero-Click Modal)
  const handleInstantAssign = async (avail: WorkerAvailability) => {
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
        color: derivedColor,
        originalStartTime: avail.startTime,
        originalEndTime: avail.endTime
      };
      await addSchedule(payload);
      // Remove the confirmed availability so it no longer shows as unconfirmed in the grid
      await deleteAvailability(avail.id);
    } catch (error) {
      console.error("Error doing instant assign: ", error);
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
    setNotes(schedule.notes || '');
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
        const promises = selectedDates.map(dateStr => {
          const payload = {
            title: employeeName.trim(),
            employeeName: employeeName.trim(),
            date: dateStr,
            workplace,
            startTime,
            endTime,
            notes: notes.trim(),
            color: derivedColor,
            originalStartTime: formOriginalStartTime || undefined,
            originalEndTime: formOriginalEndTime || undefined
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
          color: derivedColor,
          originalStartTime: formOriginalStartTime || undefined,
          originalEndTime: formOriginalEndTime || undefined
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
        await deleteSchedule(id);
      } catch (error) {
        console.error("Error deleting schedule: ", error);
      }
    }
  };

  // Delete availability handler
  const handleDeleteAvailability = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (safeConfirm('確定要刪除此可用時間登記嗎？')) {
      try {
        await deleteAvailability(id);
      } catch (error) {
        console.error("Error deleting availability: ", error);
      }
    }
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

  const getScheduleTheme = (schedule: WorkSchedule) => {
    if (schedule.originalStartTime && schedule.originalEndTime) {
      if (schedule.startTime !== schedule.originalStartTime || schedule.endTime !== schedule.originalEndTime) {
        return COLOR_THEMES.lightBlue;
      }
    }
    return COLOR_THEMES[schedule.color] || COLOR_THEMES.indigo;
  };

  // Calendar calculations (filtered by the currently active visible month grid)
  const monthGridDates = getMonthGridDates(currentMonthStart);
  const gridDates = getDaysInMonth(currentMonthStart);

  const allEmployees = Array.from(
    new Set([
      ...employees.map(e => e.name.trim()),
      ...schedules.map(s => s.employeeName.trim()),
      ...availabilities.map(a => a.employeeName.trim())
    ])
  ).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-Hant'));


  const getSchedulesForDate = (dateStr: string) => {
    return schedules
      .filter(item => item.date === dateStr)
      .sort((a, b) => compareTimeStrings(a.startTime, b.startTime));
  };

  const getAvailabilitiesForDate = (dateStr: string) => {
    return availabilities
      .filter(item => item.date === dateStr)
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

  const handleExportToExcel = () => {
    if (!exportStartDate || !exportEndDate) {
      alert('請先選擇匯出的日期範圍。');
      return;
    }

    const start = new Date(exportStartDate);
    const end = new Date(exportEndDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      alert('請輸入有效的日期範圍。');
      return;
    }

    const exportDates = getDatesInRange(exportStartDate, exportEndDate);
    if (exportDates.length === 0) {
      alert('選擇的日期範圍內沒有日期。');
      return;
    }

    const exportSchedules = schedules.filter(item => {
      return item.date && item.date >= exportStartDate && item.date <= exportEndDate;
    });

    if (exportSchedules.length === 0) {
      alert('在此日期範圍內尚無排班資料可供匯出。');
      return;
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
    
    const headers = ['人員姓名', ...dateHeaders];
    const rows: string[][] = [];
    const changedCells = new Set<string>();

    // Add employee rows
    allEmployees.forEach((empName, empIdx) => {
      const dateCells = exportDates.map((dateObj, dateIdx) => {
        const dateStr = formatDateString(dateObj);
        const empSchedules = schedules.filter(
          s => s.employeeName.trim().toLowerCase() === empName.trim().toLowerCase() && s.date === dateStr
        ).sort((a, b) => compareTimeStrings(a.startTime, b.startTime));

        const hasChangedShift = empSchedules.some(
          s => s.originalStartTime && s.originalEndTime && (s.startTime !== s.originalStartTime || s.endTime !== s.originalEndTime)
        );

        if (hasChangedShift) {
          const cellRef = XLSX.utils.encode_cell({ r: empIdx + 1, c: dateIdx + 1 });
          changedCells.add(cellRef);
        }

        if (empSchedules.length === 0) return '';

        return empSchedules.map(sched => {
          const note = getCleanNote(sched.notes);
          return note 
            ? `${sched.startTime}-${sched.endTime}\n(${note})`
            : `${sched.startTime}-${sched.endTime}`;
        }).join('\n');
      });

      const row = [
        empName,
        ...dateCells
      ];
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
        const isChanged = changedCells.has(cellRef);
        ws[cellRef].s = {
          alignment: { wrapText: true, vertical: 'center', horizontal: 'center' },
          ...(isChanged ? {
            fill: {
              fgColor: { rgb: "93C5FD" }
            }
          } : {})
        };
      }
    }
    
    // Auto-fit column widths
    const maxCols = headers.length;
    const colWidths = Array(maxCols).fill({ wch: 10 });
    // First column 'Personnel Name' should be wider
    colWidths[0] = { wch: 15 };
    
    // Set column widths in the sheet
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '排班網格表');

    // Trigger browser download
    XLSX.writeFile(wb, `${exportStartDate}_至_${exportEndDate}_精品咖啡館排班網格表.xlsx`);
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
                    登記可用時段 ({workerNextMonthStart.getFullYear()}年 {workerNextMonthStart.getMonth() + 1}月)
                  </h3>
                  <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
                    請選取日期、地點與可配合排班的時間範圍，店長即可為您安排班表。
                  </p>
                </div>

                <form onSubmit={handleAddAvailability} className="space-y-4 pt-2">
                  {/* Workplace Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">可配合地點</label>
                    <select
                      value={availWorkplace}
                      onChange={(e) => setAvailWorkplace(e.target.value)}
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                    >
                      {workplaces.map(loc => (
                        <option key={loc.id} value={loc.name} className="bg-white text-[#3E2723]">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Time Inputs */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">開始時間</label>
                      <select
                        value={availStartTime}
                        onChange={(e) => setAvailStartTime(e.target.value)}
                        className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                      >
                        {TIME_SLOTS.map(slot => (
                          <option key={slot} value={slot} className="bg-white text-[#3E2723] font-mono">
                            {slot}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">最晚結束時間</label>
                      <select
                        value={availEndTime}
                        onChange={(e) => setAvailEndTime(e.target.value)}
                        className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                      >
                        {TIME_SLOTS.map(slot => (
                          <option key={slot} value={slot} className="bg-white text-[#3E2723] font-mono">
                            {slot}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Date Multi-selector */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider">選擇可用日期 (可複選)</label>
                      <span className="text-[10px] text-[#795548] font-bold bg-[#8D6E63]/10 px-2 py-0.5 rounded font-mono">
                        已選 {availSelectedDates.length} 天
                      </span>
                    </div>

                    {/* Shortcuts */}
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      <button
                        type="button"
                        onClick={handleSelectAvailMonWedFri}
                        className="text-[10px] px-2.5 py-1 rounded bg-white border border-[#DAC0A3]/65 text-[#6D4C41] hover:border-[#8D6E63] hover:text-[#3E2723] hover:bg-[#FAF7F2] cursor-pointer font-bold transition-all"
                      >
                        一/三/五
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectAvailTueThu}
                        className="text-[10px] px-2.5 py-1 rounded bg-white border border-[#DAC0A3]/65 text-[#6D4C41] hover:border-[#8D6E63] hover:text-[#3E2723] hover:bg-[#FAF7F2] cursor-pointer font-bold transition-all"
                      >
                        二/四
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectAvailAllDays}
                        className="text-[10px] px-2.5 py-1 rounded bg-white border border-[#DAC0A3]/65 text-[#6D4C41] hover:border-[#8D6E63] hover:text-[#3E2723] hover:bg-[#FAF7F2] cursor-pointer font-bold transition-all"
                      >
                        全選 (整月)
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAvailAllSelected}
                        className="text-[10px] px-2.5 py-1 rounded bg-white border border-[#DAC0A3]/65 text-[#6D4C41]/70 hover:border-[#DAC0A3] cursor-pointer font-bold transition-all"
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
                              className={`relative py-1.5 px-0.5 rounded-lg border text-center transition-all cursor-pointer text-[10px] font-mono font-bold flex flex-col items-center justify-center h-9 ${isSelected
                                  ? 'bg-[#8D6E63]/20 border-[#8D6E63] text-[#5D4037] shadow-sm'
                                  : 'bg-white/70 border-[#DAC0A3]/40 text-[#6D4C41] hover:border-[#8D6E63]/60 hover:bg-white'
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

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">備註事項 (如：只能上早班、偏好時段等)</label>
                    <textarea
                      placeholder="填寫特別備註，協助店長協調排班..."
                      value={availNotes}
                      onChange={(e) => setAvailNotes(e.target.value)}
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm min-h-[70px] resize-none"
                    />
                  </div>

                  {/* Inline warning banners */}
                  {availStartTime && availEndTime && isOverEightHours(availStartTime, availEndTime) && (
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                      <span className="text-lg leading-none mt-0.5">⚠️</span>
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-amber-800">工時超過 8 小時警告</p>
                        <p className="text-[11px] text-amber-700 leading-snug">
                          此時段扣除 1 小時休息後，有效工時超過 8 小時（實際工作：{Math.round((calculateDuration(availStartTime, availEndTime) - 1) * 10) / 10} 小時）。送出時將需要確認。
                        </p>
                      </div>
                    </div>
                  )}

                  {(() => {
                    if (availSelectedDates.length === 0) return null;
                    const existingDates = availabilities
                      .filter(a => a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase())
                      .map(a => a.date);
                    const allDates = Array.from(new Set([...existingDates, ...availSelectedDates]));
                    if (!hasSevenConsecutiveDays(allDates)) return null;
                    return (
                      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                        <span className="text-lg leading-none mt-0.5">🚫</span>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-red-700">不可連續工作 7 天</p>
                          <p className="text-[11px] text-red-600 leading-snug">
                            目前選擇的日期加上已登記的可用日期，將造成連續工作 7 天或以上。依勞工法規，每 7 天至少需有 1 天例假日。請重新選擇日期。
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  <button
                    type="submit"
                    className="w-full bg-[#795548] hover:bg-[#6D4C41] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-[#795548]/15 cursor-pointer text-center text-sm"
                  >
                    送出可用時間
                  </button>
                </form>
              </div>

              {/* Submitted Availabilities List */}
              <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 lg:col-span-7 space-y-4 shadow-sm">
                <div>
                  <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8D6E63]"></span>
                    您登記的可用時間紀錄
                  </h3>
                  <p className="text-xs text-[#6D4C41] mt-0.5 font-medium">
                    以下為「{workerName || '未填寫姓名'}」已登記並提交的可用時段。店長可以在此時段安排您的排班。
                  </p>
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {!workerName.trim() ? (
                    <div className="py-12 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-xl">
                      <p className="text-xs text-[#6D4C41]/80 font-medium">請在上方輸入姓名以檢視您的可用時間紀錄</p>
                    </div>
                  ) : availabilities.filter(a => a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase()).length === 0 ? (
                    <div className="py-12 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-xl">
                      <p className="text-xs text-[#6D4C41]/80 font-medium">尚無登記任何可用時間</p>
                    </div>
                  ) : (
                    availabilities
                      .filter(a => a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase())
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

                        return (
                          <div
                            key={avail.id}
                            className="glass-card p-4 rounded-xl border border-[#DAC0A3]/45 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-extrabold text-[#3E2723]">
                                  {avail.date} ({dayInfo.name})
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-[#F5EBE6] text-[#5D4037] border border-[#DAC0A3]/40 font-bold">
                                  📍 {avail.workplace}
                                </span>
                              </div>
                              {new Date().getDate() <= 20 && (
                                <button
                                  onClick={(e) => handleDeleteAvailability(avail.id, e)}
                                  className="p-1 rounded-lg bg-white hover:bg-red-50 border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-red-650 transition-colors cursor-pointer"
                                  title="刪除此登記"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-[#6D4C41]/90 font-medium flex items-center gap-1 font-mono">
                              🕒 可配合時間：{avail.startTime} - {avail.endTime}
                            </div>
                            {avail.notes && (
                              <p className="text-xs text-[#5D4037] bg-white/50 px-2.5 py-1 rounded border border-[#DAC0A3]/40 border-dashed mt-1 inline-block">
                                📝 備註：{avail.notes}
                              </p>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>

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
                          className={`min-h-[85px] p-1.5 flex flex-col justify-between select-none relative ${
                            isToday
                              ? 'bg-[#FAF7F2]'
                              : isCurrentMonth
                                ? 'bg-white/95'
                                : 'bg-[#FAF7F2]/40 text-[#8D6E63]/40 opacity-40'
                          }`}
                        >
                          {/* Date Label */}
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-[11px] font-bold font-mono px-1.5 py-0.5 rounded-full ${
                                isToday
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
                              const cleanNote = getCleanNote(schedule.notes);
                              return (
                                <div
                                  key={schedule.id}
                                  className={`text-[9px] py-1 px-1.5 rounded border font-semibold flex flex-col gap-0.5 ${theme.bg} ${theme.border} ${theme.text}`}
                                  title={cleanNote ? `📝 ${cleanNote}` : undefined}
                                >
                                  <div className="font-mono font-bold leading-tight">{schedule.startTime} - {schedule.endTime}</div>
                                  {cleanNote && (
                                    <div className="opacity-95 italic truncate">({cleanNote})</div>
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
                        在此管理店內夥伴的培訓進度與在職狀態。培訓完成餐吧、POS機、後吧後將自動晉升為正式夥伴。
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
                                              className={`inline-block text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border ${
                                                isFbi
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
                                        setMonthlyRevenues(prev => {
                                          const next = { ...prev, [hour]: val };
                                          localStorage.setItem('monthly_revenue_data', JSON.stringify(next));
                                          return next;
                                        });
                                      }}
                                      className="w-full glass-input pl-7 pr-3 py-1.5 rounded-xl text-xs font-mono text-left focus:border-[#795548]"
                                    />
                                  </div>
                                </td>
                                <td className="py-3.5 font-mono text-xs font-extrabold text-[#795548]">
                                  ${dailyAvg.toLocaleString()}
                                </td>
                                <td className="py-2.5">
                                  <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1 rounded-full border ${
                                    recommendedStaff === 2
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
                          const availCount = dateAvails.length;
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
                                {availCount > 0 && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-600/10 border border-emerald-600/20 text-[#2E7D32] font-bold flex items-center gap-0.5" title={`${availCount} 位人員今日可用`}>
                                    🙋{availCount}
                                  </span>
                                )}

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
                      <div className="overflow-x-auto max-w-full">
                        <table className="w-full border-collapse text-left select-none table-fixed">
                          <thead>
                            <tr className="border-b border-[#DAC0A3]/50 bg-[#F5EBE6]/60">
                              {/* Sticky Employee Row Header */}
                              <th rowSpan={3} className="sticky left-0 z-20 bg-[#F5EBE6] px-4 py-4 text-xs font-black text-[#3E2723] border-r border-b border-[#DAC0A3]/50 w-[130px] shadow-[4px_0_8px_-4px_rgba(100,70,50,0.15)]">
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
                              allEmployees.map(empName => (
                                <tr key={empName} className="border-b border-[#DAC0A3]/40 hover:bg-[#FAF7F2]/30 transition-colors group">
                                  {/* Sticky Left Column Employee Initials */}
                                  <td className="sticky left-0 z-10 bg-[#FAF7F2]/95 group-hover:bg-[#F5EBE6] backdrop-blur-sm px-4 py-3.5 text-sm font-extrabold text-[#3E2723] border-r border-b border-[#DAC0A3]/40 shadow-[4px_0_8px_-4px_rgba(100,70,50,0.1)] w-[130px] h-[96px] align-middle">
                                    <div className="flex flex-col gap-1 justify-center h-full">
                                      <span className="truncate">👤 {empName}</span>
                                      {(() => {
                                        const matchingEmp = employees.find(
                                          e => e.name.trim().toLowerCase() === empName.trim().toLowerCase()
                                        );
                                        if (matchingEmp && matchingEmp.trainingPosition) {
                                          return (
                                            <span className="text-[10px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 w-fit font-bold select-none leading-none">
                                              📖 {matchingEmp.trainingPosition}
                                            </span>
                                          );
                                        }
                                        return null;
                                      })()}
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
                                      a => a.employeeName.trim().toLowerCase() === empName.toLowerCase() && a.date === dateStr
                                    ).sort((a, b) => compareTimeStrings(a.startTime, b.startTime));

                                    return (
                                      <td
                                        key={dateStr}
                                        onClick={() => setSelectedDateStr(dateStr)}
                                        className={`p-1.5 border-r border-[#DAC0A3]/40 text-center w-[100px] h-[96px] relative align-middle transition-colors ${isSelected ? 'bg-[#8D6E63]/5' : ''
                                          }`}
                                      >
                                        {empSchedules.length > 0 || empAvails.length > 0 ? (
                                          // Scheduled shifts + remaining availabilities (both shown together)
                                          <div className="space-y-0.5">
                                            {/* 1. Scheduled shifts */}
                                            {empSchedules.map(sched => {
                                              const theme = getScheduleTheme(sched);
                                              const cleanNote = getCleanNote(sched.notes);
                                              return (
                                                <div
                                                  key={sched.id}
                                                  onClick={(e) => handleOpenEditModal(sched, e)}
                                                  className={`text-xs py-1.5 px-2 rounded-md border font-semibold truncate cursor-pointer transition-all hover:scale-[1.02] ${theme.bg} ${theme.border} ${theme.text}`}
                                                  title={`👤 ${sched.employeeName} (${sched.startTime}-${sched.endTime}) @ 📍 ${sched.workplace}${cleanNote ? ` | 📝 ${cleanNote}` : ''}`}
                                                >
                                                  {sched.startTime}-{sched.endTime}
                                                  <div className="text-[10px] opacity-75 truncate">{sched.workplace}</div>
                                                  {cleanNote && (
                                                    <div className="text-[10px] opacity-90 truncate mt-0.5 leading-normal font-medium">
                                                      ({cleanNote})
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                            {/* 2. Remaining unconfirmed availabilities (always shown, even when schedules exist) */}
                                            {empAvails.map(avail => {
                                              const cleanNote = getCleanNote(avail.notes);
                                              return (
                                                <div
                                                  key={avail.id}
                                                  className="text-xs py-2 px-1 border border-dashed border-emerald-600/30 bg-[#E8F5E9]/50 text-[#2E7D32] font-black rounded-md relative group/btn flex flex-col justify-center items-center min-h-[72px] h-auto"
                                                  title={`可用時段: ${avail.startTime}-${avail.endTime} @ 📍 ${avail.workplace}${cleanNote ? ` | 📝 ${cleanNote}` : ''}`}
                                                >
                                                  <div className="text-[10px] font-mono leading-none font-bold">{avail.startTime}-{avail.endTime}</div>
                                                  <div className="text-[9px] opacity-75 mt-1 leading-none truncate w-full">{avail.workplace}</div>
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
                                            className="w-full h-full min-h-[72px] rounded-lg border border-transparent hover:border-[#8D6E63]/40 hover:bg-[#FAF7F2] transition-all flex items-center justify-center text-[#E5D3C3] hover:text-[#795548] cursor-pointer"
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
                              ))
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

                    {dayAvailabilities.length === 0 ? (
                      <div className="py-8 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-xl">
                        <p className="text-xs text-[#6D4C41]/80 font-medium">今日尚無同仁填寫可用時間</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {dayAvailabilities.map(avail => {
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
              {modalMode === 'create' && selectedDates.length === 1 && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider">
                    從今日登記可用人員中快速填入
                  </label>
                  {getAvailabilitiesForDate(selectedDates[0]).length === 0 ? (
                    <div className="text-[10px] text-[#6D4C41] py-2 px-3 bg-[#FAF7F2] rounded-xl border border-[#DAC0A3]/40 text-center">
                      此日無夥伴登記可用時間
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 p-2 bg-[#FAF7F2] rounded-xl border border-[#DAC0A3]/40">
                      <div className="flex flex-wrap gap-1.5">
                        {getAvailabilitiesForDate(selectedDates[0]).map(avail => {
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
              )}

              {/* Employee Name */}
              <div>
                <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">排班人員姓名</label>
                <select
                  required
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
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

                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => toggleDateSelection(dateStr)}
                            className={`relative py-1.5 px-0.5 rounded-lg border text-center transition-all cursor-pointer text-[10px] font-mono font-bold flex flex-col items-center justify-center ${isSelected
                                ? 'bg-[#795548]/15 border-[#795548] text-[#3E2723] shadow-xs'
                                : 'bg-white border-[#E5DCD5] text-[#8D6E63] hover:border-[#8D6E63] hover:bg-[#FAF7F2]'
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
                    {TIME_SLOTS.map(slot => (
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
                    {TIME_SLOTS.map(slot => (
                      <option key={slot} value={slot} className="bg-white text-[#3E2723] font-mono">
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Auto calculated hours warning/info */}
              {startTime && endTime && (
                <div className={`px-4 py-2.5 rounded-xl border flex items-center justify-between ${
                  isOverEightHours(startTime, endTime)
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-[#FAF7F2] border-[#E5DCD5]'
                }`}>
                  <span className="text-xs text-[#6D4C41]">預估單次工時：</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold font-mono ${
                      isOverEightHours(startTime, endTime) ? 'text-amber-700' : 'text-[#795548]'
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

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">備註項目 (選填)</label>
                <textarea
                  placeholder="班次注意事項、特別交辦事項..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm min-h-[70px] resize-none placeholder-[#8D6E63]/50"
                />
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
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                          hasCert
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
