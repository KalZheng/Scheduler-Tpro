import React from 'react';

interface ManagerHeaderProps {
  currentMonthStart: Date;
  managerViewMode: 'calendar' | 'grid' | 'employees' | 'calculation' | 'system' | 'analysis';
  setManagerViewMode: (mode: 'calendar' | 'grid' | 'employees' | 'calculation' | 'system' | 'analysis') => void;
  handleGoToToday: () => void;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  totalShifts: number;
  totalHours: number;
  totalEmployees: number;
}

export const ManagerHeader: React.FC<ManagerHeaderProps> = ({
  currentMonthStart,
  managerViewMode,
  setManagerViewMode,
  handleGoToToday,
  handlePrevMonth,
  handleNextMonth,
  totalShifts,
  totalHours,
  totalEmployees
}) => {
  return (
    <section className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/70 p-4 rounded-xl border border-[#DAC0A3]/50 shadow-sm">
      {/* Left: Month Nav */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleGoToToday}
          className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-[#FAF7F2] text-[#5D4037] border border-[#DAC0A3]/60 hover:border-[#8D6E63] text-xs font-semibold transition-all cursor-pointer"
        >
          今天
        </button>
        <div className="flex items-center rounded-lg border border-[#DAC0A3]/60 bg-white overflow-hidden">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-[#FAF7F2] text-[#6D4C41] border-r border-[#DAC0A3]/60 transition-colors cursor-pointer"
            title="前一個月"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-[#FAF7F2] text-[#6D4C41] transition-colors cursor-pointer"
            title="後一個月"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Displaying current Month/Year */}
        <h2 className="text-base md:text-lg font-bold text-[#3E2723] ml-2">
          {currentMonthStart.getFullYear()}年 {currentMonthStart.getMonth() + 1}月
        </h2>

        {/* View Switcher Toggle */}
        <div className="flex items-center gap-1 bg-[#FAF7F2] border border-[#DAC0A3]/60 p-1 rounded-xl ml-2 overflow-x-auto max-w-[calc(100vw-24px)] md:max-w-none scrollbar-none shrink-0">
          <button
            onClick={() => setManagerViewMode('calendar')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'calendar'
              ? 'bg-[#795548] text-white shadow-sm'
              : 'text-[#8D6E63] hover:text-[#3E2723]'
              }`}
          >
            日曆檢視
          </button>
          <button
            onClick={() => setManagerViewMode('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'grid'
              ? 'bg-[#795548] text-white shadow-sm'
              : 'text-[#8D6E63] hover:text-[#3E2723]'
              }`}
          >
            網格總覽
          </button>
          <button
            onClick={() => setManagerViewMode('employees')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'employees'
              ? 'bg-[#795548] text-white shadow-sm'
              : 'text-[#8D6E63] hover:text-[#3E2723]'
              }`}
          >
            員工管理
          </button>
          <button
            onClick={() => setManagerViewMode('analysis')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'analysis'
              ? 'bg-[#795548] text-white shadow-sm'
              : 'text-[#8D6E63] hover:text-[#3E2723]'
              }`}
          >
            排班分析圖表
          </button>
          <button
            onClick={() => setManagerViewMode('calculation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'calculation'
              ? 'bg-[#795548] text-white shadow-sm'
              : 'text-[#8D6E63] hover:text-[#3E2723]'
              }`}
          >
            營業額計算
          </button>
          <button
            onClick={() => setManagerViewMode('system')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${managerViewMode === 'system'
              ? 'bg-[#795548] text-white shadow-sm'
              : 'text-[#8D6E63] hover:text-[#3E2723]'
              }`}
          >
            系統管理
          </button>
        </div>
      </div>

      {/* Right: Quick monthly stats info */}
      <div className="flex items-center flex-wrap gap-3">
        <div className="flex items-center gap-4 text-[11px] md:text-xs text-[#6D4C41] bg-white/85 px-3 md:px-4 py-2 rounded-lg border border-[#DAC0A3]/55 shadow-sm">
          <div>本月班次：<span className="font-semibold text-[#3E2723] font-mono">{totalShifts}</span> 次</div>
          <div className="w-px h-3 bg-[#DAC0A3]/45"></div>
          <div>本月工時：<span className="font-semibold text-[#795548] font-mono">{Math.round(totalHours * 10) / 10}</span> 小時</div>
          <div className="w-px h-3 bg-[#DAC0A3]/45"></div>
          <div>排班人數：<span className="font-semibold text-[#E65100] font-mono">{totalEmployees}</span> 人</div>
        </div>
      </div>
    </section>
  );
};
