import React from 'react';
import type { Employee } from '../../services/scheduler';
import { exportEmployeesToExcel } from '../../utils/excelExport';
import { ALL_POSITIONS } from '../../utils/constants';

interface ManagerEmployeeViewProps {
  employees: Employee[];
  empSearch: string;
  setEmpSearch: (val: string) => void;
  empActiveFilter: 'all' | 'active' | 'inactive';
  setEmpActiveFilter: (val: 'all' | 'active' | 'inactive') => void;
  empStatusFilter: 'all' | '正式夥伴' | '兼職夥伴';
  setEmpStatusFilter: (val: 'all' | '正式夥伴' | '兼職夥伴') => void;
  handleOpenEmployeeModal: (emp?: Employee) => void;
  handleDeleteEmployee: (id: string) => void;
}

export const ManagerEmployeeView: React.FC<ManagerEmployeeViewProps> = ({
  employees,
  empSearch,
  setEmpSearch,
  empActiveFilter,
  setEmpActiveFilter,
  empStatusFilter,
  setEmpStatusFilter,
  handleOpenEmployeeModal,
  handleDeleteEmployee
}) => {
  const filteredEmployees = employees.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(empSearch.toLowerCase());
    const matchesStatus = empStatusFilter === 'all' || e.status === empStatusFilter;
    const matchesActive = empActiveFilter === 'all' ||
      (empActiveFilter === 'active' && e.active !== false) ||
      (empActiveFilter === 'inactive' && e.active === false);
    return matchesSearch && matchesStatus && matchesActive;
  });

  const handleExport = (exportAll: boolean = false) => {
    const listToExport = exportAll ? employees : filteredEmployees;
    if (listToExport.length === 0) {
      alert('無符合條件之員工名單可匯出。');
      return;
    }

    const filterTags: string[] = [];
    if (!exportAll) {
      if (empSearch) filterTags.push(`搜尋: "${empSearch}"`);
      if (empActiveFilter !== 'all') filterTags.push(empActiveFilter === 'active' ? '在職' : '離職');
      if (empStatusFilter !== 'all') filterTags.push(empStatusFilter);
    }
    const filterDesc = filterTags.length > 0 ? filterTags.join(', ') : '全部員工';

    exportEmployeesToExcel(listToExport, filterDesc);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Employee Management Header Card */}
      <div className="glass-panel p-6 rounded-2xl border border-[#DAC0A3]/50 flex flex-col sm:flex-row items-center gap-4 justify-between shadow-sm">
        <div className="space-y-1 text-center sm:text-left">
          <h2 className="text-lg font-bold text-[#3E2723] flex items-center justify-center sm:justify-start gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
            員工清單管理
          </h2>
          <p className="text-xs text-[#6D4C41]">
            在此管理店內夥伴的培訓進度與在職狀態。培訓完成餐吧、POS機、後吧、收班、開早後將自動晉升為正式夥伴。
          </p>
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
          <button
            onClick={() => handleExport(false)}
            className="flex-1 sm:flex-initial bg-white hover:bg-[#FAF7F2] text-[#5D4037] border border-[#DAC0A3]/80 hover:border-[#8D6E63] font-bold px-4 py-2.5 rounded-xl transition-all shadow-xs hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1.5 cursor-pointer text-sm"
            title={`匯出員工名單 (${filteredEmployees.length} 位夥伴) 至 Excel`}
          >
            <svg className="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>匯出名單 ({filteredEmployees.length})</span>
          </button>

          <button
            onClick={() => handleOpenEmployeeModal()}
            className="flex-1 sm:flex-initial bg-[#795548] hover:bg-[#6D4C41] text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-[#795548]/10 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1.5 cursor-pointer text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            新增員工資料
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white/50 p-4 rounded-xl border border-[#DAC0A3]/40 shadow-xs">
        {/* Search */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="搜尋員工姓名..."
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            className="w-full glass-input pl-10 pr-4 py-2 rounded-xl text-sm"
          />
          <svg className="w-4 h-4 text-[#8D6E63] absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Status filter */}
          <div className="flex items-center gap-1 bg-[#FAF7F2] border border-[#DAC0A3]/50 p-1 rounded-xl">
            <button
              onClick={() => setEmpActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empActiveFilter === 'all'
                ? 'bg-[#795548] text-white shadow-xs'
                : 'text-[#8D6E63] hover:text-[#3E2723]'
                }`}
            >
              全部 ({employees.length})
            </button>
            <button
              onClick={() => setEmpActiveFilter('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empActiveFilter === 'active'
                ? 'bg-[#795548] text-white shadow-xs'
                : 'text-[#8D6E63] hover:text-[#3E2723]'
                }`}
            >
              在職 ({employees.filter(e => e.active !== false).length})
            </button>
            <button
              onClick={() => setEmpActiveFilter('inactive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empActiveFilter === 'inactive'
                ? 'bg-[#795548] text-white shadow-xs'
                : 'text-[#8D6E63] hover:text-[#3E2723]'
                }`}
            >
              離職 ({employees.filter(e => e.active === false).length})
            </button>
          </div>

          {/* Employment Status filter */}
          <div className="flex items-center gap-1 bg-[#FAF7F2] border border-[#DAC0A3]/50 p-1 rounded-xl">
            <button
              onClick={() => setEmpStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empStatusFilter === 'all'
                ? 'bg-[#795548] text-white shadow-xs'
                : 'text-[#8D6E63] hover:text-[#3E2723]'
                }`}
            >
              身分: 全部
            </button>
            <button
              onClick={() => setEmpStatusFilter('正式夥伴')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empStatusFilter === '正式夥伴'
                ? 'bg-[#795548] text-white shadow-xs'
                : 'text-[#8D6E63] hover:text-[#3E2723]'
                }`}
            >
              正式夥伴
            </button>
            <button
              onClick={() => setEmpStatusFilter('兼職夥伴')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${empStatusFilter === '兼職夥伴'
                ? 'bg-[#795548] text-white shadow-xs'
                : 'text-[#8D6E63] hover:text-[#3E2723]'
                }`}
            >
              兼職夥伴
            </button>
          </div>
        </div>
      </div>

      {/* Employees Grid */}
      {filteredEmployees.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-[#DAC0A3]/45 rounded-2xl bg-white/40">
          <p className="text-sm text-[#6D4C41] font-semibold">沒有符合條件的員工紀錄</p>
          <p className="text-xs text-[#8D6E63] mt-1">請點擊「新增員工資料」按鈕來建立夥伴名單。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map(emp => {
            const totalPositionsCount = ALL_POSITIONS.length;
            const isTraining = emp.trainingPosition || (emp.trainedPositions && emp.trainedPositions.length < totalPositionsCount);
            const trainedCount = emp.trainedPositions ? emp.trainedPositions.length : 0;
            const progressPercent = Math.min(100, Math.round((trainedCount / totalPositionsCount) * 100));

            return (
              <div
                key={emp.id}
                className={`glass-panel p-5 rounded-2xl border border-[#DAC0A3]/50 hover:border-[#8D6E63]/80 hover:shadow-md transition-all flex flex-col justify-between gap-4 relative overflow-hidden group/card ${emp.active === false ? 'opacity-65 bg-gray-50/20 grayscale-[20%]' : ''}`}
              >
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="text-base font-extrabold text-[#3E2723] flex items-center gap-1.5">
                        👤 {emp.name}
                      </h3>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${emp.status === '正式夥伴'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.status === '正式夥伴' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></span>
                          {emp.status}
                        </span>
                        {emp.isNewcomer === true && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold border bg-pink-50 text-pink-700 border-pink-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                            新進人員
                          </span>
                        )}
                        {emp.active === false && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold border bg-red-50 text-red-700 border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            已離職
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#6D4C41] font-semibold flex items-center gap-1 mt-1.5">
                        <span className="opacity-80">📞</span>
                        <span className="font-mono">{emp.phone || '無電話資料'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-60 group-hover/card:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenEmployeeModal(emp)}
                        className="p-1.5 rounded-lg bg-white hover:bg-[#FAF7F2] border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-[#3E2723] transition-colors cursor-pointer"
                        title="編輯資料"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteEmployee(emp.id)}
                        className="p-1.5 rounded-lg bg-white hover:bg-red-50 border border-[#DAC0A3]/50 text-[#6D4C41] hover:text-red-650 transition-colors cursor-pointer"
                        title="刪除夥伴"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {isTraining && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold text-[#6D4C41]">
                        <span>合格進度</span>
                        <span>{trainedCount}/{totalPositionsCount} ({progressPercent}%)</span>
                      </div>
                      <div className="w-full bg-[#EADBC8]/40 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-400 to-[#795548] h-full rounded-full transition-all duration-500"
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Position details */}
                  <div className="space-y-2 pt-1 border-t border-[#DAC0A3]/25">
                    {isTraining && emp.trainingPosition && (
                      <div>
                        <span className="text-[10px] font-bold text-[#8D6E63] block uppercase tracking-wider mb-1">正在培訓崗位</span>
                        <span className="inline-block text-xs font-extrabold px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[#B7791F]">
                          📖 {emp.trainingPosition}
                        </span>
                      </div>
                    )}

                    <div>
                      <span className="text-[10px] font-bold text-[#8D6E63] block uppercase tracking-wider mb-1">已受訓合格崗位</span>
                      {emp.trainedPositions && emp.trainedPositions.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {emp.trainedPositions.map(pos => (
                            <span key={pos} className="inline-block text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-emerald-600/10 border border-emerald-600/20 text-[#2E7D32]">
                              ✅ {pos}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[#6D4C41]/60 italic font-medium">尚未受訓合格任何崗位</span>
                      )}
                    </div>

                    {emp.certificates && emp.certificates.length > 0 && (
                      <div className="pt-2 border-t border-[#DAC0A3]/25">
                        <span className="text-[10px] font-bold text-[#8D6E63] block uppercase tracking-wider mb-1">持有證照</span>
                        <div className="flex flex-wrap gap-1">
                          {emp.certificates.map(cert => {
                            const isFbi = cert === 'FBI';
                            return (
                              <span
                                key={cert}
                                className={`inline-block text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border ${isFbi
                                  ? 'bg-blue-50 text-blue-750 border-blue-200'
                                  : 'bg-amber-50 text-amber-850 border-amber-200'
                                  }`}
                              >
                                {isFbi ? '🛡️ FBI' : '☕ 黃金吧檯手'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
