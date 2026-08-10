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
  subscribeToStartDay,
  subscribeToOperatingStartTime,
  subscribeToOperatingEndTime,
  subscribeToShiftMorningStart,
  subscribeToShiftMorningEnd,
  subscribeToShiftPresets,
  subscribeToEmployeeOrder,
  updateEmployeeOrder,
  updateAvailability,
  subscribeToMonthlyRevenues,
  updateMonthlyRevenues,
  subscribeToRevenueStaffRules,
  subscribeToMarkedEmptyCells,
  updateMarkedEmptyCells,
  subscribeToErpDays,
  subscribeToPtAvailMode,
  subscribeToFilenamePrefix
} from './services/scheduler';
import type { PtAvailMode } from './services/scheduler';
import type { WorkSchedule, WorkerAvailability, StaffingTarget, Employee, ShiftPreset, RevenueStaffRules } from './services/scheduler';
import { isValidConfig } from './firebase';
import workplaces from './config/workplaces.json';

import { COLOR_THEMES } from './utils/constants';
import {
  safeConfirm,
  formatDateString,
  getMonthGridDates,
  getDaysInMonth,
  calculateDuration,
  isOverEightHours,
  hasSevenConsecutiveDays,
  getColorFromName,
  isShiftActiveAtHour,
  getManagerNote,
  getWorkerNote,
  compareTimeStrings
} from './utils/dateUtils';
import { exportToExcel, generateExcelWorkbook } from './utils/excelExport';

import { ContextMenu } from './components/modals/ContextMenu';
import { EmployeeModal } from './components/modals/EmployeeModal';
import { ShiftModal } from './components/modals/ShiftModal';
import { FTAssignModal } from './components/modals/FTAssignModal';

import { WorkerLogin } from './components/worker/WorkerLogin';
import { WorkerAvailForm } from './components/worker/WorkerAvailForm';
import { WorkerAvailModal } from './components/worker/WorkerAvailModal';

import { ManagerLogin } from './components/manager/ManagerLogin';
import { ManagerHeader } from './components/manager/ManagerHeader';
import { ManagerCalendarView } from './components/manager/ManagerCalendarView';
import { ManagerGridView } from './components/manager/ManagerGridView';
import { ManagerEmployeeView } from './components/manager/ManagerEmployeeView';
import { ManagerCalculationView } from './components/manager/ManagerCalculationView';
import { ManagerSystemView } from './components/manager/ManagerSystemView';
import { ManagerAnalysisView } from './components/manager/ManagerAnalysisView';
import { ManagerSelectedDateDetail } from './components/manager/ManagerSelectedDateDetail';

import * as XLSX from 'xlsx-js-style';
declare const google: any;

export interface WorkerAvailConfig {
  date: string;
  startIdx: number;
  endIdx: number;
  workplace: string;
  notes: string;
}

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

  // Manager view sub-mode
  const [managerViewMode, setManagerViewMode] = useState<'calendar' | 'grid' | 'employees' | 'calculation' | 'system' | 'analysis'>('calendar');
  const [deadlineDay, setDeadlineDay] = useState<number>(20);
  const [startDay, setStartDay] = useState<number>(15);
  const [operatingStartTime, setOperatingStartTime] = useState<string>('06:30');
  const [operatingEndTime, setOperatingEndTime] = useState<string>('20:00');
  const [shiftMorningStart, setShiftMorningStart] = useState<string>('06:30');
  const [shiftMorningEnd, setShiftMorningEnd] = useState<string>('15:30');
  const [shiftPresets, setShiftPresets] = useState<ShiftPreset[]>([]);
  const [employeeOrder, setEmployeeOrder] = useState<string[]>([]);
  const [erpDays, setErpDays] = useState<number[]>([1, 3, 5]);
  const [ptAvailMode, setPtAvailMode] = useState<PtAvailMode>('static');
  const [filenamePrefix, setFilenamePrefix] = useState<string>('');

  const defaultShiftStart = useMemo(() => {
    if (shiftPresets && shiftPresets.length > 0) {
      return shiftPresets[0].startTime;
    }
    return shiftMorningStart || '06:30';
  }, [shiftPresets, shiftMorningStart]);

  const defaultShiftEnd = useMemo(() => {
    if (shiftPresets && shiftPresets.length > 0) {
      return shiftPresets[0].endTime;
    }
    return shiftMorningEnd || '15:30';
  }, [shiftPresets, shiftMorningEnd]);


  const timeSlots = useMemo(() => {
    if (!operatingStartTime || !operatingEndTime) return [];
    const [startH, startM] = operatingStartTime.split(':').map(Number);
    const [endH, endM] = operatingEndTime.split(':').map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return [];

    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    if (endMinutes < startMinutes) {
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

  const analysisHoursRange = useMemo(() => {
    if (!operatingStartTime || !operatingEndTime) return Array.from({ length: 14 }, (_, i) => i + 6);
    const [startH] = operatingStartTime.split(':').map(Number);
    const [endH, endM] = operatingEndTime.split(':').map(Number);

    const start = startH;
    let end = endM > 0 ? endH : endH - 1;

    if (isNaN(start) || isNaN(end)) return Array.from({ length: 14 }, (_, i) => i + 6);

    if (end < start) {
      end += 24;
    }

    const list: number[] = [];
    for (let h = start; h <= end; h++) {
      list.push(h % 24);
    }
    return list;
  }, [operatingStartTime, operatingEndTime]);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY > 80) {
        setIsScrolled(true);
      } else if (scrollY < 20) {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  const [monthlyRevenues, setMonthlyRevenues] = useState<Record<number, number>>({});
  const [revenueStaffRules, setRevenueStaffRules] = useState<RevenueStaffRules>({
    tier1Limit: 1500,
    tier2Limit: 2500,
    tier3Limit: 3500,
    tier1Staff: 2,
    tier2Staff: 3,
    tier3Staff: 4,
    tier4Staff: 5,
    incrementAmount: 1000,
    maxStaff: 8
  });
  const [tempRules, setTempRules] = useState<RevenueStaffRules>({
    tier1Limit: 1500,
    tier2Limit: 2500,
    tier3Limit: 3500,
    tier1Staff: 2,
    tier2Staff: 3,
    tier3Staff: 4,
    tier4Staff: 5,
    incrementAmount: 1000,
    maxStaff: 8
  });

  const getRecommendedStaff = (dailyAvg: number, rules: RevenueStaffRules) => {
    const { tier1Limit, tier2Limit, tier3Limit, tier1Staff, tier2Staff, tier3Staff, tier4Staff, incrementAmount, maxStaff } = rules;
    if (dailyAvg <= tier1Limit) {
      return tier1Staff;
    } else if (dailyAvg <= tier2Limit) {
      return tier2Staff;
    } else if (dailyAvg <= tier3Limit) {
      return tier3Staff;
    } else {
      const extraAmount = dailyAvg - tier3Limit;
      const extraStaff = Math.floor(extraAmount / incrementAmount);
      return Math.min(maxStaff, tier4Staff + extraStaff);
    }
  };

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [employeeFormMode, setEmployeeFormMode] = useState<'create' | 'edit'>('create');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);

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

  const [empSearch, setEmpSearch] = useState('');
  const [empStatusFilter, setEmpStatusFilter] = useState<'all' | '正式夥伴' | '兼職夥伴'>('all');
  const [empActiveFilter, setEmpActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const [workerName, setWorkerName] = useState(() => localStorage.getItem('scheduler_worker_name') || '');
  const [isWorkerVerified, setIsWorkerVerified] = useState(() => localStorage.getItem('scheduler_worker_verified') === 'true' && !!localStorage.getItem('scheduler_worker_name'));

  const loggedInEmployee = employees.find(
    emp => emp.name.trim().toLowerCase() === workerName.trim().toLowerCase() && emp.active !== false
  );
  const isFullTime = loggedInEmployee?.status === '正式夥伴';

  const [selectedWorkerName, setSelectedWorkerName] = useState('');
  const [workerPhoneInput, setWorkerPhoneInput] = useState('');
  const [workerVerifyError, setWorkerVerifyError] = useState('');

  const [availNotes, setAvailNotes] = useState('');
  const [availSelectedDates, setAvailSelectedDates] = useState<string[]>([]);
  const [isWorkerAvailModalOpen, setIsWorkerAvailModalOpen] = useState(false);
  const [availConfigs, setAvailConfigs] = useState<WorkerAvailConfig[]>([]);

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFTAssignModalOpen, setIsFTAssignModalOpen] = useState(false);
  const [pendingAssignAvail, setPendingAssignAvail] = useState<WorkerAvailability | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; schedule?: WorkSchedule; emptyCell?: { employeeName: string; dateStr: string };
  } | null>(null);

  const [markedEmptyCells, setMarkedEmptyCells] = useState<Record<string, boolean>>({});

  const [employeeName, setEmployeeName] = useState('');
  const [workplace, setWorkplace] = useState(workplaces[0]?.name || '');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [workerNotes, setWorkerNotes] = useState('');
  const [registerTime, setRegisterTime] = useState('');
  const [formOriginalStartTime, setFormOriginalStartTime] = useState<string | null>(null);
  const [formOriginalEndTime, setFormOriginalEndTime] = useState<string | null>(null);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [singleDate, setSingleDate] = useState('');

  const pickerDates = getMonthGridDates(currentMonthStart);

  const workerNextMonthStart = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  }, []);
  const workerCalendarGridDates = getMonthGridDates(workerNextMonthStart);
  const workerDaysInMonth = getDaysInMonth(workerNextMonthStart);

  const isWorkerEditable = useMemo(() => {
    if (!workerName.trim()) return true;
    const targetMonthStr = formatDateString(workerNextMonthStart).substring(0, 7);
    const hasConfirmed = schedules.some(
      s => s.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase() &&
        s.date.startsWith(targetMonthStr)
    );
    const todayNum = new Date().getDate();
    if (todayNum < startDay) return false;
    return (todayNum <= deadlineDay) || !hasConfirmed;
  }, [workerName, workerNextMonthStart, schedules, startDay, deadlineDay]);

  const handleTagClick = (pos: '餐吧' | 'POS機' | '後吧' | '收班' | '開早') => {
    if (empTrainingPos === pos) {
      setEmpTrainingPos(null);
      setEmpTrainedPoss(prev => (prev.includes(pos) ? prev : [...prev, pos]));
    } else if (empTrainedPoss.includes(pos)) {
      setEmpTrainedPoss(prev => prev.filter(p => p !== pos));
    } else {
      if (!empTrainingPos) {
        setEmpTrainingPos(pos);
      } else {
        setEmpTrainedPoss(prev => (prev.includes(pos) ? prev : [...prev, pos]));
        setEmpTrainingPos(null);
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
    setEmpTrainedPoss(prev => (prev.includes(pos) ? prev : [...prev, pos]));
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
    const unsubSchedules = subscribeToSchedules((data) => setSchedules(data));
    const unsubAvailabilities = subscribeToAvailabilities((data) => setAvailabilities(data));
    const unsubStaffingTargets = subscribeToStaffingTargets((data) => setStaffingTargets(data));
    const unsubEmployees = subscribeToEmployees((data) => setEmployees(data));
    const unsubDeadlineDay = subscribeToDeadlineDay((day) => setDeadlineDay(day));
    const unsubStartDay = subscribeToStartDay((day) => setStartDay(day));
    const unsubOperatingStartTime = subscribeToOperatingStartTime((time) => setOperatingStartTime(time));
    const unsubOperatingEndTime = subscribeToOperatingEndTime((time) => setOperatingEndTime(time));
    const unsubShiftMorningStart = subscribeToShiftMorningStart((time) => setShiftMorningStart(time));
    const unsubShiftMorningEnd = subscribeToShiftMorningEnd((time) => setShiftMorningEnd(time));
    const unsubShiftPresets = subscribeToShiftPresets((data) => setShiftPresets(data));
    const unsubEmployeeOrder = subscribeToEmployeeOrder((data) => setEmployeeOrder(data));
    const unsubMonthlyRevenues = subscribeToMonthlyRevenues((data) => setMonthlyRevenues(data));
    const unsubRevenueStaffRules = subscribeToRevenueStaffRules((rules) => {
      setRevenueStaffRules(rules);
      setTempRules(rules);
    });
    const unsubMarkedEmptyCells = subscribeToMarkedEmptyCells((cells) => setMarkedEmptyCells(cells));
    const unsubErpDays = subscribeToErpDays((days) => setErpDays(days));
    const unsubPtAvailMode = subscribeToPtAvailMode((mode) => setPtAvailMode(mode));
    const unsubFilenamePrefix = subscribeToFilenamePrefix((prefix) => setFilenamePrefix(prefix));

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
      unsubShiftPresets();
      unsubEmployeeOrder();
      unsubMonthlyRevenues();
      unsubRevenueStaffRules();
      unsubMarkedEmptyCells();
      unsubErpDays();
      unsubPtAvailMode();
      unsubFilenamePrefix();
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

  const dbRestDates = useMemo(() => {
    if (!isFullTime || !workerName.trim()) return [];
    const targetMonthStr = formatDateString(workerNextMonthStart).substring(0, 7);
    const workerAvails = availabilities.filter(
      a => a.employeeName.trim().toLowerCase() === workerName.trim().toLowerCase() &&
        a.date.startsWith(targetMonthStr)
    );
    if (workerAvails.length === 0) return [];

    const explicitRestDates = workerAvails
      .filter(a => a.startTime === '00:00' && a.endTime === '00:00')
      .map(a => a.date);

    const legacyWorkAvails = workerAvails.filter(a => !(a.startTime === '00:00' && a.endTime === '00:00'));
    if (legacyWorkAvails.length > 0) {
      const workDates = legacyWorkAvails.map(a => a.date);
      const daysInMonth = getDaysInMonth(workerNextMonthStart);
      const computedRestDates = daysInMonth
        .map(formatDateString)
        .filter(dateStr => !workDates.includes(dateStr));
      return Array.from(new Set([...explicitRestDates, ...computedRestDates])).sort();
    }

    return explicitRestDates.sort();
  }, [availabilities, workerName, isFullTime, workerNextMonthStart]);

  const lastSyncedDbRestDatesRef = useRef<string[]>([]);

  useEffect(() => {
    const isDbChanged = dbRestDates.length !== lastSyncedDbRestDatesRef.current.length ||
      !dbRestDates.every((d, i) => d === lastSyncedDbRestDatesRef.current[i]);

    if (isDbChanged) {
      lastSyncedDbRestDatesRef.current = dbRestDates;
      setAvailSelectedDates(dbRestDates);
    }
  }, [dbRestDates]);

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

  const handleApplyRevenuesToGlobalTargets = async () => {
    if (safeConfirm('確定要將此營業額計算出的建議人數，套用為系統的預設排班目標 (db-global) 嗎？\n這將直接覆蓋目前的預設排班人數需求。')) {
      try {
        for (const hour of analysisHoursRange) {
          const monthlyVal = monthlyRevenues[hour] || 0;
          const dailyAvg = monthlyVal / 30;
          const recommendedStaff = getRecommendedStaff(dailyAvg, revenueStaffRules);
          await updateStaffingTarget(hour, recommendedStaff);
        }
        alert('已成功將營業額建議人數套用為預設排班目標需求！');
      } catch (error) {
        console.error("Failed to apply revenue targets: ", error);
        alert('套用預設目標失敗，請重試。');
      }
    }
  };

  const handleResetRevenues = async () => {
    if (safeConfirm('確定要清空所有時段的月營業額輸入數據嗎？')) {
      try {
        await updateMonthlyRevenues({});
      } catch (error) {
        console.error("Failed to reset monthly revenues: ", error);
      }
    }
  };

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

        for (const record of existingRecords) {
          await deleteAvailability(record.id);
        }

        const activeMonthDays = getDaysInMonth(workerNextMonthStart);
        const workDays = activeMonthDays
          .map(formatDateString)
          .filter(dateStr => !availSelectedDates.includes(dateStr));

        for (const dateStr of workDays) {
          await addAvailability({
            employeeName: workerName.trim(),
            date: dateStr,
            workplace: workplaces[0]?.name || '',
            startTime: defaultShiftStart,
            endTime: defaultShiftEnd,
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

  const handleOpenWorkerAvailModal = () => {
    if (!workerName.trim()) {
      alert('請先輸入您的姓名。');
      return;
    }

    if (availSelectedDates.length === 0) {
      alert('請至少選擇一個可用日期。');
      return;
    }

    const sortedDates = [...availSelectedDates].sort((a, b) => a.localeCompare(b));

    const initialConfigs: WorkerAvailConfig[] = sortedDates.map(date => {
      const inSession = availConfigs.find(c => c.date === date);
      if (inSession) return inSession;

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

      const defStart = Math.max(0, timeSlots.indexOf(defaultShiftStart));
      const defEnd = Math.max(0, timeSlots.indexOf(defaultShiftEnd));
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

  const updateAvailConfig = (index: number, updates: Partial<WorkerAvailConfig>) => {
    setAvailConfigs(prev => prev.map((config, idx) => {
      if (idx === index) {
        const newConfig = { ...config, ...updates };
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

  const removeAvailConfig = (index: number) => {
    const configToRemove = availConfigs[index];
    if (!configToRemove) return;

    setAvailConfigs(prev => prev.filter((_, idx) => idx !== index));
    setAvailSelectedDates(prev => prev.filter(d => d !== configToRemove.date));
  };

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
      for (const config of availConfigs) {
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

    try {
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

  const getStaffingTargetForHour = (hour: number, dateStr?: string): number => {
    const targetDate = dateStr || selectedDateStr;
    const dateMatch = staffingTargets.find(t => t.hour === hour && t.date === targetDate);
    if (dateMatch) return dateMatch.targetCount;

    const globalMatch = staffingTargets.find(t => t.hour === hour && !t.date);
    if (globalMatch) return globalMatch.targetCount;

    return 2;
  };

  const toggleAvailDateSelection = (dateStr: string) => {
    if (availSelectedDates.includes(dateStr)) {
      setAvailSelectedDates(availSelectedDates.filter(d => d !== dateStr));
    } else {
      setAvailSelectedDates([...availSelectedDates, dateStr]);
    }
  };

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

    const originalAvail = availabilities.find(a => a.id === schedule.availabilityId);
    if (originalAvail) {
      setRegisterTime(`${originalAvail.startTime} - ${originalAvail.endTime}`);
    } else {
      const fallbackAvail = availabilities.find(
        a => a.employeeName.trim().toLowerCase() === schedule.employeeName.trim().toLowerCase() && a.date === schedule.date
      );
      if (fallbackAvail) {
        setRegisterTime(`${fallbackAvail.startTime} - ${fallbackAvail.endTime}`);
      } else {
        setRegisterTime('');
      }
    }

    setIsModalOpen(true);
  };

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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (safeConfirm('確定要刪除此排程紀錄嗎？')) {
      try {
        const scheduleToDelete = schedules.find(s => s.id === id);
        await deleteSchedule(id);
        if (scheduleToDelete?.availabilityId) {
          await updateAvailability(scheduleToDelete.availabilityId, { confirmed: false });
        }
        setIsModalOpen(false);
      } catch (error) {
        console.error("Error deleting schedule: ", error);
      }
    }
  };

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

    const avail = id.startsWith('virtual-off-') ? null : availabilities.find(a => a.id === id);
    const isRestDay = id.startsWith('virtual-off-') || (avail && avail.startTime === '00:00' && avail.endTime === '00:00');

    if (isRestDay) {
      const dateStr = id.startsWith('virtual-off-') ? id.replace('virtual-off-', '') : avail!.date;
      const targetMonthStr = dateStr.substring(0, 7);

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
        if (safeConfirm(`這是您本月最後一個休假日期。變更此日期將會清除您本月的整月排班登記（避免因無休息日而違反連續工作規定）。確定要清除所有登記嗎？`)) {
          try {
            for (const record of workerAvails) {
              await deleteAvailability(record.id);
            }
          } catch (error) {
            console.error("Error clearing availabilities: ", error);
          }
        }
        return;
      }

      if (safeConfirm(`確定要將 ${dateStr} 的休假改為配合排班（${defaultShiftStart}-${defaultShiftEnd}）嗎？`)) {
        try {
          if (avail) {
            await deleteAvailability(avail.id);
          }
          await addAvailability({
            employeeName: workerName.trim(),
            date: dateStr,
            workplace: workplaces[0]?.name || '',
            startTime: defaultShiftStart,
            endTime: defaultShiftEnd,
            notes: ''
          });
        } catch (error) {
          console.error("Error changing rest day to work day: ", error);
        }
      }
      return;
    }

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
      setStartTime(defaultShiftStart);
      setEndTime(defaultShiftEnd);

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
    if (schedule.markedBlue) return COLOR_THEMES.lightBlue;
    return COLOR_THEMES.indigo;
  };

  const handleToggleMarkBlue = async (schedule: WorkSchedule) => {
    try {
      await updateSchedule(schedule.id, { markedBlue: !schedule.markedBlue });
    } catch (err) {
      console.error('Failed to toggle mark blue:', err);
    }
    setContextMenu(null);
  };

  const handleToggleMarkEmptyCellBlue = async (employeeName: string, dateStr: string) => {
    const key = `${employeeName.trim().toLowerCase()}|${dateStr}`;
    const next = { ...markedEmptyCells };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = true;
    }
    try {
      await updateMarkedEmptyCells(next);
    } catch (err) {
      console.error('Failed to toggle mark empty cell blue:', err);
    }
    setContextMenu(null);
  };

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

  const visibleSchedules = schedules.filter(item => {
    if (!item.date) return false;
    const [y, m] = item.date.split('-').map(Number);
    return y === currentMonthStart.getFullYear() && m === (currentMonthStart.getMonth() + 1);
  });

  const totalShifts = visibleSchedules.length;
  const totalHours = visibleSchedules.reduce((sum, item) => sum + calculateDuration(item.startTime, item.endTime), 0);
  const totalEmployees = new Set(visibleSchedules.map(item => item.employeeName.trim().toLowerCase()).filter(Boolean)).size;

  const handleExportToExcel = () => {
    exportToExcel({
      exportStartDate,
      exportEndDate,
      schedules,
      availabilities,
      allEmployees,
      employees,
      markedEmptyCells,
      getDayNote,
      erpDays,
      filenamePrefix
    });
  };

  const uploadToGoogleDrive = async (token: string, filename: string, blob: Blob) => {
    try {
      setIsUploadingExcel(true);
      setUploadExcelStatus('idle');

      const reader = new FileReader();
      reader.readAsArrayBuffer(blob);
      reader.onloadend = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const boundary = 'foo_bar_baz';
          const delimiter = `\r\n--${boundary}\r\n`;
          const closeDelimiter = `\r\n--${boundary}--`;

          const metadata = {
            name: filename,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          };

          const metadataPart =
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata);

          const mediaHeader =
            'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n' +
            'Content-Transfer-Encoding: base64\r\n\r\n';

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
    const result = generateExcelWorkbook({
      exportStartDate,
      exportEndDate,
      schedules,
      availabilities,
      allEmployees,
      employees,
      markedEmptyCells,
      getDayNote,
      erpDays,
      filenamePrefix
    });
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
      {/* Sticky Top Header Bar - Constant Height */}
      <header
        className={`sticky top-0 z-40 w-full transition-all duration-300 ease-out ${
          isScrolled
            ? 'bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#DAC0A3]/60 shadow-md py-3 px-4 md:px-8'
            : 'bg-transparent py-4 md:py-6 px-4 md:px-8'
        }`}
      >
        <div
          className={`max-w-7xl mx-auto transition-all duration-300 ease-out flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
            isScrolled
              ? 'bg-transparent p-4 md:p-5 rounded-none border-transparent shadow-none'
              : 'bg-white/70 p-6 md:p-8 rounded-2xl border border-[#DAC0A3]/50 backdrop-blur-md shadow-sm relative overflow-hidden'
          }`}
        >
          {/* Background blur circle when at top */}
          {!isScrolled && (
            <div className="absolute top-0 right-0 w-80 h-80 bg-[#8D6E63]/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none transition-opacity duration-300"></div>
          )}

          <div className="space-y-1.5 z-10">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#5D4037] via-[#8D6E63] to-[#A1887F] bg-clip-text text-transparent flex items-center gap-2">
                {import.meta.env.VITE_APP_TITLE ? `${import.meta.env.VITE_APP_TITLE} ` : ''}精品咖啡館 ☕ 夥伴排班系統
              </h1>
              {isValidConfig ? (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-600/10 border border-emerald-600/20 text-[#2E7D32]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32] animate-ping"></span>
                  雲端同步已啟用
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#8D6E63]/10 border border-[#8D6E63]/20 text-[#6D4C41]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8D6E63]"></span>
                  本機儲存 (LocalStorage)
                </span>
              )}
            </div>
            {!isScrolled && (
              <p className="text-[#6D4C41]/80 text-xs md:text-sm font-medium animate-fade-in">
                提供排班夥伴登記可用時段與店長排班規劃，支援咖啡館人力覆蓋率與工時即時同步。
              </p>
            )}
          </div>

          {activeRole === 'manager' && isAuthenticated && (
            <div className="z-10 flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={() => handleOpenAddModal(selectedDateStr)}
                className="bg-[#795548] hover:bg-[#6D4C41] text-white font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-[#795548]/15 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                新增排班紀錄
              </button>
              <button
                onClick={handleLogout}
                className="bg-white hover:bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] hover:text-[#3E2723] font-semibold px-3.5 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                title="登出管理模式"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

        {/* Role Switcher */}
        {isAuthenticated && (
          <div className="flex justify-center">
            <div className="bg-white/60 p-1.5 rounded-2xl border border-[#DAC0A3]/50 backdrop-blur-md flex gap-2 shadow-sm">
              <button
                onClick={() => { window.location.hash = '#/worker'; }}
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
                onClick={() => { window.location.hash = '#/manager'; }}
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
            <WorkerLogin
              employees={employees}
              selectedWorkerName={selectedWorkerName}
              setSelectedWorkerName={setSelectedWorkerName}
              workerPhoneInput={workerPhoneInput}
              setWorkerPhoneInput={setWorkerPhoneInput}
              workerVerifyError={workerVerifyError}
              onVerify={handleWorkerVerify}
            />
          ) : (
            <WorkerAvailForm
              workerName={workerName}
              isFullTime={isFullTime}
              workerNextMonthStart={workerNextMonthStart}
              isWorkerEditable={isWorkerEditable}
              startDay={startDay}
              deadlineDay={deadlineDay}
              availSelectedDates={availSelectedDates}
              workerCalendarGridDates={workerCalendarGridDates}
              availNotes={availNotes}
              setAvailNotes={setAvailNotes}
              onWorkerLogout={handleWorkerLogout}
              onAddAvailability={handleAddAvailability}
              onOpenWorkerAvailModal={handleOpenWorkerAvailModal}
              toggleAvailDateSelection={toggleAvailDateSelection}
              handleSelectAvailMonWedFri={handleSelectAvailMonWedFri}
              handleSelectAvailTueThu={handleSelectAvailTueThu}
              handleSelectAvailAllDays={handleSelectAvailAllDays}
              handleClearAvailAllSelected={handleClearAvailAllSelected}
              getWorkerDisplayAvailabilities={getWorkerDisplayAvailabilities}
              handleEditAvailability={handleEditAvailability}
              handleDeleteAvailability={handleDeleteAvailability}
            />
          )
        )}

        {/* MANAGER ROLE VIEW */}
        {activeRole === 'manager' && (
          !isAuthenticated ? (
            <ManagerLogin
              passcodeInput={passcodeInput}
              setPasscodeInput={setPasscodeInput}
              loginError={loginError}
              onLogin={handleLogin}
            />
          ) : (
            <div className="space-y-6">
              <ManagerHeader
                currentMonthStart={currentMonthStart}
                managerViewMode={managerViewMode}
                setManagerViewMode={setManagerViewMode}
                handleGoToToday={handleGoToToday}
                handlePrevMonth={handlePrevMonth}
                handleNextMonth={handleNextMonth}
                totalShifts={totalShifts}
                totalHours={totalHours}
                totalEmployees={totalEmployees}
              />

              {managerViewMode === 'employees' ? (
                <ManagerEmployeeView
                  employees={employees}
                  empSearch={empSearch}
                  setEmpSearch={setEmpSearch}
                  empActiveFilter={empActiveFilter}
                  setEmpActiveFilter={setEmpActiveFilter}
                  empStatusFilter={empStatusFilter}
                  setEmpStatusFilter={setEmpStatusFilter}
                  handleOpenEmployeeModal={handleOpenEmployeeModal}
                  handleDeleteEmployee={handleDeleteEmployee}
                />
              ) : managerViewMode === 'calculation' ? (
                <ManagerCalculationView
                  revenueStaffRules={revenueStaffRules}
                  monthlyRevenues={monthlyRevenues}
                  setMonthlyRevenues={setMonthlyRevenues}
                  staffingTargets={staffingTargets}
                  analysisHoursRange={analysisHoursRange}
                  handleApplyRevenuesToGlobalTargets={handleApplyRevenuesToGlobalTargets}
                  handleResetRevenues={handleResetRevenues}
                  getRecommendedStaff={getRecommendedStaff}
                  updateMonthlyRevenues={updateMonthlyRevenues}
                />
              ) : managerViewMode === 'analysis' ? (
                <ManagerAnalysisView
                  currentMonthStart={currentMonthStart}
                  schedules={schedules}
                  employees={employees}
                  analysisHoursRange={analysisHoursRange}
                  totalHours={totalHours}
                  getStaffingTargetForHour={getStaffingTargetForHour}
                />
              ) : managerViewMode === 'system' ? (
                <ManagerSystemView
                  operatingStartTime={operatingStartTime}
                  setOperatingStartTime={setOperatingStartTime}
                  operatingEndTime={operatingEndTime}
                  setOperatingEndTime={setOperatingEndTime}
                  startDay={startDay}
                  setStartDay={setStartDay}
                  deadlineDay={deadlineDay}
                  setDeadlineDay={setDeadlineDay}
                  shiftPresets={shiftPresets}
                  setShiftPresets={setShiftPresets}
                  tempRules={tempRules}
                  setTempRules={setTempRules}
                  setRevenueStaffRules={setRevenueStaffRules}
                  erpDays={erpDays}
                  setErpDays={setErpDays}
                  ptAvailMode={ptAvailMode}
                  setPtAvailMode={setPtAvailMode}
                  filenamePrefix={filenamePrefix}
                  setFilenamePrefix={setFilenamePrefix}
                />
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
                        className={`font-bold text-xs px-4.5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer border ${isUploadingExcel
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

                  {managerViewMode === 'calendar' ? (
                    <ManagerCalendarView
                      monthGridDates={monthGridDates}
                      todayStr={formatDateString(new Date())}
                      selectedDateStr={selectedDateStr}
                      setSelectedDateStr={setSelectedDateStr}
                      currentMonthStart={currentMonthStart}
                      getSchedulesForDate={getSchedulesForDate}
                      getDateTotalHours={getDateTotalHours}
                      getAvailabilitiesForDate={getAvailabilitiesForDate}
                      getIsDayUnderstaffed={getIsDayUnderstaffed}
                      getScheduleTheme={getScheduleTheme}
                      handleOpenAddModal={handleOpenAddModal}
                      handleOpenEditModal={handleOpenEditModal}
                    />
                  ) : (
                    <ManagerGridView
                      gridContainerRef={gridContainerRef}
                      gridDates={gridDates}
                      todayStr={formatDateString(new Date())}
                      selectedDateStr={selectedDateStr}
                      setSelectedDateStr={setSelectedDateStr}
                      allEmployees={allEmployees}
                      employees={employees}
                      schedules={schedules}
                      availabilities={availabilities}
                      markedEmptyCells={markedEmptyCells}
                      activeRole={activeRole}
                      setContextMenu={setContextMenu}
                      getDateTotalHours={getDateTotalHours}
                      getIsDayUnderstaffed={getIsDayUnderstaffed}
                      getDayNote={getDayNote}
                      handleUpdateDayNote={handleUpdateDayNote}
                      handleMoveEmployeeUp={handleMoveEmployeeUp}
                      handleMoveEmployeeDown={handleMoveEmployeeDown}
                      getScheduleTheme={getScheduleTheme}
                      getManagerNote={getManagerNote}
                      handleOpenEditModal={handleOpenEditModal}
                      handleInstantAssign={handleInstantAssign}
                      setModalMode={setModalMode}
                      setEditingId={setEditingId}
                      setEmployeeName={setEmployeeName}
                      setWorkplace={setWorkplace}
                      setStartTime={setStartTime}
                      setEndTime={setEndTime}
                      setNotes={setNotes}
                      setSelectedDates={setSelectedDates}
                      setFormOriginalStartTime={setFormOriginalStartTime}
                      setFormOriginalEndTime={setFormOriginalEndTime}
                      setIsModalOpen={setIsModalOpen}
                      erpDays={erpDays}
                    />
                  )}

                  <ManagerSelectedDateDetail
                    selectedDateStr={selectedDateStr}
                    setSelectedDateStr={setSelectedDateStr}
                    schedules={schedules}
                    availabilities={availabilities}
                    employees={employees}
                    analysisHoursRange={analysisHoursRange}
                    getScheduleTheme={getScheduleTheme}
                    getManagerNote={getManagerNote}
                    handleOpenEditModal={handleOpenEditModal}
                    handleDelete={handleDelete}
                    handleInstantAssign={handleInstantAssign}
                    setModalMode={setModalMode}
                    setEditingId={setEditingId}
                    setEmployeeName={setEmployeeName}
                    setWorkplace={setWorkplace}
                    setStartTime={setStartTime}
                    setEndTime={setEndTime}
                    setNotes={setNotes}
                    setSelectedDates={setSelectedDates}
                    setFormOriginalStartTime={setFormOriginalStartTime}
                    setFormOriginalEndTime={setFormOriginalEndTime}
                    setIsModalOpen={setIsModalOpen}
                    getStaffingTargetForHour={getStaffingTargetForHour}
                    updateStaffingTarget={updateStaffingTarget}
                  />
                </>
              )}
            </div>
          )
        )}
      </div>

      {/* Shared Modals */}
      <WorkerAvailModal
        isWorkerAvailModalOpen={isWorkerAvailModalOpen}
        setIsWorkerAvailModalOpen={setIsWorkerAvailModalOpen}
        availConfigs={availConfigs}
        workerName={workerName}
        timeSlots={timeSlots}
        availabilities={availabilities}
        handleSyncAllAvailConfigs={handleSyncAllAvailConfigs}
        updateAvailConfig={updateAvailConfig}
        removeAvailConfig={removeAvailConfig}
        handleWorkerAvailModalSubmit={handleWorkerAvailModalSubmit}
        ptAvailMode={ptAvailMode}
      />

      <FTAssignModal
        isFTAssignModalOpen={isFTAssignModalOpen}
        pendingAssignAvail={pendingAssignAvail}
        shiftPresets={shiftPresets}
        timeSlots={timeSlots}
        onClose={() => {
          setIsFTAssignModalOpen(false);
          setPendingAssignAvail(null);
        }}
        onExecuteFTAssign={executeFTAssign}
      />

      <ShiftModal
        isOpen={isModalOpen}
        mode={modalMode}
        editingId={editingId}
        employeeName={employeeName}
        setEmployeeName={setEmployeeName}
        workplace={workplace}
        setWorkplace={setWorkplace}
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
        notes={notes}
        setNotes={setNotes}
        workerNotes={workerNotes}
        registerTime={registerTime}
        selectedDates={selectedDates}
        setSelectedDates={setSelectedDates}
        singleDate={singleDate}
        setSingleDate={setSingleDate}
        pickerDates={pickerDates}
        timeSlots={timeSlots}
        shiftPresets={shiftPresets}
        employees={employees}
        schedules={schedules}
        availabilities={availabilities}
        currentMonthStart={currentMonthStart}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        handleEmployeeNameChange={handleEmployeeNameChange}
        getAvailabilitiesForDate={getAvailabilitiesForDate}
        toggleDateSelection={toggleDateSelection}
        handleSelectAllDays={handleSelectAllDays}
        handleSelectMonWedFri={handleSelectMonWedFri}
        handleSelectTueThu={handleSelectTueThu}
        handleClearAllSelected={handleClearAllSelected}
        setFormOriginalStartTime={setFormOriginalStartTime}
        setFormOriginalEndTime={setFormOriginalEndTime}
      />

      <EmployeeModal
        isOpen={isEmployeeModalOpen}
        mode={employeeFormMode}
        empName={empName}
        setEmpName={setEmpName}
        empPhone={empPhone}
        setEmpPhone={setEmpPhone}
        empStatus={empStatus}
        setEmpStatus={setEmpStatus}
        empActive={empActive}
        setEmpActive={setEmpActive}
        empIsNewcomer={empIsNewcomer}
        setEmpIsNewcomer={setEmpIsNewcomer}
        empTrainingPos={empTrainingPos}
        setEmpTrainingPos={setEmpTrainingPos}
        empTrainedPoss={empTrainedPoss}
        setEmpTrainedPoss={setEmpTrainedPoss}
        empCertificates={empCertificates}
        setEmpCertificates={setEmpCertificates}
        onClose={() => setIsEmployeeModalOpen(false)}
        onSubmit={handleEmployeeSubmit}
        handleTagClick={handleTagClick}
        handleDragStart={handleDragStart}
        handleDropToAvailable={handleDropToAvailable}
        handleDropToTraining={handleDropToTraining}
        handleDropToTrained={handleDropToTrained}
      />

      <ContextMenu
        contextMenu={contextMenu}
        markedEmptyCells={markedEmptyCells}
        onClose={() => setContextMenu(null)}
        onToggleMarkBlue={handleToggleMarkBlue}
        onToggleMarkEmptyCellBlue={handleToggleMarkEmptyCellBlue}
      />
    </div>
  );
}

export default App;
