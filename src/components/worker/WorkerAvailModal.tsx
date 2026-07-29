import React from 'react';
import type { WorkerAvailConfig } from '../../App';
import type { WorkerAvailability, PtAvailMode } from '../../services/scheduler';
import workplaces from '../../config/workplaces.json';
import { calculateDuration, isOverEightHours } from '../../utils/dateUtils';

interface WorkerAvailModalProps {
  isWorkerAvailModalOpen: boolean;
  setIsWorkerAvailModalOpen: (val: boolean) => void;
  availConfigs: WorkerAvailConfig[];
  workerName: string;
  timeSlots: string[];
  availabilities: WorkerAvailability[];
  handleSyncAllAvailConfigs: () => void;
  updateAvailConfig: (index: number, updates: Partial<WorkerAvailConfig>) => void;
  removeAvailConfig: (index: number) => void;
  handleWorkerAvailModalSubmit: () => void;
  ptAvailMode?: PtAvailMode;
}

export const WorkerAvailModal: React.FC<WorkerAvailModalProps> = ({
  isWorkerAvailModalOpen,
  setIsWorkerAvailModalOpen,
  availConfigs,
  workerName,
  timeSlots,
  availabilities,
  handleSyncAllAvailConfigs,
  updateAvailConfig,
  removeAvailConfig,
  handleWorkerAvailModalSubmit,
  ptAvailMode = 'both'
}) => {
  if (!isWorkerAvailModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#3E2723]/30 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="glass-panel rounded-3xl w-full max-w-xl max-h-[92vh] sm:max-h-[85vh] overflow-hidden shadow-2xl border border-[#DAC0A3]/50 flex flex-col my-auto">
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

            const pct = maxEndIdx > minStartIdx ? ((dividerIdx - minStartIdx) / (maxEndIdx - minStartIdx)) * 100 : 0;
            const startPct = maxEndIdx > minStartIdx ? ((config.startIdx - minStartIdx) / (maxEndIdx - minStartIdx)) * 100 : 0;
            const endPct = maxEndIdx > minStartIdx ? ((config.endIdx - minStartIdx) / (maxEndIdx - minStartIdx)) * 100 : 100;

            const posToIdx = (clientX: number, rect: DOMRect) => {
              const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
              const rawIdx = minStartIdx + pct * (maxEndIdx - minStartIdx);
              return Math.round(rawIdx);
            };

            const handleCommit = (nextDividerIdx: number, nextMode: 'until' | 'from') => {
              let start = nextMode === 'until' ? minStartIdx : nextDividerIdx;
              let end = nextMode === 'until' ? nextDividerIdx : maxEndIdx;

              if (nextMode === 'until') {
                if (end < minStartIdx + 1) end = minStartIdx + 1;
              } else {
                if (start > maxEndIdx - 1) start = maxEndIdx - 1;
              }

              updateAvailConfig(index, { startIdx: start, endIdx: end });
            };

            const onSingleHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
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

            const onStartHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
              e.preventDefault();
              const track = e.currentTarget.parentElement;
              if (!track) return;
              const rect = track.getBoundingClientRect();

              const onMove = (ev: PointerEvent) => {
                const nextIdx = posToIdx(ev.clientX, rect);
                const nextStart = Math.min(config.endIdx - 1, Math.max(minStartIdx, nextIdx));
                updateAvailConfig(index, { startIdx: nextStart });
              };

              const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
              };

              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
            };

            const onEndHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
              e.preventDefault();
              const track = e.currentTarget.parentElement;
              if (!track) return;
              const rect = track.getBoundingClientRect();

              const onMove = (ev: PointerEvent) => {
                const nextIdx = posToIdx(ev.clientX, rect);
                const nextEnd = Math.min(maxEndIdx, Math.max(config.startIdx + 1, nextIdx));
                updateAvailConfig(index, { endIdx: nextEnd });
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
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#795548] shrink-0"></span>
                      <span className="text-sm font-bold text-[#3E2723]">{config.date}</span>
                      <span className="text-xs text-[#6D4C41] bg-[#8D6E63]/10 px-2 py-0.5 rounded font-medium">週{dayName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-4">
                      <span className="text-sm font-mono font-bold text-[#795548]">{startTime} – {endTime}</span>
                      <span className="text-[11px] text-[#8D6E63]">({Math.round((duration - 1) * 10) / 10} 有效工時)</span>
                      {overEight && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold">⚠️ 超過8小時</span>
                      )}
                    </div>
                  </div>
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

                <div className="space-y-4 pt-1">
                  {ptAvailMode === 'flex' ? (
                    /* Flex Mode: Dual handles, no mode buttons */
                    <div className="relative h-8 mx-2 select-none">
                      <div className="absolute top-2.5 left-0 right-0 h-3 bg-[#EADBC8] rounded-full" />
                      <div
                        className="absolute top-2.5 h-3 rounded-full transition-all"
                        style={{
                          left: `${startPct}%`,
                          width: `${endPct - startPct}%`,
                          backgroundColor: '#8D6E63',
                        }}
                      />

                      {/* Start Handle */}
                      <div
                        onPointerDown={onStartHandleDown}
                        className="absolute top-1.5 w-5 h-5 rounded-full bg-white border-2 shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center z-10"
                        style={{
                          left: `${startPct}%`,
                          borderColor: '#795548',
                          transform: 'translateX(-50%)',
                          touchAction: 'none'
                        }}
                        title={`開始時間: ${startTime}`}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-[#795548]" />
                      </div>

                      {/* End Handle */}
                      <div
                        onPointerDown={onEndHandleDown}
                        className="absolute top-1.5 w-5 h-5 rounded-full bg-white border-2 shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center z-10"
                        style={{
                          left: `${endPct}%`,
                          borderColor: '#795548',
                          transform: 'translateX(-50%)',
                          touchAction: 'none'
                        }}
                        title={`結束時間: ${endTime}`}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-[#795548]" />
                      </div>
                    </div>
                  ) : (
                    /* Static Mode: Single handle, with until/from buttons */
                    <div className="relative h-8 mx-2 select-none">
                      <div className="absolute top-2.5 left-0 right-0 h-3 bg-[#EADBC8] rounded-full" />
                      <div
                        onClick={() => handleCommit(dividerIdx, currentMode === 'until' ? 'from' : 'until')}
                        className="absolute top-2.5 h-3 rounded-full cursor-pointer transition-all"
                        style={{
                          left: currentMode === 'until' ? '0%' : `${pct}%`,
                          width: currentMode === 'until' ? `${pct}%` : `${100 - pct}%`,
                          backgroundColor: '#8D6E63',
                        }}
                      />
                      <div
                        onClick={() => handleCommit(dividerIdx, 'until')}
                        className="absolute top-2.5 left-0 h-3 cursor-pointer"
                        style={{ width: `${pct}%` }}
                      />
                      <div
                        onClick={() => handleCommit(dividerIdx, 'from')}
                        className="absolute top-2.5 right-0 h-3 cursor-pointer"
                        style={{ width: `${100 - pct}%` }}
                      />
                      <div
                        onPointerDown={onSingleHandleDown}
                        className="absolute top-1.5 w-5 h-5 rounded-full bg-white border-2 shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center z-10"
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
                  )}

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
                        const isCurrent = ptAvailMode === 'flex'
                          ? tick.idx === config.startIdx || tick.idx === config.endIdx
                          : tick.idx === dividerIdx;
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

                  {ptAvailMode === 'static' && (
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
                  )}
                </div>

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

        {/* Modal Footer */}
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
  );
};
