import React from 'react';
import type { WorkSchedule, WorkerAvailability, Employee } from '../../services/scheduler';
import { DAYS_OF_WEEK } from '../../utils/constants';
import workplaces from '../../config/workplaces.json';
import { formatDateString, compareTimeStrings, getCleanNote } from '../../utils/dateUtils';

interface ManagerGridViewProps {
  gridContainerRef: React.RefObject<HTMLDivElement | null>;
  gridDates: Date[];
  todayStr: string;
  selectedDateStr: string;
  setSelectedDateStr: (val: string) => void;
  allEmployees: string[];
  employees: Employee[];
  schedules: WorkSchedule[];
  availabilities: WorkerAvailability[];
  markedEmptyCells: Record<string, boolean>;
  activeRole: 'worker' | 'manager';
  setContextMenu: (ctx: any) => void;
  getDateTotalHours: (dateStr: string) => number;
  getIsDayUnderstaffed: (dateStr: string) => boolean;
  getDayNote: (dateStr: string) => string;
  handleUpdateDayNote: (dateStr: string, note: string) => void;
  handleMoveEmployeeUp: (name: string) => void;
  handleMoveEmployeeDown: (name: string) => void;
  getScheduleTheme: (schedule: WorkSchedule) => any;
  getManagerNote: (schedule: WorkSchedule) => string;
  handleOpenEditModal: (schedule: WorkSchedule, e: React.MouseEvent) => void;
  handleInstantAssign: (avail: WorkerAvailability) => void;
  setModalMode: (mode: 'create' | 'edit') => void;
  setEditingId: (id: string | null) => void;
  setEmployeeName: (name: string) => void;
  setWorkplace: (wp: string) => void;
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;
  setNotes: (notes: string) => void;
  setSelectedDates: (dates: string[]) => void;
  setFormOriginalStartTime: (time: string | null) => void;
  setFormOriginalEndTime: (time: string | null) => void;
  setIsModalOpen: (open: boolean) => void;
  erpDays?: number[];
}

export const ManagerGridView: React.FC<ManagerGridViewProps> = ({
  gridContainerRef,
  gridDates,
  todayStr,
  selectedDateStr,
  setSelectedDateStr,
  allEmployees,
  employees,
  schedules,
  availabilities,
  markedEmptyCells,
  activeRole,
  setContextMenu,
  getDateTotalHours,
  getIsDayUnderstaffed,
  getDayNote,
  handleUpdateDayNote,
  handleMoveEmployeeUp,
  handleMoveEmployeeDown,
  getScheduleTheme,
  getManagerNote,
  handleOpenEditModal,
  handleInstantAssign,
  setModalMode,
  setEditingId,
  setEmployeeName,
  setWorkplace,
  setStartTime,
  setEndTime,
  setNotes,
  setSelectedDates,
  setFormOriginalStartTime,
  setFormOriginalEndTime,
  setIsModalOpen,
  erpDays = [1, 3, 5]
}) => {
  return (
    <main className="glass-panel rounded-2xl overflow-hidden border border-[#DAC0A3]/50 shadow-sm animate-scale-in">
      <div ref={gridContainerRef} className="overflow-x-auto max-w-full">
        <table className="w-full border-collapse text-left select-none table-fixed">
          <thead>
            <tr className="border-b border-[#DAC0A3]/50 bg-[#F5EBE6]/60">
              <th rowSpan={3} className="sticky left-0 z-20 bg-[#F5EBE6] px-4 py-4 text-xs font-black text-[#3E2723] border-r border-b border-[#DAC0A3]/50 w-[145px] shadow-[4px_0_8px_-4px_rgba(100,70,50,0.15)]">
                人員姓名
              </th>
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
              {gridDates.map(dateObj => {
                const dateStr = formatDateString(dateObj);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDateStr;
                const dayOfWeekIndex = dateObj.getDay();
                const mappedDayIndex = dayOfWeekIndex === 0 ? 7 : dayOfWeekIndex;
                const isERP = erpDays.includes(mappedDayIndex);

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
              allEmployees.map(empName => {
                const matchingEmp = employees.find(
                  e => e.name.trim().toLowerCase() === empName.trim().toLowerCase()
                );
                if (matchingEmp && matchingEmp.active === false) {
                  const gridDateStrings = gridDates.map(d => formatDateString(d));
                  const hasScheduleInView = schedules.some(
                    s => s.employeeName.trim().toLowerCase() === empName.trim().toLowerCase() && gridDateStrings.includes(s.date)
                  );
                  if (!hasScheduleInView) return null;
                }
                const isNewcomer = matchingEmp ? !!matchingEmp.isNewcomer : false;

                return (
                  <tr key={empName} className="border-b border-dotted border-[#DAC0A3]/70 hover:bg-[#FAF7F2]/30 transition-colors group">
                    <td className={`sticky left-0 z-10 backdrop-blur-sm px-3.5 py-1 text-sm font-extrabold border-r-2 border-solid border-b border-dotted border-[#DAC0A3]/90 shadow-[4px_0_8px_-4px_rgba(100,70,50,0.1)] w-[145px] h-[48px] align-middle transition-colors ${isNewcomer
                      ? 'bg-pink-100/85 group-hover:bg-pink-200/90 text-pink-700'
                      : 'bg-[#FAF7F2]/95 group-hover:bg-[#F5EBE6] text-[#3E2723]'
                      }`}>
                      <div className="flex items-center gap-2 h-full select-none">
                        {activeRole === 'manager' && (
                          <div className="flex flex-col gap-1 shrink-0">
                            <button
                              onClick={() => handleMoveEmployeeUp(empName)}
                              disabled={allEmployees.indexOf(empName) === 0}
                              className="p-1 rounded text-[#8D6E63] hover:bg-[#8D6E63]/10 active:bg-[#8D6E63]/20 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                              title="上移"
                            >
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 4l-8 8h16l-8-8z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleMoveEmployeeDown(empName)}
                              disabled={allEmployees.indexOf(empName) === allEmployees.length - 1}
                              className="p-1 rounded text-[#8D6E63] hover:bg-[#8D6E63]/10 active:bg-[#8D6E63]/20 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                              title="下移"
                            >
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 20l8-8H4l8 8z" />
                              </svg>
                            </button>
                          </div>
                        )}
                        <div className="flex flex-col gap-1 justify-center truncate min-w-0">
                          <span className="truncate" title={empName}>👤 {empName}</span>
                          <div className="flex flex-wrap gap-1">
                            {matchingEmp && matchingEmp.isNewcomer && (
                              <span className="text-[9px] text-pink-700 bg-pink-50 border border-pink-200 rounded-md px-1.5 py-0.5 w-fit font-bold select-none leading-none truncate animate-pulse">
                                新進
                              </span>
                            )}
                            {matchingEmp && matchingEmp.trainingPosition && (
                              <span className="text-[10px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 w-fit font-bold select-none leading-none truncate">
                                📖 {matchingEmp.trainingPosition}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {gridDates.map(dateObj => {
                      const dateStr = formatDateString(dateObj);
                      const isSelected = dateStr === selectedDateStr;

                      const empSchedules = schedules.filter(
                        s => s.employeeName.trim().toLowerCase() === empName.toLowerCase() && s.date === dateStr
                      ).sort((a, b) => compareTimeStrings(a.startTime, b.startTime));

                      const empAvails = availabilities.filter(
                        a => a.employeeName.trim().toLowerCase() === empName.toLowerCase() && a.date === dateStr && a.confirmed !== true
                      ).sort((a, b) => compareTimeStrings(a.startTime, b.startTime));

                      const cellKey = `${empName.trim().toLowerCase()}|${dateStr}`;
                      const isCellMarkedBlue = !!markedEmptyCells[cellKey];

                      return (
                        <td
                          key={dateStr}
                          onClick={() => setSelectedDateStr(dateStr)}
                          onContextMenu={(e) => {
                            if (e.target === e.currentTarget || empSchedules.length === 0) {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({ x: e.clientX, y: e.clientY, emptyCell: { employeeName: empName, dateStr } });
                            }
                          }}
                          className={`p-0.5 pt-1 pb-1 border-r border-solid border-b border-dotted border-[#DAC0A3]/40 text-center w-[100px] h-[48px] relative align-middle transition-colors ${isSelected ? 'bg-[#8D6E63]/5' : ''} ${isCellMarkedBlue ? '!bg-[#93C5FD]/40' : ''}`}
                        >
                          {empSchedules.length > 0 || empAvails.length > 0 ? (
                            <div className="space-y-0.5">
                              {empSchedules.map(sched => {
                                const theme = getScheduleTheme(sched);
                                const managerNote = getManagerNote(sched);
                                const originalAvail = availabilities.find(a => a.id === sched.availabilityId);
                                const registerNotes = originalAvail?.notes ? getCleanNote(originalAvail.notes) : '';
                                return (
                                  <div
                                    key={sched.id}
                                    onClick={(e) => handleOpenEditModal(sched, e)}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setContextMenu({ x: e.clientX, y: e.clientY, schedule: sched });
                                    }}
                                    className={`text-xs py-0.5 px-1.5 rounded-md border font-semibold truncate cursor-pointer transition-all hover:scale-[1.02] ${theme.bg} ${theme.border} ${theme.text}`}
                                    title={`👤 ${sched.employeeName} (${sched.startTime}-${sched.endTime})${registerNotes ? ` | 備註: ${registerNotes}` : ''}${managerNote ? ` | 📝 主管備註: ${managerNote}` : ''}`}
                                  >
                                    {sched.markedBlue && <span className="mr-0.5">🔵</span>}
                                    {sched.startTime}-{sched.endTime}
                                    {managerNote && (
                                      <div className="text-[10px] opacity-90 truncate mt-0.5 leading-normal font-medium" title={managerNote}>
                                        ({managerNote})
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {empAvails.map(avail => {
                                const cleanNote = getCleanNote(avail.notes);
                                const isOffDay = avail.startTime === '00:00' && avail.endTime === '00:00';

                                if (isOffDay) {
                                  return (
                                    <div
                                      key={avail.id}
                                      className="text-xs py-0.5 px-1 border border-red-200 bg-red-50 text-red-700 font-bold rounded-md relative flex flex-col justify-center items-center min-h-[32px] h-auto"
                                      title={`不克排班 (休假)${cleanNote ? ` | 📝 ${cleanNote}` : ''}`}
                                    >
                                      <div className="text-[10px] font-bold leading-none">❌ 休假/請假</div>
                                      <div className="text-[9px] opacity-75 mt-1 leading-none truncate w-full">不排班</div>
                                      {cleanNote && (
                                        <div className="text-[9.5px] opacity-85 mt-1 leading-none truncate w-full">
                                          ({cleanNote})
                                        </div>
                                      )}
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={avail.id}
                                    className="text-xs py-0.5 px-0.5 border border-dashed border-emerald-600/30 bg-[#E8F5E9]/50 text-[#2E7D32] font-black rounded-md relative group/btn flex flex-col justify-center items-center min-h-[32px] h-auto"
                                    title={`可用時段: ${avail.startTime}-${avail.endTime}${avail.workplace ? ` @ 📍 ${avail.workplace}` : ''}${cleanNote ? ` | 📝 ${cleanNote}` : ''}`}
                                  >
                                    <div className="text-[10px] font-mono leading-none font-bold">{avail.startTime}-{avail.endTime}</div>
                                    {cleanNote && (
                                      <div className="text-[9.5px] opacity-85 mt-1 leading-none truncate w-full">
                                        ({cleanNote})
                                      </div>
                                    )}
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
                              className="w-full h-full min-h-[32px] rounded-lg border border-transparent hover:border-[#8D6E63]/40 hover:bg-[#FAF7F2] transition-all flex items-center justify-center text-[#E5D3C3] hover:text-[#795548] cursor-pointer"
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
};
