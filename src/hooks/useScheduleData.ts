import { useState, useEffect, useMemo } from 'react';
import {
  subscribeToSchedules,
  subscribeToAvailabilities,
  subscribeToStaffingTargets,
  subscribeToEmployees,
  subscribeToDeadlineDay,
  subscribeToStartDay,
  subscribeToOperatingStartTime,
  subscribeToOperatingEndTime,
  subscribeToShiftMorningStart,
  subscribeToShiftMorningEnd,
  subscribeToShiftPresets,
  subscribeToEmployeeOrder,
  subscribeToMarkedEmptyCells,
  subscribeToErpDays,
  subscribeToPtAvailMode,
  subscribeToFilenamePrefix,
  subscribeToAllowMonthSwitch,
  subscribeToStaffingDemandConfig,
  DEFAULT_STAFFING_DEMAND_CONFIG
} from '../services/scheduler';
import type {
  WorkSchedule,
  WorkerAvailability,
  StaffingTarget,
  Employee,
  ShiftPreset,
  PtAvailMode,
  StaffingDemandConfig
} from '../services/scheduler';

export function useScheduleData() {
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [availabilities, setAvailabilities] = useState<WorkerAvailability[]>([]);
  const [staffingTargets, setStaffingTargets] = useState<StaffingTarget[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [deadlineDay, setDeadlineDay] = useState<number>(20);
  const [startDay, setStartDay] = useState<number>(15);
  const [allowMonthSwitch, setAllowMonthSwitch] = useState<boolean>(false);
  const [operatingStartTime, setOperatingStartTime] = useState<string>('06:30');
  const [operatingEndTime, setOperatingEndTime] = useState<string>('20:00');
  const [shiftMorningStart, setShiftMorningStart] = useState<string>('06:30');
  const [shiftMorningEnd, setShiftMorningEnd] = useState<string>('15:30');
  const [shiftPresets, setShiftPresets] = useState<ShiftPreset[]>([]);
  const [employeeOrder, setEmployeeOrder] = useState<string[]>([]);
  const [erpDays, setErpDays] = useState<number[]>([1, 3, 5]);
  const [ptAvailMode, setPtAvailMode] = useState<PtAvailMode>('static');
  const [filenamePrefix, setFilenamePrefix] = useState<string>('');
  const [staffingDemandConfig, setStaffingDemandConfig] = useState<StaffingDemandConfig>(DEFAULT_STAFFING_DEMAND_CONFIG);
  const [markedEmptyCells, setMarkedEmptyCells] = useState<Record<string, boolean>>({});

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
    const unsubMarkedEmptyCells = subscribeToMarkedEmptyCells((cells) => setMarkedEmptyCells(cells));
    const unsubErpDays = subscribeToErpDays((days) => setErpDays(days));
    const unsubPtAvailMode = subscribeToPtAvailMode((mode) => setPtAvailMode(mode));
    const unsubFilenamePrefix = subscribeToFilenamePrefix((prefix) => setFilenamePrefix(prefix));
    const unsubAllowMonthSwitch = subscribeToAllowMonthSwitch((allowed) => setAllowMonthSwitch(allowed));
    const unsubStaffingDemand = subscribeToStaffingDemandConfig((cfg) => setStaffingDemandConfig(cfg));

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
      unsubMarkedEmptyCells();
      unsubErpDays();
      unsubPtAvailMode();
      unsubFilenamePrefix();
      unsubAllowMonthSwitch();
      unsubStaffingDemand();
    };
  }, []);

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

  return {
    schedules,
    setSchedules,
    availabilities,
    setAvailabilities,
    staffingTargets,
    setStaffingTargets,
    employees,
    setEmployees,
    deadlineDay,
    setDeadlineDay,
    startDay,
    setStartDay,
    allowMonthSwitch,
    setAllowMonthSwitch,
    operatingStartTime,
    setOperatingStartTime,
    operatingEndTime,
    setOperatingEndTime,
    shiftMorningStart,
    setShiftMorningStart,
    shiftMorningEnd,
    setShiftMorningEnd,
    shiftPresets,
    setShiftPresets,
    employeeOrder,
    setEmployeeOrder,
    erpDays,
    setErpDays,
    ptAvailMode,
    setPtAvailMode,
    filenamePrefix,
    setFilenamePrefix,
    staffingDemandConfig,
    setStaffingDemandConfig,
    markedEmptyCells,
    setMarkedEmptyCells,
    defaultShiftStart,
    defaultShiftEnd,
    timeSlots,
    analysisHoursRange
  };
}
