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
  createdAt: number;
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
}

// Local Storage & Local File DB fallback mechanism
let localListeners: ((schedules: WorkSchedule[]) => void)[] = [];
let localAvailabilityListeners: ((availabilities: WorkerAvailability[]) => void)[] = [];
let localStaffingTargetListeners: ((targets: StaffingTarget[]) => void)[] = [];

interface DbSchema {
  schedules: WorkSchedule[];
  availabilities: WorkerAvailability[];
  staffingTargets: StaffingTarget[];
}

let inMemoryDb: DbSchema = {
  schedules: [],
  availabilities: [],
  staffingTargets: []
};

const loadedMonths = new Set<string>();

const getLocalSchedules = (): WorkSchedule[] => {
  const data = localStorage.getItem('weekly_work_schedules');
  if (!data) return [];
  try {
    const list = JSON.parse(data) as WorkSchedule[];
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    return [];
  }
};

const getLocalAvailabilities = (): WorkerAvailability[] => {
  const data = localStorage.getItem('weekly_worker_availabilities');
  if (!data) return [];
  try {
    const list = JSON.parse(data) as WorkerAvailability[];
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    return [];
  }
};

const getLocalStaffingTargets = (): StaffingTarget[] => {
  const data = localStorage.getItem('hourly_staffing_targets');
  if (!data) return [];
  try {
    return JSON.parse(data) as StaffingTarget[];
  } catch (e) {
    return [];
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

      // Update LocalStorage backup
      localStorage.setItem('weekly_work_schedules', JSON.stringify(inMemoryDb.schedules));
      localStorage.setItem('weekly_worker_availabilities', JSON.stringify(inMemoryDb.availabilities));
      localStorage.setItem('hourly_staffing_targets', JSON.stringify(inMemoryDb.staffingTargets));

      // Trigger all active UI listeners
      localListeners.forEach(listener => listener(inMemoryDb.schedules));
      localAvailabilityListeners.forEach(listener => listener(inMemoryDb.availabilities));
      localStaffingTargetListeners.forEach(listener => listener(inMemoryDb.staffingTargets));
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
      
      // Update local storage backup
      localStorage.setItem('weekly_work_schedules', JSON.stringify(inMemoryDb.schedules));
      localStorage.setItem('weekly_worker_availabilities', JSON.stringify(inMemoryDb.availabilities));
      localStorage.setItem('hourly_staffing_targets', JSON.stringify(inMemoryDb.staffingTargets));
    } else {
      throw new Error("Local DB API response not OK");
    }
  } catch (e) {
    console.warn("Could not load from local file DB, falling back to LocalStorage:", e);
    inMemoryDb.schedules = getLocalSchedules();
    inMemoryDb.availabilities = getLocalAvailabilities();
    inMemoryDb.staffingTargets = getLocalStaffingTargets();
  } finally {
    // Notify all active listeners of loaded values
    localListeners.forEach(listener => listener(inMemoryDb.schedules));
    localAvailabilityListeners.forEach(listener => listener(inMemoryDb.availabilities));
    localStaffingTargetListeners.forEach(listener => listener(inMemoryDb.staffingTargets));
  }
};

const saveDbForDate = async (dateStr?: string) => {
  const monthStr = dateStr ? dateStr.substring(0, 7) : new Date().toISOString().substring(0, 7);

  // Ensure target month's data is loaded to prevent overwriting existing items
  if (!loadedMonths.has(monthStr)) {
    await syncActiveMonth(monthStr);
  }

  // Sync to localStorage backup
  localStorage.setItem('weekly_work_schedules', JSON.stringify(inMemoryDb.schedules));
  localStorage.setItem('weekly_worker_availabilities', JSON.stringify(inMemoryDb.availabilities));
  localStorage.setItem('hourly_staffing_targets', JSON.stringify(inMemoryDb.staffingTargets));

  // Trigger active listeners immediately for immediate UI response
  localListeners.forEach(listener => listener(inMemoryDb.schedules));
  localAvailabilityListeners.forEach(listener => listener(inMemoryDb.availabilities));
  localStaffingTargetListeners.forEach(listener => listener(inMemoryDb.staffingTargets));

  // Sync to local JSON file for that month
  try {
    const monthSchedules = inMemoryDb.schedules.filter(s => s.date.substring(0, 7) === monthStr);
    const monthAvailabilities = inMemoryDb.availabilities.filter(a => a.date.substring(0, 7) === monthStr);
    const monthTargets = inMemoryDb.staffingTargets.filter(t => !t.date || t.date.substring(0, 7) === monthStr);

    const payload = {
      schedules: monthSchedules,
      availabilities: monthAvailabilities,
      staffingTargets: monthTargets
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
    callback(inMemoryDb.schedules);
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
    callback(inMemoryDb.availabilities);
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
    const itemToDelete = inMemoryDb.availabilities.find(item => item.id !== id);
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
    callback(inMemoryDb.staffingTargets);
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
    const existingIndex = inMemoryDb.staffingTargets.findIndex(t => t.hour === hour && (date ? t.date === date : !t.date));
    if (existingIndex > -1) {
      inMemoryDb.staffingTargets[existingIndex].targetCount = targetCount;
    } else {
      inMemoryDb.staffingTargets.push({ id: targetId, hour, targetCount, date });
    }
    await saveDbForDate(date);
  }
};
