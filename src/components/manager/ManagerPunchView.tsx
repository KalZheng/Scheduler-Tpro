import React, { useState, useEffect, useMemo } from 'react';
import {
  subscribeToPunchEvents,
  subscribeToWorkplaceGpsConfigs,
  saveWorkplaceGpsConfig,
  deletePunchEvent,
  updateEmployee,
  DEFAULT_WORKPLACE_GPS_CONFIGS,
  type PunchEvent,
  type PunchAction,
  type Employee,
  type WorkSchedule,
  type WorkplaceGpsConfig
} from '../../services/scheduler';
import { calculateEffectiveWorkHours, safeConfirm } from '../../utils/dateUtils';
import workplaces from '../../config/workplaces.json';

interface ManagerPunchViewProps {
  currentMonthStart: Date;
  employees: Employee[];
  schedules: WorkSchedule[];
}

export interface CompletedPunchSession {
  id: string;
  employeeName: string;
  workplace: string;
  date: string;
  startTimestamp: string;
  endTimestamp: string;
  startDisplay: string;
  endDisplay: string;
  breakMin: number;
  hours: number;
}

const ACTION_LABELS: Record<PunchAction, string> = {
  in: '上班打卡',
  breakStart: '開始休息',
  breakEnd: '結束休息',
  out: '下班打卡'
};

const ACTION_BADGE_STYLES: Record<PunchAction, string> = {
  in: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  breakStart: 'bg-amber-100 text-amber-800 border-amber-200',
  breakEnd: 'bg-sky-100 text-sky-800 border-sky-200',
  out: 'bg-[#F5EBE6] text-[#5D4037] border-[#DAC0A3]'
};

function formatTaipeiStamp(isoOrTime: string, fallbackDate: string, fallbackTime: string): string {
  if (!isoOrTime) return `${fallbackDate} ${fallbackTime}`;
  const d = new Date(isoOrTime);
  if (isNaN(d.getTime())) return `${fallbackDate} ${fallbackTime}`;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d);
}

export const ManagerPunchView: React.FC<ManagerPunchViewProps> = ({
  currentMonthStart,
  employees,
  schedules
}) => {
  const [events, setEvents] = useState<PunchEvent[]>([]);
  const [gpsConfigs, setGpsConfigs] = useState<Record<string, WorkplaceGpsConfig>>(
    DEFAULT_WORKPLACE_GPS_CONFIGS
  );
  const [selectedStore, setSelectedStore] = useState<string>('ALL');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('ALL');
  const [onlyCurrentMonth, setOnlyCurrentMonth] = useState<boolean>(true);

  // GPS & Device Settings editor state (uses this branch's configured store)
  const configStoreName = workplaces[0]?.name || '埔里酒廠門市';
  const [latInput, setLatInput] = useState<string>('23.9688');
  const [lngInput, setLngInput] = useState<string>('120.9625');
  const [radiusInput, setRadiusInput] = useState<string>('200');
  const [gpsRequiredInput, setGpsRequiredInput] = useState<boolean>(true);
  const [deviceBindingRequiredInput, setDeviceBindingRequiredInput] = useState<boolean>(true);
  const [isLocatingCurrent, setIsLocatingCurrent] = useState<boolean>(false);
  const [configSavedNotice, setConfigSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubEvents = subscribeToPunchEvents((data) => {
      setEvents(data);
    });
    const unsubGps = subscribeToWorkplaceGpsConfigs((configs) => {
      setGpsConfigs(configs);
    });
    return () => {
      unsubEvents();
      unsubGps();
    };
  }, []);

  // Load selected store's GPS config into form inputs when configStoreName or gpsConfigs changes
  useEffect(() => {
    const cfg = gpsConfigs[configStoreName] || {
      workplace: configStoreName,
      latitude: 23.9688,
      longitude: 120.9625,
      radiusMeters: 200,
      gpsRequired: true,
      deviceBindingRequired: true
    };
    setLatInput(String(cfg.latitude));
    setLngInput(String(cfg.longitude));
    setRadiusInput(String(cfg.radiusMeters));
    setGpsRequiredInput(cfg.gpsRequired !== false);
    setDeviceBindingRequiredInput(cfg.deviceBindingRequired !== false);
  }, [configStoreName, gpsConfigs]);

  const currentMonthPrefix = useMemo(() => {
    const y = currentMonthStart.getFullYear();
    const m = (currentMonthStart.getMonth() + 1).toString().padStart(2, '0');
    return `${y}-${m}`;
  }, [currentMonthStart]);

  const storeOptions = useMemo(() => {
    const set = new Set<string>(workplaces.map(w => w.name));
    Object.keys(gpsConfigs).forEach(k => set.add(k));
    events.forEach(e => {
      if (e.workplace) set.add(e.workplace);
    });
    return Array.from(set);
  }, [events, gpsConfigs]);

  const employeeOptions = useMemo(() => {
    const set = new Set<string>(employees.filter(e => e.active !== false).map(e => e.name.trim()));
    events.forEach(e => {
      if (e.employeeName) set.add(e.employeeName.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [employees, events]);

  // Pair up 'in' -> ('breakStart' -> 'breakEnd')* -> 'out' per (store | employee)
  const allCompletedSessions = useMemo(() => {
    const grouped: Record<string, PunchEvent[]> = {};
    for (const e of events) {
      const key = `${e.workplace}|${e.employeeName.trim().toLowerCase()}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    }

    const out: CompletedPunchSession[] = [];
    for (const groupEvents of Object.values(grouped)) {
      let start: PunchEvent | null = null;
      let rest: PunchEvent | null = null;
      let breakMs = 0;

      for (const e of groupEvents) {
        if (e.action === 'in') {
          start = e;
          rest = null;
          breakMs = 0;
        } else if (e.action === 'breakStart' && start) {
          rest = e;
        } else if (e.action === 'breakEnd' && rest) {
          breakMs += Math.max(0, Date.parse(e.timestamp) - Date.parse(rest.timestamp));
          rest = null;
        } else if (e.action === 'out' && start) {
          const totalMs = Date.parse(e.timestamp) - Date.parse(start.timestamp) - breakMs;
          if (totalMs >= 0) {
            out.push({
              id: e.id,
              employeeName: e.employeeName.trim(),
              workplace: e.workplace,
              date: start.date,
              startTimestamp: start.timestamp,
              endTimestamp: e.timestamp,
              startDisplay: formatTaipeiStamp(start.timestamp, start.date, start.timeStr),
              endDisplay: formatTaipeiStamp(e.timestamp, e.date, e.timeStr),
              breakMin: Math.round(breakMs / 60000),
              hours: totalMs / 3600000
            });
          }
          start = null;
          rest = null;
        }
      }
    }

    return out.sort((a, b) => b.endTimestamp.localeCompare(a.endTimestamp));
  }, [events]);

  // Apply month / employee / store filters
  const filteredSessions = useMemo(() => {
    return allCompletedSessions.filter(s => {
      if (onlyCurrentMonth && !s.date.startsWith(currentMonthPrefix)) return false;
      if (selectedStore !== 'ALL' && s.workplace !== selectedStore) return false;
      if (
        selectedEmployee !== 'ALL' &&
        s.employeeName.trim().toLowerCase() !== selectedEmployee.trim().toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [allCompletedSessions, onlyCurrentMonth, currentMonthPrefix, selectedStore, selectedEmployee]);

  const totalAllStoresHours = useMemo(() => {
    return allCompletedSessions
      .filter(s => {
        if (onlyCurrentMonth && !s.date.startsWith(currentMonthPrefix)) return false;
        if (
          selectedEmployee !== 'ALL' &&
          s.employeeName.trim().toLowerCase() !== selectedEmployee.trim().toLowerCase()
        ) {
          return false;
        }
        return true;
      })
      .reduce((acc, s) => acc + s.hours, 0);
  }, [allCompletedSessions, onlyCurrentMonth, currentMonthPrefix, selectedEmployee]);

  const filteredStoreHours = useMemo(() => {
    return filteredSessions.reduce((acc, s) => acc + s.hours, 0);
  }, [filteredSessions]);

  const activeWorkersNow = useMemo(() => {
    const byEmp: Record<string, { employeeName: string; workplace: string; active: boolean; breakOn: boolean; since: string }> = {};
    for (const e of events) {
      const k = e.employeeName.trim().toLowerCase();
      if (!byEmp[k]) {
        byEmp[k] = {
          employeeName: e.employeeName.trim(),
          workplace: e.workplace,
          active: false,
          breakOn: false,
          since: e.timeStr
        };
      }
      if (e.action === 'in') {
        byEmp[k].active = true;
        byEmp[k].breakOn = false;
        byEmp[k].workplace = e.workplace;
        byEmp[k].since = e.timeStr;
      } else if (e.action === 'breakStart') {
        byEmp[k].breakOn = true;
      } else if (e.action === 'breakEnd') {
        byEmp[k].breakOn = false;
      } else if (e.action === 'out') {
        byEmp[k].active = false;
        byEmp[k].breakOn = false;
      }
    }
    return Object.values(byEmp).filter(w => w.active);
  }, [events]);

  // Employee-level summary (includes all active employees so manager can also view/reset device bindings)
  const employeeSummaryRows = useMemo(() => {
    const map: Record<
      string,
      {
        empId?: string;
        name: string;
        status: string;
        boundDeviceId?: string | null;
        sessionsCount: number;
        breakMinutes: number;
        actualHours: number;
        scheduledHours: number;
      }
    > = {};

    const ensureEmp = (name: string) => {
      const key = name.trim().toLowerCase();
      if (!map[key]) {
        const empObj = employees.find(e => e.name.trim().toLowerCase() === key);
        const statusLabel = empObj
          ? empObj.status === '正式夥伴'
            ? '正職'
            : empObj.isOverseasStudent
              ? '僑生兼職'
              : '兼職'
          : '夥伴';
        map[key] = {
          empId: empObj?.id,
          name: empObj?.name || name.trim(),
          status: statusLabel,
          boundDeviceId: empObj?.boundDeviceId || null,
          sessionsCount: 0,
          breakMinutes: 0,
          actualHours: 0,
          scheduledHours: 0
        };
      }
      return map[key];
    };

    // Include active employees so device bindings and scheduled hours are visible
    employees
      .filter(e => e.active !== false)
      .forEach(e => {
        if (
          selectedEmployee === 'ALL' ||
          e.name.trim().toLowerCase() === selectedEmployee.trim().toLowerCase()
        ) {
          ensureEmp(e.name);
        }
      });

    filteredSessions.forEach(s => {
      const row = ensureEmp(s.employeeName);
      row.sessionsCount += 1;
      row.breakMinutes += s.breakMin;
      row.actualHours += s.hours;
    });

    schedules.forEach(sched => {
      if (onlyCurrentMonth && !sched.date.startsWith(currentMonthPrefix)) return;
      if (selectedStore !== 'ALL' && sched.workplace !== selectedStore) return;
      if (
        selectedEmployee !== 'ALL' &&
        sched.employeeName.trim().toLowerCase() !== selectedEmployee.trim().toLowerCase()
      ) {
        return;
      }
      if (sched.startTime && sched.endTime) {
        const eff = calculateEffectiveWorkHours(sched.startTime, sched.endTime);
        const key = sched.employeeName.trim().toLowerCase();
        if (map[key]) {
          map[key].scheduledHours += eff;
        }
      }
    });

    return Object.values(map).sort((a, b) => b.actualHours - a.actualHours);
  }, [filteredSessions, employees, schedules, onlyCurrentMonth, currentMonthPrefix, selectedStore, selectedEmployee]);

  const filteredEvents = useMemo(() => {
    return events
      .filter(e => {
        if (onlyCurrentMonth && !e.date.startsWith(currentMonthPrefix)) return false;
        if (selectedStore !== 'ALL' && e.workplace !== selectedStore) return false;
        if (
          selectedEmployee !== 'ALL' &&
          e.employeeName.trim().toLowerCase() !== selectedEmployee.trim().toLowerCase()
        ) {
          return false;
        }
        return true;
      })
      .slice()
      .reverse();
  }, [events, onlyCurrentMonth, currentMonthPrefix, selectedStore, selectedEmployee]);

  const handleUseCurrentGpsForStore = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert('您的瀏覽器不支援 GPS 定位功能');
      return;
    }
    setIsLocatingCurrent(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingCurrent(false);
        setLatInput(pos.coords.latitude.toFixed(6));
        setLngInput(pos.coords.longitude.toFixed(6));
      },
      (err) => {
        setIsLocatingCurrent(false);
        alert(`無法取得目前位置 (${err.message})，請確認已允許瀏覽器定位權限。`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveStoreGpsConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);
    const radius = parseInt(radiusInput, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius < 10) {
      alert('請輸入有效的經緯度座標與半徑（半徑至少 10 公尺）');
      return;
    }

    await saveWorkplaceGpsConfig({
      workplace: configStoreName,
      latitude: lat,
      longitude: lng,
      radiusMeters: radius,
      gpsRequired: gpsRequiredInput,
      deviceBindingRequired: deviceBindingRequiredInput
    });

    setConfigSavedNotice(`已儲存「${configStoreName}」的打卡定位與裝置綁定設定！`);
    setTimeout(() => setConfigSavedNotice(null), 3000);
  };

  const handleResetDeviceBinding = async (empId?: string, empName?: string) => {
    if (!empId) return;
    if (safeConfirm(`確定要解除「${empName}」的手機裝置綁定嗎？解除後該員工下次打卡將自動綁定新手機。`)) {
      await updateEmployee(empId, {
        boundDeviceId: null,
        boundDeviceUpdatedAt: null
      });
    }
  };

  const handleExportCsv = () => {
    const rows = [
      ['員工', '門市', '上班', '下班', '休息分鐘', '工時'],
      ...filteredSessions.map(s => [
        s.employeeName,
        s.workplace,
        s.startDisplay,
        s.endDisplay,
        String(s.breakMin),
        s.hours.toFixed(2)
      ])
    ];
    const csv =
      '\ufeff' +
      rows
        .map(r => r.map(x => `"${String(x).replaceAll('"', '""')}"`).join(','))
        .join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `attendance-hours-${onlyCurrentMonth ? currentMonthPrefix : 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDeleteEvent = async (evt: PunchEvent) => {
    if (safeConfirm(`確定要刪除「${evt.employeeName}」於 ${evt.date} ${evt.timeStr} 的「${ACTION_LABELS[evt.action]}」紀錄嗎？`)) {
      await deletePunchEvent(evt.id);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Store GPS Location & Device Binding Configuration Panel */}
      <article className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-4 bg-white/90">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DAC0A3]/40 pb-3">
          <div>
            <h2 className="text-base font-extrabold text-[#3E2723] flex items-center gap-2 flex-wrap">
              <span>📍</span>
              <span>門市打卡定位 (GPS) 與手機裝置綁定設定</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#6D4C41]/10 text-[#5D4037] border border-[#DAC0A3]/70">
                {configStoreName}
              </span>
            </h2>
            <p className="text-xs text-[#6D4C41] mt-0.5">
              設定本門市的 GPS 經緯度座標與允許打卡半徑，並啟用「1 人 1 機裝置綁定」防止他人切換帳號代打卡。
            </p>
          </div>
          {configSavedNotice && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              ✅ {configSavedNotice}
            </span>
          )}
        </div>

        <form onSubmit={handleSaveStoreGpsConfig} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-[#6D4C41] mb-1">門市緯度 (Latitude)</label>
              <input
                type="number"
                step="any"
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                placeholder="例如: 23.9688"
                className="w-full bg-white border border-[#DAC0A3]/80 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#3E2723]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#6D4C41] mb-1">門市經度 (Longitude)</label>
              <input
                type="number"
                step="any"
                value={lngInput}
                onChange={(e) => setLngInput(e.target.value)}
                placeholder="例如: 120.9625"
                className="w-full bg-white border border-[#DAC0A3]/80 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#3E2723]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#6D4C41] mb-1">允許打卡半徑 (公尺)</label>
              <input
                type="number"
                min={10}
                max={5000}
                value={radiusInput}
                onChange={(e) => setRadiusInput(e.target.value)}
                className="w-full bg-white border border-[#DAC0A3]/80 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#3E2723]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-bold text-[#3E2723] cursor-pointer">
                <input
                  type="checkbox"
                  checked={gpsRequiredInput}
                  onChange={(e) => setGpsRequiredInput(e.target.checked)}
                  className="rounded text-[#246b4c] focus:ring-[#246b4c] cursor-pointer"
                />
                <span>強制 GPS 距離檢核（須在門市 {radiusInput || 200}m 內才可打卡）</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-[#3E2723] cursor-pointer">
                <input
                  type="checkbox"
                  checked={deviceBindingRequiredInput}
                  onChange={(e) => setDeviceBindingRequiredInput(e.target.checked)}
                  className="rounded text-[#246b4c] focus:ring-[#246b4c] cursor-pointer"
                />
                <span>強制手機裝置綁定（1 人 1 機鎖定，禁止切換帳號代打卡）</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isLocatingCurrent}
                onClick={handleUseCurrentGpsForStore}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#FAF7F2] hover:bg-white text-[#315a48] border border-[#DAC0A3] cursor-pointer transition-all"
              >
                {isLocatingCurrent ? '定位中...' : '📍 填入我目前所在 GPS 座標'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#795548] hover:bg-[#5D4037] text-white cursor-pointer transition-all shadow-xs"
              >
                💾 儲存門市定位設定
              </button>
            </div>
          </div>
        </form>
      </article>

      {/* Main Calculation Panel */}
      <article className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-5 bg-white/90">
        {/* Title & Filter / Export Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#DAC0A3]/40 pb-4">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-[#3E2723] flex items-center gap-2">
              <span>⏱️</span>
              <span>打卡工時統計 (Punch Attendance & Hours Calculation)</span>
            </h2>
            <p className="text-xs text-[#6D4C41]">
              依員工上下班打卡時間與休息事件自動計算已完成班次之實際工時（已扣除休息時間）。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setOnlyCurrentMonth(prev => !prev)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${onlyCurrentMonth
                  ? 'bg-[#795548] text-white border-[#795548]'
                  : 'bg-white text-[#5D4037] border-[#DAC0A3]/70 hover:bg-[#FAF7F2]'
                }`}
            >
              {onlyCurrentMonth ? `📅 僅顯示 ${currentMonthPrefix} 月份` : '📅 顯示全部月份'}
            </button>

            {storeOptions.length > 1 && (
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="bg-white border border-[#DAC0A3]/70 rounded-xl px-3 py-2 text-xs font-bold text-[#3E2723] focus:outline-none focus:border-[#795548]"
              >
                <option value="ALL">全部門市</option>
                {storeOptions.map(st => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            )}

            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="bg-white border border-[#DAC0A3]/70 rounded-xl px-3 py-2 text-xs font-bold text-[#3E2723] focus:outline-none focus:border-[#795548]"
            >
              <option value="ALL">全部員工</option>
              {employeeOptions.map(emp => (
                <option key={emp} value={emp}>
                  {emp}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-[#246b4c] hover:bg-[#1d583e] text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>📥</span>
              <span>匯出 CSV</span>
            </button>
          </div>
        </div>

        {/* Stat Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#f0f6f2] border border-[#d8e2dc] p-4 rounded-xl">
            <span className="text-xs font-bold text-[#526b5b]">已完成班次</span>
            <b className="text-2xl font-black text-[#24352f] block mt-1 font-mono">
              {filteredSessions.length}
            </b>
            <span className="text-[11px] text-[#718077]">筆完整上下班紀錄</span>
          </div>

          <div className="bg-[#f0f6f2] border border-[#d8e2dc] p-4 rounded-xl">
            <span className="text-xs font-bold text-[#526b5b]">合計工時 (全部門市)</span>
            <b className="text-2xl font-black text-[#246b4c] block mt-1 font-mono">
              {totalAllStoresHours.toFixed(2)} <span className="text-sm font-bold">hrs</span>
            </b>
            <span className="text-[11px] text-[#718077]">已自動扣除休息時間</span>
          </div>

          <div className="bg-[#f0f6f2] border border-[#d8e2dc] p-4 rounded-xl">
            <span className="text-xs font-bold text-[#526b5b]">
              {selectedStore === 'ALL' ? '目前篩選門市工時' : `${selectedStore} 工時`}
            </span>
            <b className="text-2xl font-black text-[#3E2723] block mt-1 font-mono">
              {filteredStoreHours.toFixed(2)} <span className="text-sm font-bold">hrs</span>
            </b>
            <span className="text-[11px] text-[#718077]">
              {selectedStore === 'ALL' ? '所有門市總計' : '單一門市小計'}
            </span>
          </div>

          <div className="bg-[#FAF7F2] border border-[#DAC0A3]/60 p-4 rounded-xl">
            <span className="text-xs font-bold text-[#6D4C41]">目前執勤 / 休息中</span>
            <b className="text-2xl font-black text-[#795548] block mt-1 font-mono">
              {activeWorkersNow.length} <span className="text-sm font-bold">人</span>
            </b>
            <div className="text-[11px] text-[#8D6E63] truncate">
              {activeWorkersNow.length > 0
                ? activeWorkersNow.map(w => `${w.employeeName}${w.breakOn ? '(休)' : ''}`).join('、')
                : '目前無人打卡上班中'}
            </div>
          </div>
        </div>

        {/* Per-Employee Cumulative Hours & Device Binding Summary */}
        {employeeSummaryRows.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <h3 className="text-sm font-extrabold text-[#3E2723] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#246b4c]"></span>
              <span>各員工打卡工時彙總與裝置綁定管理</span>
            </h3>
            <div className="overflow-x-auto rounded-xl border border-[#DAC0A3]/40">
              <table className="w-full text-xs text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="bg-[#FAF7F2] text-[#5D4037] border-b border-[#DAC0A3]/50">
                    <th className="py-2.5 px-3.5 font-extrabold">員工姓名</th>
                    <th className="py-2.5 px-3.5 font-extrabold">身分</th>
                    <th className="py-2.5 px-3.5 font-extrabold">手機裝置綁定狀態</th>
                    <th className="py-2.5 px-3.5 font-extrabold text-center">已完成班次</th>
                    <th className="py-2.5 px-3.5 font-extrabold text-center">總休息分鐘</th>
                    <th className="py-2.5 px-3.5 font-extrabold text-right">打卡實際工時</th>
                    <th className="py-2.5 px-3.5 font-extrabold text-right">班表預定工時</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DAC0A3]/30 bg-white">
                  {employeeSummaryRows.map(row => (
                    <tr key={row.name} className="hover:bg-amber-50/30">
                      <td className="py-2.5 px-3.5 font-extrabold text-[#3E2723]">{row.name}</td>
                      <td className="py-2.5 px-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF7F2] border border-[#DAC0A3]/60 text-[#5D4037]">
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        {row.boundDeviceId ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[10px] font-bold">
                              📱 {row.boundDeviceId}
                            </span>
                            {row.empId && (
                              <button
                                type="button"
                                onClick={() => handleResetDeviceBinding(row.empId, row.name)}
                                className="text-[10px] font-bold text-rose-700 hover:text-rose-900 underline cursor-pointer"
                              >
                                解除綁定
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#8D6E63]">尚未綁定（首次打卡自動綁定）</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-mono font-bold text-[#3E2723]">
                        {row.sessionsCount} 班
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-mono text-[#6D4C41]">
                        {row.breakMinutes} 分鐘
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-black text-sm text-[#246b4c]">
                        {row.actualHours.toFixed(2)} h
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#795548]">
                        {row.scheduledHours.toFixed(1)} h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Completed Sessions Detail Table */}
        <div className="space-y-2.5 pt-2">
          <h3 className="text-sm font-extrabold text-[#3E2723] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#795548]"></span>
            <span>已完成班次工時明細</span>
          </h3>
          <div className="overflow-x-auto rounded-xl border border-[#DAC0A3]/40">
            <table className="w-full text-xs text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-[#f7f9f6] text-[#64776b] border-b border-[#DAC0A3]/50">
                  <th className="py-3 px-3.5 font-extrabold">員工</th>
                  <th className="py-3 px-3.5 font-extrabold">門市</th>
                  <th className="py-3 px-3.5 font-extrabold">上班</th>
                  <th className="py-3 px-3.5 font-extrabold">下班</th>
                  <th className="py-3 px-3.5 font-extrabold text-center">休息分鐘</th>
                  <th className="py-3 px-3.5 font-extrabold text-right">實際工時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0eb] bg-white">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#8D6E63]">
                      尚無完整班次
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map(s => (
                    <tr key={s.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                      <td className="py-3 px-3.5 font-extrabold text-[#3E2723]">{s.employeeName}</td>
                      <td className="py-3 px-3.5 text-[#5D4037] font-medium">{s.workplace}</td>
                      <td className="py-3 px-3.5 font-mono text-[#3E2723]">{s.startDisplay}</td>
                      <td className="py-3 px-3.5 font-mono text-[#3E2723]">{s.endDisplay}</td>
                      <td className="py-3 px-3.5 font-mono text-center text-[#6D4C41]">{s.breakMin}</td>
                      <td className="py-3 px-3.5 font-mono font-black text-right text-sm text-[#246b4c]">
                        {s.hours.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </article>

      {/* Raw Punch Events Log */}
      <article className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-4 bg-white/90">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-extrabold text-[#3E2723]">打卡原始紀錄明細 ({filteredEvents.length} 筆)</h3>
            <p className="text-[11px] text-[#8D6E63]">
              包含所有上班、開始休息、結束休息與下班打卡事件（含 GPS 距離與手機裝置代碼）。
            </p>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[320px] rounded-xl border border-[#DAC0A3]/40">
          <table className="w-full text-xs text-left border-collapse min-w-[680px]">
            <thead className="sticky top-0 bg-[#FAF7F2] border-b border-[#DAC0A3]/50 text-[#5D4037]">
              <tr>
                <th className="py-2.5 px-3.5 font-extrabold">日期時間</th>
                <th className="py-2.5 px-3.5 font-extrabold">員工</th>
                <th className="py-2.5 px-3.5 font-extrabold">門市</th>
                <th className="py-2.5 px-3.5 font-extrabold">動作</th>
                <th className="py-2.5 px-3.5 font-extrabold">GPS 距離 / 裝置</th>
                <th className="py-2.5 px-3.5 font-extrabold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DAC0A3]/25 bg-white">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[#8D6E63]">
                    尚無打卡事件紀錄
                  </td>
                </tr>
              ) : (
                filteredEvents.map(evt => (
                  <tr key={evt.id} className="hover:bg-[#FAF7F2]/50">
                    <td className="py-2.5 px-3.5 font-mono text-[#3E2723]">
                      {evt.date} {evt.timeStr}
                    </td>
                    <td className="py-2.5 px-3.5 font-bold text-[#3E2723]">{evt.employeeName}</td>
                    <td className="py-2.5 px-3.5 text-[#5D4037]">{evt.workplace}</td>
                    <td className="py-2.5 px-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${ACTION_BADGE_STYLES[evt.action]}`}
                      >
                        {ACTION_LABELS[evt.action]}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#6D4C41]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {evt.distanceMeters != null && evt.distanceMeters >= 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            📍 {evt.distanceMeters}m
                          </span>
                        )}
                        {evt.deviceId && (
                          <span className="px-1.5 py-0.2 rounded bg-[#FAF7F2] text-[#5D4037] border border-[#DAC0A3]/60">
                            📱 {evt.deviceId}
                          </span>
                        )}
                        {evt.distanceMeters == null && !evt.deviceId && '—'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(evt)}
                        className="text-rose-700 hover:text-rose-900 font-bold text-[11px] px-2 py-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
};
