import React, { useState, useEffect, useMemo } from 'react';
import {
  subscribeToPunchEvents,
  subscribeToWorkplaceGpsConfigs,
  addPunchEvent,
  updateEmployee,
  getOrCreateLocalDeviceToken,
  calculateGpsDistanceMeters,
  DEFAULT_WORKPLACE_GPS_CONFIGS,
  type PunchEvent,
  type PunchAction,
  type WorkSchedule,
  type Employee,
  type WorkplaceGpsConfig
} from '../../services/scheduler';
import workplaces from '../../config/workplaces.json';

interface WorkerPunchViewProps {
  workerName: string;
  loggedInEmployee?: Employee;
  employees: Employee[];
  schedules: WorkSchedule[];
}

function getTaipeiDateTime(d: Date = new Date()): { dateStr: string; timeStr: string } {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d);
  const [dateStr, timeStr] = formatted.split(' ');
  return {
    dateStr: dateStr || '',
    timeStr: timeStr || ''
  };
}

const ACTION_LABELS: Record<PunchAction, string> = {
  in: '上班',
  breakStart: '休息開始',
  breakEnd: '休息結束',
  out: '下班'
};

const ACTION_BADGE_STYLES: Record<PunchAction, string> = {
  in: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  breakStart: 'bg-amber-100 text-amber-800 border-amber-200',
  breakEnd: 'bg-sky-100 text-sky-800 border-sky-200',
  out: 'bg-[#F5EBE6] text-[#5D4037] border-[#DAC0A3]'
};

export const WorkerPunchView: React.FC<WorkerPunchViewProps> = ({
  workerName,
  loggedInEmployee,
  employees,
  schedules
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [allEvents, setAllEvents] = useState<PunchEvent[]>([]);
  const [gpsConfigs, setGpsConfigs] = useState<Record<string, WorkplaceGpsConfig>>(
    DEFAULT_WORKPLACE_GPS_CONFIGS
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // GPS verification state for current session
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [gpsResult, setGpsResult] = useState<{
    verified: boolean;
    latitude: number;
    longitude: number;
    distanceMeters: number;
    errorMsg?: string;
  } | null>(null);

  const localDeviceToken = useMemo(() => getOrCreateLocalDeviceToken(), []);

  const { dateStr: todayDateStr, timeStr: currentClockStr } = useMemo(
    () => getTaipeiDateTime(now),
    [now]
  );

  // Today's scheduled shifts for this worker
  const todayShifts = useMemo(() => {
    const cleanName = workerName.trim().toLowerCase();
    return schedules.filter(
      s => s.date === todayDateStr && s.employeeName.trim().toLowerCase() === cleanName
    );
  }, [schedules, todayDateStr, workerName]);

  const storeOptions = useMemo(() => {
    const set = new Set<string>(workplaces.map(w => w.name));
    Object.keys(gpsConfigs).forEach(k => set.add(k));
    const list = Array.from(set);
    return list.length > 0 ? list : ['埔里酒廠門市'];
  }, [gpsConfigs]);

  const [selectedStore, setSelectedStore] = useState<string>(() => {
    return workplaces[0]?.name || '埔里酒廠門市';
  });

  // Sync default store if today's scheduled shift specifies a workplace
  useEffect(() => {
    if (todayShifts.length > 0 && todayShifts[0].workplace) {
      setSelectedStore(todayShifts[0].workplace);
    }
  }, [todayShifts]);

  // Reset GPS verification when switching store or worker
  useEffect(() => {
    setGpsResult(null);
  }, [selectedStore, workerName]);

  // Live 1-second clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Subscribe to punch events & GPS configs
  useEffect(() => {
    const unsubEvents = subscribeToPunchEvents((events) => {
      setAllEvents(events);
    });
    const unsubGps = subscribeToWorkplaceGpsConfigs((configs) => {
      setGpsConfigs(configs);
    });
    return () => {
      unsubEvents();
      unsubGps();
    };
  }, []);

  const currentStoreGpsConfig: WorkplaceGpsConfig = useMemo(() => {
    return (
      gpsConfigs[selectedStore] || {
        workplace: selectedStore,
        latitude: 23.9688,
        longitude: 120.9625,
        radiusMeters: 200,
        gpsRequired: true,
        deviceBindingRequired: true
      }
    );
  }, [gpsConfigs, selectedStore]);

  // Evaluate Device Binding status (防代打卡檢核)
  const deviceCheck = useMemo(() => {
    // 1. Check if this device token is already bound to a DIFFERENT employee
    const boundToOther = employees.find(
      e =>
        e.active !== false &&
        e.boundDeviceId === localDeviceToken &&
        e.name.trim().toLowerCase() !== workerName.trim().toLowerCase()
    );
    if (boundToOther) {
      return {
        allowed: false,
        statusLabel: `裝置衝突：此手機已綁定給「${boundToOther.name}」`,
        reason: `此手機裝置 (${localDeviceToken}) 已綁定為「${boundToOther.name}」專屬打卡裝置，不可切換帳號代替他人打卡！`
      };
    }

    // 2. Check if loggedInEmployee is already bound to a DIFFERENT device
    if (
      loggedInEmployee?.boundDeviceId &&
      loggedInEmployee.boundDeviceId !== localDeviceToken
    ) {
      return {
        allowed: false,
        statusLabel: `非綁定手機（已綁定: ${loggedInEmployee.boundDeviceId}）`,
        reason: `您的帳號已綁定另一支手機 (${loggedInEmployee.boundDeviceId})，目前裝置為 (${localDeviceToken})。如需更換手機請聯繫主管解除綁定。`
      };
    }

    // 3. Either already bound to this device, or unbound (will auto-bind on first punch)
    const isAlreadyBoundToThis = loggedInEmployee?.boundDeviceId === localDeviceToken;
    return {
      allowed: true,
      isAlreadyBoundToThis,
      statusLabel: isAlreadyBoundToThis
        ? `本機已綁定 (${localDeviceToken})`
        : `首次打卡將自動綁定本機 (${localDeviceToken})`,
      reason: ''
    };
  }, [employees, loggedInEmployee, localDeviceToken, workerName]);

  const showNotice = (msg: string) => {
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Verify GPS Location via Browser Geolocation API
  const handleVerifyGps = (): Promise<{
    verified: boolean;
    latitude: number;
    longitude: number;
    distanceMeters: number;
  } | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        const msg = '您的瀏覽器不支援 GPS 定位功能';
        setGpsResult({ verified: false, latitude: 0, longitude: 0, distanceMeters: -1, errorMsg: msg });
        showNotice(msg);
        resolve(null);
        return;
      }

      setIsLocatingGps(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocatingGps(false);
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const dist = calculateGpsDistanceMeters(
            lat,
            lng,
            currentStoreGpsConfig.latitude,
            currentStoreGpsConfig.longitude
          );
          const withinRadius = dist <= currentStoreGpsConfig.radiusMeters;
          const res = {
            verified: withinRadius,
            latitude: lat,
            longitude: lng,
            distanceMeters: dist,
            errorMsg: withinRadius
              ? undefined
              : `距離「${selectedStore}」約 ${dist} 公尺，超出允許打卡範圍 (${currentStoreGpsConfig.radiusMeters}m)`
          };
          setGpsResult(res);
          if (withinRadius) {
            showNotice(`✅ GPS 定位驗證成功（距離門市 ${dist}m）`);
          } else {
            showNotice(`❌ 超出門市範圍：目前距離 ${dist}m（上限 ${currentStoreGpsConfig.radiusMeters}m）`);
          }
          resolve(res);
        },
        (err) => {
          setIsLocatingGps(false);
          let errMsg = '無法取得 GPS 定位，請開啟手機定位權限';
          if (err.code === 1) errMsg = '請允許瀏覽器存取您的「位置資訊 (GPS)」權限後再試一次';
          if (err.code === 2) errMsg = '無法偵測目前位置，請確認手機 GPS 已開啟';
          if (err.code === 3) errMsg = 'GPS 定位逾時，請再試一次';
          setGpsResult({ verified: false, latitude: 0, longitude: 0, distanceMeters: -1, errorMsg: errMsg });
          showNotice(errMsg);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  };

  // Filter events belonging to this logged-in worker
  const workerEvents = useMemo(() => {
    const cleanName = workerName.trim().toLowerCase();
    return allEvents.filter(
      e => e.employeeName.trim().toLowerCase() === cleanName
    );
  }, [allEvents, workerName]);

  // Evaluate current attendance state machine (active, breakOn) across the worker's events
  const punchState = useMemo(() => {
    let active = false;
    let breakOn = false;
    for (const e of workerEvents) {
      if (e.action === 'in') {
        active = true;
        breakOn = false;
      } else if (e.action === 'breakStart') {
        breakOn = true;
      } else if (e.action === 'breakEnd') {
        breakOn = false;
      } else if (e.action === 'out') {
        active = false;
        breakOn = false;
      }
    }
    return { active, breakOn };
  }, [workerEvents]);

  // Today's punch events (newest first)
  const todayEvents = useMemo(() => {
    return workerEvents
      .filter(e => e.date === todayDateStr)
      .slice()
      .reverse();
  }, [workerEvents, todayDateStr]);

  // Completed work sessions for this worker (recent 5)
  const completedSessions = useMemo(() => {
    const out: {
      id: string;
      workplace: string;
      date: string;
      startStr: string;
      endStr: string;
      breakMin: number;
      hours: number;
    }[] = [];

    let startEvt: PunchEvent | null = null;
    let restEvt: PunchEvent | null = null;
    let breakMs = 0;

    for (const e of workerEvents) {
      if (e.action === 'in') {
        startEvt = e;
        restEvt = null;
        breakMs = 0;
      } else if (e.action === 'breakStart' && startEvt) {
        restEvt = e;
      } else if (e.action === 'breakEnd' && restEvt) {
        breakMs += Math.max(0, Date.parse(e.timestamp) - Date.parse(restEvt.timestamp));
        restEvt = null;
      } else if (e.action === 'out' && startEvt) {
        const totalMs = Date.parse(e.timestamp) - Date.parse(startEvt.timestamp) - breakMs;
        if (totalMs >= 0) {
          out.push({
            id: e.id,
            workplace: e.workplace || selectedStore,
            date: startEvt.date,
            startStr: startEvt.timeStr.slice(0, 5),
            endStr: e.timeStr.slice(0, 5),
            breakMin: Math.round(breakMs / 60000),
            hours: totalMs / 3600000
          });
        }
        startEvt = null;
        restEvt = null;
      }
    }

    return out.slice(-5).reverse();
  }, [workerEvents, selectedStore]);

  const handleRecordPunch = async (action: PunchAction) => {
    if (isSubmitting || isLocatingGps) return;

    // 1. Check attendance state machine first
    if (action === 'in' && punchState.active) {
      showNotice('目前已有未結束的上班紀錄');
      return;
    }
    if (action !== 'in' && !punchState.active) {
      showNotice('請先上班打卡');
      return;
    }
    if (action === 'breakStart' && punchState.breakOn) {
      showNotice('目前正在休息');
      return;
    }
    if (action === 'breakEnd' && !punchState.breakOn) {
      showNotice('目前沒有進行中的休息');
      return;
    }
    if (action === 'out' && punchState.breakOn) {
      showNotice('請先結束休息再下班');
      return;
    }

    // 2. Check Device Binding (防代打卡)
    if (currentStoreGpsConfig.deviceBindingRequired && !deviceCheck.allowed) {
      showNotice(deviceCheck.reason);
      return;
    }

    // 3. Check GPS Geofencing (if required by store config)
    let activeGps = gpsResult;
    if (currentStoreGpsConfig.gpsRequired) {
      if (!activeGps || !activeGps.verified) {
        activeGps = await handleVerifyGps();
        if (!activeGps || !activeGps.verified) {
          return;
        }
      }
    }

    try {
      setIsSubmitting(true);
      const clickTime = new Date();
      const { dateStr, timeStr } = getTaipeiDateTime(clickTime);

      // Auto-bind device on first punch if employee has no boundDeviceId yet
      if (loggedInEmployee && !loggedInEmployee.boundDeviceId) {
        await updateEmployee(loggedInEmployee.id, {
          boundDeviceId: localDeviceToken,
          boundDeviceUpdatedAt: Date.now()
        });
      }

      await addPunchEvent({
        employeeName: workerName.trim(),
        workplace: selectedStore,
        action,
        timestamp: clickTime.toISOString(),
        date: dateStr,
        timeStr,
        latitude: activeGps?.latitude ?? null,
        longitude: activeGps?.longitude ?? null,
        distanceMeters: activeGps?.distanceMeters ?? null,
        deviceId: localDeviceToken
      });

      showNotice(`${ACTION_LABELS[action]}打卡成功（${timeStr}）`);
    } catch (err) {
      console.error('Failed to record punch:', err);
      showNotice('打卡失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  const empBadgeText = loggedInEmployee
    ? loggedInEmployee.status === '正式夥伴'
      ? '正職'
      : loggedInEmployee.isOverseasStudent
        ? '僑生兼職'
        : '兼職'
    : '夥伴';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Left Panel: Live Clock, GPS + Device Verification & 4 Punch Action Buttons */}
      <article className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-5">
        {/* Top Row: Store & Employee Info */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
            <label className="text-xs font-semibold text-[#6D4C41]">所屬門市 / 地點</label>
            {storeOptions.length > 1 ? (
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="bg-white border border-[#DAC0A3]/70 rounded-xl px-3 py-2 text-sm font-bold text-[#3E2723] focus:outline-none focus:border-[#6D4C41] transition-colors"
              >
                {storeOptions.map(store => (
                  <option key={store} value={store}>
                    {store}
                  </option>
                ))}
              </select>
            ) : (
              <div className="bg-[#FAF7F2] border border-[#DAC0A3]/60 rounded-xl px-3.5 py-2 text-sm font-extrabold text-[#3E2723]">
                📍 {selectedStore}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
            <label className="text-xs font-semibold text-[#6D4C41]">打卡員工</label>
            <div className="bg-[#FAF7F2] border border-[#DAC0A3]/60 rounded-xl px-3.5 py-2 text-sm font-extrabold text-[#3E2723] flex items-center justify-between">
              <span>{workerName}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#6D4C41]/15 text-[#5D4037] font-bold">
                {empBadgeText}
              </span>
            </div>
          </div>
        </div>

        {/* Today's Scheduled Shift Banner (if any) */}
        {todayShifts.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-[#5D4037]">
            <span className="font-bold">📅 今日排定班表：</span>
            <div className="flex flex-wrap gap-2 font-mono font-extrabold text-[#3E2723]">
              {todayShifts.map(s => (
                <span key={s.id} className="bg-white px-2 py-0.5 rounded border border-amber-300/70">
                  {s.startTime} – {s.endTime} ({s.workplace})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Live Digital Clock */}
        <div className="py-4 text-center space-y-1.5 bg-[#FAF7F2]/70 rounded-2xl border border-[#DAC0A3]/35">
          <div className="text-4xl sm:text-5xl font-black tracking-tight text-[#3E2723] font-mono tabular-nums">
            {currentClockStr}
          </div>
          <div className="text-xs font-semibold text-[#8D6E63]">
            {todayDateStr} · 台灣時間
          </div>

          {/* Current Attendance Status Pill */}
          <div className="pt-2 flex justify-center">
            {punchState.active ? (
              punchState.breakOn ? (
                <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
                  狀態：休息中
                </span>
              ) : (
                <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span>
                  狀態：工作中（已上班打卡）
                </span>
              )
            ) : (
              <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-[#F3EDE2] text-[#6D4C41] border border-[#DAC0A3]/60">
                狀態：尚未上班 / 已下班
              </span>
            )}
          </div>
        </div>

        {/* GPS Geofencing & Device Binding Verification Pills */}
        <div className="space-y-2.5 bg-[#FAF7F2]/80 p-3.5 rounded-xl border border-[#DAC0A3]/50">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* GPS Status Pill */}
            {!currentStoreGpsConfig.gpsRequired ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                📍 GPS 檢核：門市已設為免定位
              </span>
            ) : gpsResult?.verified ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                📍 GPS 定位：成功（距門市 {gpsResult.distanceMeters}m / 限 {currentStoreGpsConfig.radiusMeters}m）
              </span>
            ) : gpsResult && !gpsResult.verified ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                📍 GPS 定位：{gpsResult.distanceMeters >= 0 ? `距離過遠 (${gpsResult.distanceMeters}m > ${currentStoreGpsConfig.radiusMeters}m)` : '定位失敗'}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                📍 GPS 定位：未驗證（限距門市 {currentStoreGpsConfig.radiusMeters}m 內）
              </span>
            )}

            {/* Device Binding Status Pill */}
            {!currentStoreGpsConfig.deviceBindingRequired ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                📱 裝置綁定：未強制
              </span>
            ) : deviceCheck.allowed ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                📱 {deviceCheck.statusLabel}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                🚫 {deviceCheck.statusLabel}
              </span>
            )}
          </div>

          {!deviceCheck.allowed && currentStoreGpsConfig.deviceBindingRequired && (
            <p className="text-[11px] text-rose-700 font-bold text-center leading-relaxed">
              {deviceCheck.reason}
            </p>
          )}

          {gpsResult?.errorMsg && (
            <p className="text-[11px] text-rose-700 font-bold text-center leading-relaxed">
              {gpsResult.errorMsg}
            </p>
          )}

          {currentStoreGpsConfig.gpsRequired && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                disabled={isLocatingGps}
                onClick={handleVerifyGps}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-white hover:bg-[#FAF7F2] text-[#315a48] border border-[#DAC0A3] shadow-2xs cursor-pointer transition-all flex items-center gap-1.5"
              >
                <span>📍</span>
                <span>{isLocatingGps ? '正在取得手機 GPS 定位...' : '驗證目前 GPS 定位'}</span>
              </button>
            </div>
          )}
        </div>

        {/* 4 Punch Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isSubmitting || isLocatingGps}
            onClick={() => handleRecordPunch('in')}
            className={`col-span-2 py-4 px-5 rounded-xl font-extrabold text-base transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer ${!punchState.active
                ? 'bg-[#246b4c] hover:bg-[#1d583e] text-white shadow-emerald-900/10'
                : 'bg-[#246b4c]/80 hover:bg-[#246b4c] text-white'
              }`}
          >
            <span>🟢</span>
            <span>上班打卡</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting || isLocatingGps}
            onClick={() => handleRecordPunch('breakStart')}
            className="py-3 px-4 rounded-xl font-bold text-sm bg-white hover:bg-[#FAF7F2] text-[#315a48] border border-[#DAC0A3]/80 transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>☕</span>
            <span>開始休息</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting || isLocatingGps}
            onClick={() => handleRecordPunch('breakEnd')}
            className="py-3 px-4 rounded-xl font-bold text-sm bg-white hover:bg-[#FAF7F2] text-[#315a48] border border-[#DAC0A3]/80 transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>⚡</span>
            <span>結束休息</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting || isLocatingGps}
            onClick={() => handleRecordPunch('out')}
            className="col-span-2 py-3.5 px-5 rounded-xl font-extrabold text-sm bg-[#6D4C41] hover:bg-[#5D4037] text-white transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <span>🏁</span>
            <span>下班打卡</span>
          </button>
        </div>
      </article>

      {/* Right Panel: Today's Punch Log (本日打卡紀錄) & Recent Sessions */}
      <article className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-[#DAC0A3]/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#246b4c]"></span>
            <h2 className="text-base font-bold text-[#3E2723]">本日打卡紀錄</h2>
          </div>
          <span className="text-xs font-mono font-bold text-[#8D6E63]">{todayDateStr}</span>
        </div>

        {todayEvents.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#8D6E63] bg-[#FAF7F2]/50 rounded-xl border border-dashed border-[#DAC0A3]/60">
            尚無今日打卡紀錄
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
            {todayEvents.map(evt => (
              <div
                key={evt.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-[#DAC0A3]/45 shadow-2xs"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${ACTION_BADGE_STYLES[evt.action]}`}
                  >
                    {ACTION_LABELS[evt.action]}
                  </span>
                  <span className="text-xs text-[#6D4C41] font-medium">
                    {evt.workplace}
                  </span>
                  {evt.distanceMeters != null && evt.distanceMeters >= 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                      📍 {evt.distanceMeters}m
                    </span>
                  )}
                </div>
                <strong className="font-mono text-sm font-black text-[#3E2723] tabular-nums">
                  {evt.timeStr}
                </strong>
              </div>
            ))}
          </div>
        )}

        {/* Recent Completed Shift Sessions */}
        {completedSessions.length > 0 && (
          <div className="pt-4 border-t border-[#DAC0A3]/40 space-y-3">
            <h3 className="text-xs font-bold text-[#6D4C41] uppercase tracking-wider">
              近期已完成班次工時
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DAC0A3]/40 text-[#8D6E63]">
                    <th className="py-2 pr-2 font-bold">日期</th>
                    <th className="py-2 px-2 font-bold">上班–下班</th>
                    <th className="py-2 px-2 font-bold">休息</th>
                    <th className="py-2 pl-2 text-right font-bold">實際工時</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DAC0A3]/25">
                  {completedSessions.map(s => (
                    <tr key={s.id} className="text-[#3E2723]">
                      <td className="py-2 pr-2 font-mono font-semibold">{s.date.slice(5)}</td>
                      <td className="py-2 px-2 font-mono">
                        {s.startStr}–{s.endStr}
                      </td>
                      <td className="py-2 px-2 font-mono text-[#6D4C41]">{s.breakMin} 分</td>
                      <td className="py-2 pl-2 text-right font-mono font-extrabold text-[#246b4c]">
                        {s.hours.toFixed(2)} h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </article>

      {/* Bottom Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 left-4 right-4 max-w-md mx-auto bg-[#203e30] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-bold text-center z-50 animate-fade-in">
          {toastMsg}
        </div>
      )}
    </div>
  );
};
