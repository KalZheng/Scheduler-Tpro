import React from 'react';
import type { WorkerAvailability } from '../../services/scheduler';
import { DAYS_OF_WEEK } from '../../utils/constants';
import { formatDateString, compareTimeStrings, getCleanNote } from '../../utils/dateUtils';

interface WorkerAvailFormProps {
  workerName: string;
  isFullTime: boolean;
  workerNextMonthStart: Date;
  isWorkerEditable: boolean;
  startDay: number;
  deadlineDay: number;
  availSelectedDates: string[];
  workerCalendarGridDates: Date[];
  availNotes: string;
  setAvailNotes: (val: string) => void;
  onWorkerLogout: () => void;
  onAddAvailability: (e: React.FormEvent) => void;
  onOpenWorkerAvailModal: () => void;
  toggleAvailDateSelection: (dateStr: string) => void;
  handleSelectAvailMonWedFri: () => void;
  handleSelectAvailTueThu: () => void;
  handleSelectAvailAllDays: () => void;
  handleClearAvailAllSelected: () => void;
  getWorkerDisplayAvailabilities: () => any[];
  handleEditAvailability: (avail: WorkerAvailability) => void;
  handleDeleteAvailability: (id: string, e: React.MouseEvent) => void;
}

export const WorkerAvailForm: React.FC<WorkerAvailFormProps> = ({
  workerName,
  isFullTime,
  workerNextMonthStart,
  isWorkerEditable,
  startDay,
  deadlineDay,
  availSelectedDates,
  workerCalendarGridDates,
  availNotes,
  setAvailNotes,
  onWorkerLogout,
  onAddAvailability,
  onOpenWorkerAvailModal,
  toggleAvailDateSelection,
  handleSelectAvailMonWedFri,
  handleSelectAvailTueThu,
  handleSelectAvailAllDays,
  handleClearAvailAllSelected,
  getWorkerDisplayAvailabilities,
  handleEditAvailability,
  handleDeleteAvailability
}) => {
  const todayStr = formatDateString(new Date());

  return (
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
          onClick={onWorkerLogout}
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
                    : `目前已逾下月排班登記截止時間（每月 ${deadlineDay} 日），且店長已開始為您確認/安排排班，因此目前已鎖定登記。如有特殊需求，請直接聯繫店長。`}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={onAddAvailability} className="space-y-4 pt-2">
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
              onClick={!isFullTime ? onOpenWorkerAvailModal : undefined}
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
    </div>
  );
};
