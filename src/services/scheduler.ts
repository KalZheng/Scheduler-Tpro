import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot,
  query,
  orderBy,
  setDoc
} from 'firebase/firestore';
import { db, isValidConfig } from '../firebase';

export interface WorkSchedule {
  id: string;
  title: string;
  employeeName: string;
  date: string; // "YYYY-MM-DD"
  workplace: string; // E.g., "台北總部"
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  color: string;     // e.g. "emerald", "indigo", "violet", "amber", "rose"
  notes?: string;
  workerNotes?: string;
  managerNotes?: string;
  createdAt: number;
  originalStartTime?: string | null;
  originalEndTime?: string | null;
}

export interface WorkerAvailability {
  id: string;
  employeeName: string;
  date: string; // "YYYY-MM-DD"
  workplace: string;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  notes?: string;
  createdAt: number;
}

export interface StaffingTarget {
  id: string;
  hour: number; // 0 to 23
  targetCount: number;
  date?: string; // Optional specific date
  note?: string; // Optional custom daily note
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  status: '正式夥伴' | '兼職夥伴';
  active: boolean;
  isNewcomer?: boolean; // 新進夥伴
  trainingPosition?: '餐吧' | 'POS機' | '後吧' | '收班' | '開早' | null; // 訓練中崗位 (最多一個)
  trainedPositions: ('餐吧' | 'POS機' | '後吧' | '收班' | '開早')[]; // 已受訓合格崗位 (可多選)
  certificates?: ('FBI' | '黃金吧檯手')[]; // 持有證照 (可多選)
  createdAt: number;
}

export const migrateEmployee = (emp: any): Employee => {
  let status = emp.status;
  if (status === '正式') status = '正式夥伴';
  if (status === '訓練') status = '兼職夥伴';
  if (status !== '正式夥伴' && status !== '兼職夥伴') {
    status = '兼職夥伴';
  }
  return {
    id: emp.id,
    name: emp.name || '',
    phone: emp.phone || '',
    status: status as '正式夥伴' | '兼職夥伴',
    active: emp.active !== false,
    isNewcomer: !!emp.isNewcomer,
    trainingPosition: emp.trainingPosition || null,
    trainedPositions: emp.trainedPositions || [],
    certificates: emp.certificates || [],
    createdAt: emp.createdAt || Date.now()
  };
};

// Local Storage & Local File DB fallback mechanism
let localListeners: ((schedules: WorkSchedule[]) => void)[] = [];
let localAvailabilityListeners: ((availabilities: WorkerAvailability[]) => void)[] = [];
let localStaffingTargetListeners: ((targets: StaffingTarget[]) => void)[] = [];
let localEmployeeListeners: ((employees: Employee[]) => void)[] = [];
let localDeadlineDayListeners: ((day: number) => void)[] = [];
let localStartDayListeners: ((day: number) => void)[] = [];
let localOperatingStartTimeListeners: ((time: string) => void)[] = [];
let localOperatingEndTimeListeners: ((time: string) => void)[] = [];
let localShiftMorningStartListeners: ((time: string) => void)[] = [];
let localShiftMorningEndListeners: ((time: string) => void)[] = [];
let localShiftEveningStartListeners: ((time: string) => void)[] = [];
let localShiftEveningEndListeners: ((time: string) => void)[] = [];
let localShiftPresetsListeners: ((presets: ShiftPreset[]) => void)[] = [];
let localEmployeeOrderListeners: ((order: string[]) => void)[] = [];

export interface ShiftPreset {
  name: string;
  startTime: string;
  endTime: string;
}

interface DbSchema {
  schedules: WorkSchedule[];
  availabilities: WorkerAvailability[];
  staffingTargets: StaffingTarget[];
  employees: Employee[];
  deadlineDay?: number;
  startDay?: number;
  operatingStartTime?: string;
  operatingEndTime?: string;
  shiftMorningStart?: string;
  shiftMorningEnd?: string;
  shiftEveningStart?: string;
  shiftEveningEnd?: string;
  shiftPresets?: ShiftPreset[];
  employeeOrder?: string[];
}

const inMemoryDb: DbSchema = {
  schedules: [],
  availabilities: [],
  staffingTargets: [],
  employees: [],
  deadlineDay: 20,
  startDay: 15,
  operatingStartTime: '06:30',
  operatingEndTime: '20:00',
  shiftMorningStart: '06:30',
  shiftMorningEnd: '15:30',
  shiftEveningStart: '08:30',
  shiftEveningEnd: '17:30',
  shiftPresets: [
    { name: '早班', startTime: '06:30', endTime: '15:30' },
    { name: '晚班', startTime: '08:30', endTime: '17:30' }
  ],
  employeeOrder: []
};

const loadedMonths = new Set<string>();

const getLocalSchedules = (): WorkSchedule[] => {
  const data = localStorage.getItem('weekly_work_schedules');
  if (!data) return [];
  try {
    const list = JSON.parse(data) as WorkSchedule[];
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
};

const getLocalAvailabilities = (): WorkerAvailability[] => {
  const data = localStorage.getItem('weekly_worker_availabilities');
  if (!data) return [];
  try {
    const list = JSON.parse(data) as WorkerAvailability[];
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
};

const getLocalStaffingTargets = (): StaffingTarget[] => {
  const data = localStorage.getItem('hourly_staffing_targets');
  if (!data) return [];
  try {
    return JSON.parse(data) as StaffingTarget[];
  } catch {
    return [];
  }
};

const getLocalEmployees = (): Employee[] => {
  const data = localStorage.getItem('employees_list');
  if (!data) return [];
  try {
    const list = JSON.parse(data) as any[];
    return list.map(migrateEmployee).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
};

const getLocalDeadlineDay = (): number => {
  const data = localStorage.getItem('scheduler_deadline_day');
  if (!data) return 20;
  const num = parseInt(data, 10);
  return isNaN(num) ? 20 : num;
};

const getLocalStartDay = (): number => {
  const data = localStorage.getItem('scheduler_start_day');
  if (!data) return 15;
  const num = parseInt(data, 10);
  return isNaN(num) ? 15 : num;
};

const getLocalOperatingStartTime = (): string => {
  return localStorage.getItem('scheduler_operating_start_time') || '06:30';
};

const getLocalOperatingEndTime = (): string => {
  return localStorage.getItem('scheduler_operating_end_time') || '20:00';
};

const getLocalShiftMorningStart = (): string => {
  return localStorage.getItem('scheduler_shift_morning_start') || '06:30';
};

const getLocalShiftMorningEnd = (): string => {
  return localStorage.getItem('scheduler_shift_morning_end') || '15:30';
};

const getLocalShiftEveningEnd = (): string => {
  return localStorage.getItem('scheduler_shift_evening_end') || '17:30';
};

const getLocalShiftPresets = (): ShiftPreset[] => {
  const data = localStorage.getItem('scheduler_shift_presets');
  if (!data) {
    return [
      { name: '早班', startTime: '06:30', endTime: '15:30' },
      { name: '晚班', startTime: '08:30', endTime: '17:30' }
    ];
  }
  try {
    return JSON.parse(data);
  } catch {
    return [
      { name: '早班', startTime: '06:30', endTime: '15:30' },
      { name: '晚班', startTime: '08:30', endTime: '17:30' }
    ];
  }
};

// Sync and merge data of a specific month into memory
export const syncActiveMonth = async (monthStr: string) => {
  if (isValidConfig && db) return; // Skip if Cloud DB is enabled
  
  try {
    const res = await fetch(`/api/db?month=${monthStr}`);
    if (res.ok) {
      loadedMonths.add(monthStr);
      const data = await res.json();
      
      // Merge month schedules (replace existing for this month)
      inMemoryDb.schedules = [
        ...inMemoryDb.schedules.filter(s => s.date.substring(0, 7) !== monthStr),
        ...(data.schedules || [])
      ].sort((a, b) => b.createdAt - a.createdAt);

      // Merge month availabilities (replace existing for this month)
      inMemoryDb.availabilities = [
        ...inMemoryDb.availabilities.filter(a => a.date.substring(0, 7) !== monthStr),
        ...(data.availabilities || [])
      ].sort((a, b) => b.createdAt - a.createdAt);

      // Merge staffing targets
      const otherMonthsTargets = inMemoryDb.staffingTargets.filter(t => t.date && t.date.substring(0, 7) !== monthStr);
      inMemoryDb.staffingTargets = [
        ...otherMonthsTargets,
        ...(data.staffingTargets || [])
      ];

      // Merge employees
      inMemoryDb.employees = (data.employees || []).map(migrateEmployee);

      // Merge deadlineDay & startDay
      if (data.deadlineDay !== undefined) {
        inMemoryDb.deadlineDay = data.deadlineDay;
      }
      if (data.startDay !== undefined) {
        inMemoryDb.startDay = data.startDay;
      }
      if (data.operatingStartTime !== undefined) {
        inMemoryDb.operatingStartTime = data.operatingStartTime;
      }
      if (data.operatingEndTime !== undefined) {
        inMemoryDb.operatingEndTime = data.operatingEndTime;
      }
      if (data.shiftMorningStart !== undefined) {
        inMemoryDb.shiftMorningStart = data.shiftMorningStart;
      }
      if (data.shiftMorningEnd !== undefined) {
        inMemoryDb.shiftMorningEnd = data.shiftMorningEnd;
      }
      if (data.shiftEveningStart !== undefined) {
        inMemoryDb.shiftEveningStart = data.shiftEveningStart;
      }
      if (data.shiftEveningEnd !== undefined) {
        inMemoryDb.shiftEveningEnd = data.shiftEveningEnd;
      }
      if (data.shiftPresets !== undefined) {
        inMemoryDb.shiftPresets = data.shiftPresets;
      }
      if (data.employeeOrder !== undefined) {
        inMemoryDb.employeeOrder = data.employeeOrder;
      }

      // Update LocalStorage backup
      localStorage.setItem('weekly_work_schedules', JSON.stringify(inMemoryDb.schedules));
      localStorage.setItem('weekly_worker_availabilities', JSON.stringify(inMemoryDb.availabilities));
      localStorage.setItem('hourly_staffing_targets', JSON.stringify(inMemoryDb.staffingTargets));
      localStorage.setItem('employees_list', JSON.stringify(inMemoryDb.employees));
      localStorage.setItem('scheduler_deadline_day', (inMemoryDb.deadlineDay || 20).toString());
      localStorage.setItem('scheduler_start_day', (inMemoryDb.startDay || 15).toString());
      localStorage.setItem('scheduler_operating_start_time', inMemoryDb.operatingStartTime || '06:30');
      localStorage.setItem('scheduler_operating_end_time', inMemoryDb.operatingEndTime || '20:00');
      localStorage.setItem('scheduler_shift_morning_start', inMemoryDb.shiftMorningStart || '06:30');
      localStorage.setItem('scheduler_shift_morning_end', inMemoryDb.shiftMorningEnd || '15:30');
      localStorage.setItem('scheduler_shift_evening_start', inMemoryDb.shiftEveningStart || '08:30');
      localStorage.setItem('scheduler_shift_evening_end', inMemoryDb.shiftEveningEnd || '17:30');
      localStorage.setItem('scheduler_shift_presets', JSON.stringify(inMemoryDb.shiftPresets || []));
      localStorage.setItem('scheduler_employee_order', JSON.stringify(inMemoryDb.employeeOrder || []));

      // Trigger all active UI listeners
      localListeners.forEach(listener => listener([...inMemoryDb.schedules]));
      localAvailabilityListeners.forEach(listener => listener([...inMemoryDb.availabilities]));
      localStaffingTargetListeners.forEach(listener => listener([...inMemoryDb.staffingTargets]));
      localEmployeeListeners.forEach(listener => listener([...inMemoryDb.employees]));
      localDeadlineDayListeners.forEach(listener => listener(inMemoryDb.deadlineDay || 20));
      localStartDayListeners.forEach(listener => listener(inMemoryDb.startDay || 15));
      localOperatingStartTimeListeners.forEach(listener => listener(inMemoryDb.operatingStartTime || '06:30'));
      localOperatingEndTimeListeners.forEach(listener => listener(inMemoryDb.operatingEndTime || '20:00'));
      localShiftMorningStartListeners.forEach(listener => listener(inMemoryDb.shiftMorningStart || '06:30'));
      localShiftMorningEndListeners.forEach(listener => listener(inMemoryDb.shiftMorningEnd || '15:30'));
      localShiftEveningStartListeners.forEach(listener => listener(inMemoryDb.shiftEveningStart || '08:30'));
      localShiftEveningEndListeners.forEach(listener => listener(inMemoryDb.shiftEveningEnd || '17:30'));
      localShiftPresetsListeners.forEach(listener => listener(inMemoryDb.shiftPresets || []));
      localEmployeeOrderListeners.forEach(listener => listener(inMemoryDb.employeeOrder || []));
    }
  } catch (e) {
    console.error(`Failed to sync month data for ${monthStr}:`, e);
  }
};

const loadFileDb = async () => {
  // Load current month on startup
  const monthStr = new Date().toISOString().substring(0, 7);
  try {
    const res = await fetch(`/api/db?month=${monthStr}`);
    if (res.ok) {
      loadedMonths.add(monthStr);
      const data = await res.json();
      inMemoryDb.schedules = data.schedules || [];
      inMemoryDb.availabilities = data.availabilities || [];
      inMemoryDb.staffingTargets = data.staffingTargets || [];
      inMemoryDb.employees = (data.employees || []).map(migrateEmployee);
      if (data.deadlineDay !== undefined) {
        inMemoryDb.deadlineDay = data.deadlineDay;
      }
      if (data.startDay !== undefined) {
        inMemoryDb.startDay = data.startDay;
      }
      if (data.operatingStartTime !== undefined) {
        inMemoryDb.operatingStartTime = data.operatingStartTime;
      }
      if (data.operatingEndTime !== undefined) {
        inMemoryDb.operatingEndTime = data.operatingEndTime;
      }
      if (data.shiftMorningStart !== undefined) {
        inMemoryDb.shiftMorningStart = data.shiftMorningStart;
      }
      if (data.shiftMorningEnd !== undefined) {
        inMemoryDb.shiftMorningEnd = data.shiftMorningEnd;
      }
      if (data.shiftEveningStart !== undefined) {
        inMemoryDb.shiftEveningStart = data.shiftEveningStart;
      }
      if (data.shiftEveningEnd !== undefined) {
        inMemoryDb.shiftEveningEnd = data.shiftEveningEnd;
      }
      if (data.shiftPresets !== undefined) {
        inMemoryDb.shiftPresets = data.shiftPresets;
      }
      if (data.employeeOrder !== undefined) {
        inMemoryDb.employeeOrder = data.employeeOrder;
      }
      
      // Update local storage backup
      localStorage.setItem('weekly_work_schedules', JSON.stringify(inMemoryDb.schedules));
      localStorage.setItem('weekly_worker_availabilities', JSON.stringify(inMemoryDb.availabilities));
      localStorage.setItem('hourly_staffing_targets', JSON.stringify(inMemoryDb.staffingTargets));
      localStorage.setItem('employees_list', JSON.stringify(inMemoryDb.employees));
      localStorage.setItem('scheduler_deadline_day', (inMemoryDb.deadlineDay || 20).toString());
      localStorage.setItem('scheduler_start_day', (inMemoryDb.startDay || 15).toString());
      localStorage.setItem('scheduler_operating_start_time', inMemoryDb.operatingStartTime || '06:30');
      localStorage.setItem('scheduler_operating_end_time', inMemoryDb.operatingEndTime || '20:00');
      localStorage.setItem('scheduler_shift_morning_start', inMemoryDb.shiftMorningStart || '06:30');
      localStorage.setItem('scheduler_shift_morning_end', inMemoryDb.shiftMorningEnd || '15:30');
      localStorage.setItem('scheduler_shift_evening_start', inMemoryDb.shiftEveningStart || '08:30');
      localStorage.setItem('scheduler_shift_evening_end', inMemoryDb.shiftEveningEnd || '17:30');
      localStorage.setItem('scheduler_shift_presets', JSON.stringify(inMemoryDb.shiftPresets || []));
      localStorage.setItem('scheduler_employee_order', JSON.stringify(inMemoryDb.employeeOrder || []));
    } else {
      throw new Error("Local DB API response not OK");
    }
  } catch (e) {
    console.warn("Could not load from local file DB, falling back to LocalStorage:", e);
    inMemoryDb.schedules = getLocalSchedules();
    inMemoryDb.availabilities = getLocalAvailabilities();
    inMemoryDb.staffingTargets = getLocalStaffingTargets();
    inMemoryDb.employees = getLocalEmployees();
    inMemoryDb.deadlineDay = getLocalDeadlineDay();
    inMemoryDb.startDay = getLocalStartDay();
    inMemoryDb.operatingStartTime = getLocalOperatingStartTime();
    inMemoryDb.operatingEndTime = getLocalOperatingEndTime();
    inMemoryDb.shiftMorningStart = getLocalShiftMorningStart();
    inMemoryDb.shiftMorningEnd = getLocalShiftMorningEnd();
    inMemoryDb.shiftEveningStart = localStorage.getItem('scheduler_shift_evening_start') || '08:30';
    inMemoryDb.shiftEveningEnd = getLocalShiftEveningEnd();
    inMemoryDb.shiftPresets = getLocalShiftPresets();
    try {
      inMemoryDb.employeeOrder = JSON.parse(localStorage.getItem('scheduler_employee_order') || '[]');
    } catch {
      inMemoryDb.employeeOrder = [];
    }
  } finally {
    // Notify all active listeners of loaded values
    localListeners.forEach(listener => listener([...inMemoryDb.schedules]));
    localAvailabilityListeners.forEach(listener => listener([...inMemoryDb.availabilities]));
    localStaffingTargetListeners.forEach(listener => listener([...inMemoryDb.staffingTargets]));
    localEmployeeListeners.forEach(listener => listener([...inMemoryDb.employees]));
    localDeadlineDayListeners.forEach(listener => listener(inMemoryDb.deadlineDay || 20));
    localStartDayListeners.forEach(listener => listener(inMemoryDb.startDay || 15));
    localOperatingStartTimeListeners.forEach(listener => listener(inMemoryDb.operatingStartTime || '06:30'));
    localOperatingEndTimeListeners.forEach(listener => listener(inMemoryDb.operatingEndTime || '20:00'));
    localShiftMorningStartListeners.forEach(listener => listener(inMemoryDb.shiftMorningStart || '06:30'));
    localShiftMorningEndListeners.forEach(listener => listener(inMemoryDb.shiftMorningEnd || '15:30'));
    localShiftEveningStartListeners.forEach(listener => listener(inMemoryDb.shiftEveningStart || '08:30'));
    localShiftEveningEndListeners.forEach(listener => listener(inMemoryDb.shiftEveningEnd || '17:30'));
    localShiftPresetsListeners.forEach(listener => listener(inMemoryDb.shiftPresets || []));
    localEmployeeOrderListeners.forEach(listener => listener(inMemoryDb.employeeOrder || []));
  }
};

const saveDbForDate = async (dateStr?: string) => {
  const monthStr = dateStr ? dateStr.substring(0, 7) : new Date().toISOString().substring(0, 7);

  // Ensure target month's data is loaded (first time only — callers sync before mutating for multi-tab safety)
  if (!loadedMonths.has(monthStr)) {
    await syncActiveMonth(monthStr);
  }

  // Sync to localStorage backup
  localStorage.setItem('weekly_work_schedules', JSON.stringify(inMemoryDb.schedules));
  localStorage.setItem('weekly_worker_availabilities', JSON.stringify(inMemoryDb.availabilities));
  localStorage.setItem('hourly_staffing_targets', JSON.stringify(inMemoryDb.staffingTargets));
  localStorage.setItem('employees_list', JSON.stringify(inMemoryDb.employees));
  localStorage.setItem('scheduler_deadline_day', (inMemoryDb.deadlineDay || 20).toString());
  localStorage.setItem('scheduler_start_day', (inMemoryDb.startDay || 15).toString());
  localStorage.setItem('scheduler_operating_start_time', inMemoryDb.operatingStartTime || '06:30');
  localStorage.setItem('scheduler_operating_end_time', inMemoryDb.operatingEndTime || '20:00');
  localStorage.setItem('scheduler_shift_morning_start', inMemoryDb.shiftMorningStart || '06:30');
  localStorage.setItem('scheduler_shift_morning_end', inMemoryDb.shiftMorningEnd || '15:30');
  localStorage.setItem('scheduler_shift_evening_start', inMemoryDb.shiftEveningStart || '08:30');
  localStorage.setItem('scheduler_shift_evening_end', inMemoryDb.shiftEveningEnd || '17:30');
  localStorage.setItem('scheduler_shift_presets', JSON.stringify(inMemoryDb.shiftPresets || []));
  localStorage.setItem('scheduler_employee_order', JSON.stringify(inMemoryDb.employeeOrder || []));

  // Trigger active listeners immediately for immediate UI response
  localListeners.forEach(listener => listener([...inMemoryDb.schedules]));
  localAvailabilityListeners.forEach(listener => listener([...inMemoryDb.availabilities]));
  localStaffingTargetListeners.forEach(listener => listener([...inMemoryDb.staffingTargets]));
  localEmployeeListeners.forEach(listener => listener([...inMemoryDb.employees]));
  localDeadlineDayListeners.forEach(listener => listener(inMemoryDb.deadlineDay || 20));
  localStartDayListeners.forEach(listener => listener(inMemoryDb.startDay || 15));
  localOperatingStartTimeListeners.forEach(listener => listener(inMemoryDb.operatingStartTime || '06:30'));
  localOperatingEndTimeListeners.forEach(listener => listener(inMemoryDb.operatingEndTime || '20:00'));
  localShiftMorningStartListeners.forEach(listener => listener(inMemoryDb.shiftMorningStart || '06:30'));
  localShiftMorningEndListeners.forEach(listener => listener(inMemoryDb.shiftMorningEnd || '15:30'));
  localShiftEveningStartListeners.forEach(listener => listener(inMemoryDb.shiftEveningStart || '08:30'));
  localShiftEveningEndListeners.forEach(listener => listener(inMemoryDb.shiftEveningEnd || '17:30'));
  localShiftPresetsListeners.forEach(listener => listener(inMemoryDb.shiftPresets || []));
  localEmployeeOrderListeners.forEach(listener => listener(inMemoryDb.employeeOrder || []));

  // POST current in-memory state to local JSON file
  try {
    const monthSchedules = inMemoryDb.schedules.filter(s => s.date.substring(0, 7) === monthStr);
    const monthAvailabilities = inMemoryDb.availabilities.filter(a => a.date.substring(0, 7) === monthStr);
    const monthTargets = inMemoryDb.staffingTargets.filter(t => !t.date || t.date.substring(0, 7) === monthStr);

    const payload = {
      schedules: monthSchedules,
      availabilities: monthAvailabilities,
      staffingTargets: monthTargets,
      employees: inMemoryDb.employees,
      deadlineDay: inMemoryDb.deadlineDay || 20,
      startDay: inMemoryDb.startDay || 15,
      operatingStartTime: inMemoryDb.operatingStartTime || '06:30',
      operatingEndTime: inMemoryDb.operatingEndTime || '20:00',
      shiftMorningStart: inMemoryDb.shiftMorningStart || '06:30',
      shiftMorningEnd: inMemoryDb.shiftMorningEnd || '15:30',
      shiftEveningStart: inMemoryDb.shiftEveningStart || '08:30',
      shiftEveningEnd: inMemoryDb.shiftEveningEnd || '17:30',
      shiftPresets: inMemoryDb.shiftPresets || [],
      employeeOrder: inMemoryDb.employeeOrder || []
    };

    await fetch(`/api/db?month=${monthStr}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error(`Failed to write to local file DB for ${monthStr}:`, e);
  }
};

// Initial data load when import happens
loadFileDb();

export const subscribeToSchedules = (callback: (schedules: WorkSchedule[]) => void) => {
  if (isValidConfig && db) {
    const schedulesCollection = collection(db, 'schedules');
    const q = query(schedulesCollection, orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const schedules = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkSchedule[];
      callback(schedules);
    });
  } else {
    localListeners.push(callback);
    callback([...inMemoryDb.schedules]);
    return () => {
      localListeners = localListeners.filter(l => l !== callback);
    };
  }
};

export const addSchedule = async (schedule: Omit<WorkSchedule, 'id' | 'createdAt'>) => {
  const newSchedule = {
    ...schedule,
    createdAt: Date.now()
  };

  if (isValidConfig && db) {
    const schedulesCollection = collection(db, 'schedules');
    return await addDoc(schedulesCollection, newSchedule);
  } else {
    const createdItem: WorkSchedule = {
      id: Math.random().toString(36).substring(2, 9),
      ...newSchedule
    };
    inMemoryDb.schedules = [createdItem, ...inMemoryDb.schedules];
    await saveDbForDate(schedule.date);
    return createdItem;
  }
};

export const updateSchedule = async (id: string, updates: Partial<Omit<WorkSchedule, 'id' | 'createdAt'>>) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'schedules', id);
    return await updateDoc(docRef, updates);
  } else {
    let affectedDate = '';
    inMemoryDb.schedules = inMemoryDb.schedules.map(item => {
      if (item.id === id) {
        affectedDate = updates.date || item.date;
        return { ...item, ...updates };
      }
      return item;
    });
    await saveDbForDate(affectedDate);
  }
};

export const deleteSchedule = async (id: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'schedules', id);
    return await deleteDoc(docRef);
  } else {
    const itemToDelete = inMemoryDb.schedules.find(item => item.id === id);
    // Sync before deleting so we don't lose other tabs' recent writes
    if (itemToDelete) await syncActiveMonth(itemToDelete.date.substring(0, 7));
    inMemoryDb.schedules = inMemoryDb.schedules.filter(item => item.id !== id);
    await saveDbForDate(itemToDelete?.date);
  }
};

export const subscribeToAvailabilities = (callback: (availabilities: WorkerAvailability[]) => void) => {
  if (isValidConfig && db) {
    const availabilitiesCollection = collection(db, 'availabilities');
    const q = query(availabilitiesCollection, orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const availabilities = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkerAvailability[];
      callback(availabilities);
    });
  } else {
    localAvailabilityListeners.push(callback);
    callback([...inMemoryDb.availabilities]);
    return () => {
      localAvailabilityListeners = localAvailabilityListeners.filter(l => l !== callback);
    };
  }
};

export const addAvailability = async (availability: Omit<WorkerAvailability, 'id' | 'createdAt'>) => {
  const newAvail = {
    ...availability,
    createdAt: Date.now()
  };

  if (isValidConfig && db) {
    const availabilitiesCollection = collection(db, 'availabilities');
    return await addDoc(availabilitiesCollection, newAvail);
  } else {
    // Sync fresh server state BEFORE adding to prevent stale in-memory from overwriting
    // changes made by another tab (e.g. manager confirming a schedule while worker adds more).
    const monthStr = availability.date.substring(0, 7);
    await syncActiveMonth(monthStr);

    const createdItem: WorkerAvailability = {
      id: Math.random().toString(36).substring(2, 9),
      ...newAvail
    };
    inMemoryDb.availabilities = [createdItem, ...inMemoryDb.availabilities];
    await saveDbForDate(availability.date);
    return createdItem;
  }
};

export const deleteAvailability = async (id: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'availabilities', id);
    return await deleteDoc(docRef);
  } else {
    const itemToDelete = inMemoryDb.availabilities.find(item => item.id === id);
    // Sync before deleting so we don't lose other tabs' recent writes
    if (itemToDelete) {
      await syncActiveMonth(itemToDelete.date.substring(0, 7));
    }
    inMemoryDb.availabilities = inMemoryDb.availabilities.filter(item => item.id !== id);
    await saveDbForDate(itemToDelete?.date);
  }
};


export const subscribeToStaffingTargets = (callback: (targets: StaffingTarget[]) => void) => {
  if (isValidConfig && db) {
    const targetsCollection = collection(db, 'staffing_targets');
    return onSnapshot(targetsCollection, (snapshot) => {
      const targets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StaffingTarget[];
      callback(targets);
    });
  } else {
    localStaffingTargetListeners.push(callback);
    callback([...inMemoryDb.staffingTargets]);
    return () => {
      localStaffingTargetListeners = localStaffingTargetListeners.filter(l => l !== callback);
    };
  }
};

export const updateStaffingTarget = async (hour: number, targetCount: number, date?: string) => {
  const targetId = date ? `date-${date}-hour-${hour}` : `hour-${hour}`;
  const payload = { hour, targetCount, ...(date ? { date } : {}) };

  if (isValidConfig && db) {
    const docRef = doc(db, 'staffing_targets', targetId);
    return await setDoc(docRef, payload, { merge: true });
  } else {
    if (date) {
      const monthStr = date.substring(0, 7);
      await syncActiveMonth(monthStr);
    }
    const existingIndex = inMemoryDb.staffingTargets.findIndex(t => t.hour === hour && (date ? t.date === date : !t.date));
    if (existingIndex > -1) {
      inMemoryDb.staffingTargets[existingIndex].targetCount = targetCount;
    } else {
      inMemoryDb.staffingTargets.push({ id: targetId, hour, targetCount, date });
    }
    await saveDbForDate(date);
  }
};

export const subscribeToEmployees = (callback: (employees: Employee[]) => void) => {
  if (isValidConfig && db) {
    const employeesCollection = collection(db, 'employees');
    const q = query(employeesCollection, orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const employees = snapshot.docs.map(doc => migrateEmployee({
        id: doc.id,
        ...doc.data()
      }));
      callback(employees);
    });
  } else {
    localEmployeeListeners.push(callback);
    callback([...inMemoryDb.employees]);
    return () => {
      localEmployeeListeners = localEmployeeListeners.filter(l => l !== callback);
    };
  }
};

export const addEmployee = async (employee: Omit<Employee, 'id' | 'createdAt'>) => {
  const newEmp = {
    ...employee,
    createdAt: Date.now()
  };

  if (isValidConfig && db) {
    const employeesCollection = collection(db, 'employees');
    return await addDoc(employeesCollection, newEmp);
  } else {
    const createdItem: Employee = {
      id: Math.random().toString(36).substring(2, 9),
      ...newEmp
    };
    inMemoryDb.employees = [createdItem, ...inMemoryDb.employees];
    await saveDbForDate();
    return createdItem;
  }
};

export const updateEmployee = async (id: string, updates: Partial<Omit<Employee, 'id' | 'createdAt'>>) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'employees', id);
    return await updateDoc(docRef, updates);
  } else {
    inMemoryDb.employees = inMemoryDb.employees.map(item => {
      if (item.id === id) {
        return { ...item, ...updates };
      }
      return item;
    });
    await saveDbForDate();
  }
};

export const deleteEmployee = async (id: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'employees', id);
    return await deleteDoc(docRef);
  } else {
    inMemoryDb.employees = inMemoryDb.employees.filter(item => item.id !== id);
    await saveDbForDate();
  }
};

export const updateDayNote = async (date: string, note: string) => {
  const targetId = `date-${date}-note`;
  const payload = { hour: 99, targetCount: 0, date, note };

  if (isValidConfig && db) {
    const docRef = doc(db, 'staffing_targets', targetId);
    return await setDoc(docRef, payload, { merge: true });
  } else {
    const monthStr = date.substring(0, 7);
    await syncActiveMonth(monthStr);

    const existingIndex = inMemoryDb.staffingTargets.findIndex(t => t.hour === 99 && t.date === date);
    if (existingIndex > -1) {
      inMemoryDb.staffingTargets[existingIndex].note = note;
    } else {
      inMemoryDb.staffingTargets.push({ id: targetId, hour: 99, targetCount: 0, date, note });
    }
    await saveDbForDate(date);
  }
};

export const subscribeToDeadlineDay = (callback: (day: number) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.deadlineDay !== undefined ? data.deadlineDay : 20);
      } else {
        callback(20);
      }
    });
  } else {
    localDeadlineDayListeners.push(callback);
    callback(inMemoryDb.deadlineDay || 20);
    return () => {
      localDeadlineDayListeners = localDeadlineDayListeners.filter(l => l !== callback);
    };
  }
};

export const updateDeadlineDay = async (day: number) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { deadlineDay: day }, { merge: true });
  } else {
    inMemoryDb.deadlineDay = day;
    await saveDbForDate();
  }
};

export const subscribeToStartDay = (callback: (day: number) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.startDay !== undefined ? data.startDay : 15);
      } else {
        callback(15);
      }
    });
  } else {
    localStartDayListeners.push(callback);
    callback(inMemoryDb.startDay || 15);
    return () => {
      localStartDayListeners = localStartDayListeners.filter(l => l !== callback);
    };
  }
};

export const updateStartDay = async (day: number) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { startDay: day }, { merge: true });
  } else {
    inMemoryDb.startDay = day;
    await saveDbForDate();
  }
};

export const subscribeToOperatingStartTime = (callback: (time: string) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.operatingStartTime !== undefined ? data.operatingStartTime : '06:30');
      } else {
        callback('06:30');
      }
    });
  } else {
    localOperatingStartTimeListeners.push(callback);
    callback(inMemoryDb.operatingStartTime || '06:30');
    return () => {
      localOperatingStartTimeListeners = localOperatingStartTimeListeners.filter(l => l !== callback);
    };
  }
};

export const updateOperatingStartTime = async (time: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { operatingStartTime: time }, { merge: true });
  } else {
    inMemoryDb.operatingStartTime = time;
    await saveDbForDate();
  }
};

export const subscribeToOperatingEndTime = (callback: (time: string) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.operatingEndTime !== undefined ? data.operatingEndTime : '20:00');
      } else {
        callback('20:00');
      }
    });
  } else {
    localOperatingEndTimeListeners.push(callback);
    callback(inMemoryDb.operatingEndTime || '20:00');
    return () => {
      localOperatingEndTimeListeners = localOperatingEndTimeListeners.filter(l => l !== callback);
    };
  }
};

export const updateOperatingEndTime = async (time: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { operatingEndTime: time }, { merge: true });
  } else {
    inMemoryDb.operatingEndTime = time;
    await saveDbForDate();
  }
};

export const subscribeToShiftMorningStart = (callback: (time: string) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.shiftMorningStart !== undefined ? data.shiftMorningStart : '06:30');
      } else {
        callback('06:30');
      }
    });
  } else {
    localShiftMorningStartListeners.push(callback);
    callback(inMemoryDb.shiftMorningStart || '06:30');
    return () => {
      localShiftMorningStartListeners = localShiftMorningStartListeners.filter(l => l !== callback);
    };
  }
};

export const updateShiftMorningStart = async (time: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { shiftMorningStart: time }, { merge: true });
  } else {
    inMemoryDb.shiftMorningStart = time;
    await saveDbForDate();
  }
};

export const subscribeToShiftMorningEnd = (callback: (time: string) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.shiftMorningEnd !== undefined ? data.shiftMorningEnd : '15:30');
      } else {
        callback('15:30');
      }
    });
  } else {
    localShiftMorningEndListeners.push(callback);
    callback(inMemoryDb.shiftMorningEnd || '15:30');
    return () => {
      localShiftMorningEndListeners = localShiftMorningEndListeners.filter(l => l !== callback);
    };
  }
};

export const updateShiftMorningEnd = async (time: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { shiftMorningEnd: time }, { merge: true });
  } else {
    inMemoryDb.shiftMorningEnd = time;
    await saveDbForDate();
  }
};

export const subscribeToShiftEveningStart = (callback: (time: string) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.shiftEveningStart !== undefined ? data.shiftEveningStart : '08:30');
      } else {
        callback('08:30');
      }
    });
  } else {
    localShiftEveningStartListeners.push(callback);
    callback(inMemoryDb.shiftEveningStart || '08:30');
    return () => {
      localShiftEveningStartListeners = localShiftEveningStartListeners.filter(l => l !== callback);
    };
  }
};

export const updateShiftEveningStart = async (time: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { shiftEveningStart: time }, { merge: true });
  } else {
    inMemoryDb.shiftEveningStart = time;
    await saveDbForDate();
  }
};

export const subscribeToShiftEveningEnd = (callback: (time: string) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.shiftEveningEnd !== undefined ? data.shiftEveningEnd : '17:30');
      } else {
        callback('17:30');
      }
    });
  } else {
    localShiftEveningEndListeners.push(callback);
    callback(inMemoryDb.shiftEveningEnd || '17:30');
    return () => {
      localShiftEveningEndListeners = localShiftEveningEndListeners.filter(l => l !== callback);
    };
  }
};

export const updateShiftEveningEnd = async (time: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { shiftEveningEnd: time }, { merge: true });
  } else {
    inMemoryDb.shiftEveningEnd = time;
    await saveDbForDate();
  }
};

export const subscribeToShiftPresets = (callback: (presets: ShiftPreset[]) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.shiftPresets !== undefined ? data.shiftPresets : [
          { name: '早班', startTime: '06:30', endTime: '15:30' },
          { name: '晚班', startTime: '08:30', endTime: '17:30' }
        ]);
      } else {
        callback([
          { name: '早班', startTime: '06:30', endTime: '15:30' },
          { name: '晚班', startTime: '08:30', endTime: '17:30' }
        ]);
      }
    });
  } else {
    localShiftPresetsListeners.push(callback);
    callback(inMemoryDb.shiftPresets || [
      { name: '早班', startTime: '06:30', endTime: '15:30' },
      { name: '晚班', startTime: '08:30', endTime: '17:30' }
    ]);
    return () => {
      localShiftPresetsListeners = localShiftPresetsListeners.filter(l => l !== callback);
    };
  }
};

export const updateShiftPresets = async (presets: ShiftPreset[]) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { shiftPresets: presets }, { merge: true });
  } else {
    inMemoryDb.shiftPresets = presets;
    await saveDbForDate();
  }
};

export const subscribeToEmployeeOrder = (callback: (order: string[]) => void) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback(data.employeeOrder !== undefined ? data.employeeOrder : []);
      } else {
        callback([]);
      }
    });
  } else {
    localEmployeeOrderListeners.push(callback);
    callback(inMemoryDb.employeeOrder || []);
    return () => {
      localEmployeeOrderListeners = localEmployeeOrderListeners.filter(l => l !== callback);
    };
  }
};

export const updateEmployeeOrder = async (order: string[]) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'settings', 'global');
    return await setDoc(docRef, { employeeOrder: order }, { merge: true });
  } else {
    inMemoryDb.employeeOrder = order;
    await saveDbForDate();
  }
};


