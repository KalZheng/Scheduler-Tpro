import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot,
  query,
  orderBy
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

// Local Storage fallback mechanism
let localListeners: ((schedules: WorkSchedule[]) => void)[] = [];

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

const saveLocalSchedules = (schedules: WorkSchedule[]) => {
  localStorage.setItem('weekly_work_schedules', JSON.stringify(schedules));
  localListeners.forEach(listener => listener(schedules));
};

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
    // Local storage subscription
    localListeners.push(callback);
    // Call immediately with initial local storage data
    callback(getLocalSchedules());
    
    // Return unsubscribe function
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
    const schedules = getLocalSchedules();
    const createdItem: WorkSchedule = {
      id: Math.random().toString(36).substring(2, 9),
      ...newSchedule
    };
    saveLocalSchedules([createdItem, ...schedules]);
    return createdItem;
  }
};

export const updateSchedule = async (id: string, updates: Partial<Omit<WorkSchedule, 'id' | 'createdAt'>>) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'schedules', id);
    return await updateDoc(docRef, updates);
  } else {
    const schedules = getLocalSchedules();
    const updatedSchedules = schedules.map(item => {
      if (item.id === id) {
        return { ...item, ...updates };
      }
      return item;
    });
    saveLocalSchedules(updatedSchedules);
  }
};

export const deleteSchedule = async (id: string) => {
  if (isValidConfig && db) {
    const docRef = doc(db, 'schedules', id);
    return await deleteDoc(docRef);
  } else {
    const schedules = getLocalSchedules();
    const filteredSchedules = schedules.filter(item => item.id !== id);
    saveLocalSchedules(filteredSchedules);
  }
};

