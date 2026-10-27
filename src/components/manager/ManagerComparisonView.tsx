import React, { useState, useMemo, useRef } from 'react';
import type {
  WorkSchedule,
  WorkerAvailability,
  Employee,
  StaffingTarget,
  ShiftPreset,
  StaffingDemandConfig
} from '../../services/scheduler';
import {
  formatDateString,
  getDaysInMonth
} from '../../utils/dateUtils';
import { exportComparisonToExcel } from '../../utils/excelExport';
import { parseComparisonSampleExcel } from '../../utils/excelSampleParser';
import { useComparisonSimulation } from '../../hooks/useComparisonSimulation';
import { ComparisonScheduleGrid } from './comparison/ComparisonScheduleGrid';
import { ComparisonHeatmapGrid } from './comparison/ComparisonHeatmapGrid';

interface ManagerComparisonViewProps {
  currentMonthStart: Date;
  setCurrentMonthStart?: (d: Date) => void;
  availabilities: WorkerAvailability[];
  schedules: WorkSchedule[];
  employees: Employee[];
  staffingTargets: StaffingTarget[];
  analysisHoursRange: number[];
  shiftPresets: ShiftPreset[];
  operatingStartTime?: string;
  operatingEndTime?: string;
  staffingDemandConfig?: StaffingDemandConfig;
}

export const ManagerComparisonView: React.FC<ManagerComparisonViewProps> = ({
  currentMonthStart,
  setCurrentMonthStart,
  availabilities,
  schedules,
  employees,
  staffingTargets,
  analysisHoursRange,
  shiftPresets,
  operatingStartTime,
  operatingEndTime,
  staffingDemandConfig
}) => {
  const daysInMonth = useMemo(() => getDaysInMonth(currentMonthStart), [currentMonthStart]);
  const monthDates = useMemo(() => daysInMonth.map(d => formatDateString(d)), [daysInMonth]);
  const monthStr = useMemo(() => formatDateString(currentMonthStart).substring(0, 7), [currentMonthStart]);

  // Selection of whole month vs first half vs second half
  const [dateRangePart, setDateRangePart] = useState<'all' | 'part1' | 'part2'>('part1');

  const lastDayNum = useMemo(() => {
    return daysInMonth.length > 0 ? daysInMonth[daysInMonth.length - 1].getDate() : 31;
  }, [daysInMonth]);

  const displayedDaysInMonth = useMemo(() => {
    if (dateRangePart === 'part1') {
      return daysInMonth.filter(d => d.getDate() <= 15);
    }
    if (dateRangePart === 'part2') {
      return daysInMonth.filter(d => d.getDate() >= 16);
    }
    return daysInMonth;
  }, [daysInMonth, dateRangePart]);

  const displayedMonthDates = useMemo(() => {
    return displayedDaysInMonth.map(d => formatDateString(d));
  }, [displayedDaysInMonth]);

  // Collapsible state for each Excel table
  const [collapsedTables, setCollapsedTables] = useState<Record<string, boolean>>({
    manual: false,
    rule: false,
    ai: false,
    heatmap_manual: false,
    heatmap_rule: false,
    heatmap_ai: false
  });

  // View mode tab: Excel Grid vs Hourly Heatmap
  const [viewMode, setViewMode] = useState<'excel' | 'heatmap'>('excel');
  const [heatmapFilter, setHeatmapFilter] = useState<'all' | 'manual' | 'rule' | 'ai'>('all');
  const [isExporting, setIsExporting] = useState(false);

  const toggleTableCollapse = (key: string) => {
    setCollapsedTables(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleMonthInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // "YYYY-MM"
    if (!val || !val.includes('-')) return;
    const [y, m] = val.split('-').map(Number);
    if (isNaN(y) || isNaN(m)) return;
    const newMonth = new Date(y, m - 1, 1);
    if (setCurrentMonthStart) {
      setCurrentMonthStart(newMonth);
    }
  };

  const handlePrevMonth = () => {
    const prev = new Date(currentMonthStart);
    prev.setMonth(prev.getMonth() - 1);
    if (setCurrentMonthStart) setCurrentMonthStart(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(currentMonthStart);
    next.setMonth(next.getMonth() + 1);
    if (setCurrentMonthStart) setCurrentMonthStart(next);
  };

  const handleGoToTodayMonth = () => {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (setCurrentMonthStart) setCurrentMonthStart(thisMonth);
  };

  // Extract simulation, AI, and statistics logic into custom hook
  const {
    activeEmployees,
    manualMonthSchedules,
    ruleSchedules,
    aiSchedules,
    aiCombinedSchedules,
    isAiLoading,
    aiError,
    handleRunAiSimulation,
    manualStats,
    ruleStats,
    aiStats,
    timeToMins,
    getStaffingTarget,
    hasActualManualData,
    isUsingSampleData,
    sampleMonthSchedules,
    handleUploadSampleSchedules,
    handleClearSampleSchedules
  } = useComparisonSimulation({
    monthStr,
    daysInMonth,
    monthDates,
    displayedMonthDates,
    dateRangePart,
    availabilities,
    schedules,
    employees,
    staffingTargets,
    shiftPresets,
    operatingStartTime,
    operatingEndTime,
    staffingDemandConfig,
    analysisHoursRange
  });

  // Excel Sample Upload state
  const sampleFileInputRef = useRef<HTMLInputElement>(null);
  const [sampleStatus, setSampleStatus] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  const handleSampleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const result = parseComparisonSampleExcel(buffer, monthStr);

      // If month in Excel is different from current displayed month, switch month
      if (result.extractedMonthStr && result.extractedMonthStr !== monthStr && setCurrentMonthStart) {
        const [y, m] = result.extractedMonthStr.split('-').map(Number);
        if (!isNaN(y) && !isNaN(m)) {
          setCurrentMonthStart(new Date(y, m - 1, 1));
        }
      }

      handleUploadSampleSchedules(result.schedules, result.extractedMonthStr);

      const monthHasRealData = schedules.some(s => s.date && s.date.startsWith(result.extractedMonthStr));

      if (monthHasRealData) {
        setSampleStatus({
          type: 'info',
          message: `已解析「${result.extractedMonthStr}」樣本資料 (${result.totalShiftsCount} 筆班次 / ${result.employeeCount} 位同仁)。【提醒】資料庫中該月份已存在真實排班實績，系統依規則優先採用真實資料，此樣本將被略過 (Ignore)。`
        });
      } else {
        setSampleStatus({
          type: 'success',
          message: `成功匯入「${result.extractedMonthStr}」比對樣本排班！共解析 ${result.totalShiftsCount} 筆班次 (${result.employeeCount} 位同仁)。樣本已獨立儲存於本地瀏覽器，絕不污染正式資料庫。`
        });
      }
    } catch (err: any) {
      console.error('Failed to parse sample excel:', err);
      setSampleStatus({
        type: 'error',
        message: `匯入比對樣本失敗：${err?.message || '檔案格式無法辨識'}`
      });
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const dateRangeDesc = dateRangePart === 'all'
        ? `全月 (1~${lastDayNum}日)`
        : dateRangePart === 'part1'
        ? '上半月 (1~15日)'
        : `下半月 (16~${lastDayNum}日)`;

      await exportComparisonToExcel({
        monthStr,
        dateRangeDesc,
        displayedDaysInMonth,
        activeEmployees,
        manualSchedules: manualMonthSchedules,
        ruleSchedules,
        aiSchedules: aiCombinedSchedules,
        manualStats,
        ruleStats,
        aiStats,
        staffingDemandConfig,
        operatingStartTime,
        operatingEndTime
      });
    } catch (err) {
      console.error('Export comparison to excel failed:', err);
      alert('匯出 Excel 發生錯誤，請稍後重試。');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-[#3E2723]">
      {/* 1. Admin Top Banner & Controls Card */}
      <div className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/60 shadow-sm bg-white/85 space-y-4">
        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DAC0A3]/40 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center font-bold text-base shadow-sm">
              📊
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-[#3E2723]">
                  排班比對分析 (Excel 網格上下並列對比)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-600 text-white shadow-xs">
                  👑 最高管理員專屬
                </span>
              </div>
              <p className="text-xs text-[#6D4C41]">
                上下並列比較「手動現有排班」、「程式規則演算法排班」與「Gemini AI 智慧排班」，全方位檢驗門市覆蓋率與合規性。
              </p>
            </div>
          </div>

          {/* Month Selector Controls */}
          <div className="flex items-center gap-2 bg-[#FAF7F2] p-1.5 rounded-xl border border-[#DAC0A3]/60 shadow-xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-white text-[#5D4037] font-bold text-xs transition-colors cursor-pointer"
              title="上個月"
            >
              ◀
            </button>

            <input
              type="month"
              value={monthStr}
              onChange={handleMonthInputChange}
              className="bg-transparent text-xs font-black text-[#3E2723] focus:outline-hidden cursor-pointer"
            />

            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-white text-[#5D4037] font-bold text-xs transition-colors cursor-pointer"
              title="下個月"
            >
              ▶
            </button>

            <button
              onClick={handleGoToTodayMonth}
              className="px-2 py-1 rounded-md bg-[#795548] hover:bg-[#5D4037] text-white text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
            >
              本月
            </button>
          </div>
        </div>

        {/* Filter & Action Buttons row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Date range segmented button (1~15 / 16~31 / Full Month) */}
          <div className="flex items-center gap-1.5 bg-[#FAF7F2] p-1 rounded-xl border border-[#DAC0A3]/60 shadow-xs text-xs">
            <span className="text-[11px] font-bold text-[#6D4C41] px-2">對比區間:</span>
            <button
              type="button"
              onClick={() => setDateRangePart('part1')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                dateRangePart === 'part1'
                  ? 'bg-[#795548] text-white shadow-xs font-black'
                  : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
              }`}
            >
              上半月 (1~15日)
            </button>
            <button
              type="button"
              onClick={() => setDateRangePart('part2')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                dateRangePart === 'part2'
                  ? 'bg-[#795548] text-white shadow-xs font-black'
                  : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
              }`}
            >
              下半月 (16~{lastDayNum}日)
            </button>
            <button
              type="button"
              onClick={() => setDateRangePart('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                dateRangePart === 'all'
                  ? 'bg-[#795548] text-white shadow-xs font-black'
                  : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
              }`}
            >
              全月份 (1~{lastDayNum}日)
            </button>
          </div>

          {/* Action buttons: Import Sample Excel, Run AI & Export Excel */}
          <div className="flex items-center gap-2.5">
            {/* Hidden Excel Sample file input */}
            <input
              type="file"
              ref={sampleFileInputRef}
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleSampleFileUpload}
            />

            <button
              onClick={() => sampleFileInputRef.current?.click()}
              className="px-3.5 py-2.5 rounded-xl text-xs font-black text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 hover:border-amber-400 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              title="從 Excel 檔案匯入手動排班比對樣本（獨立儲存於瀏覽器，絕不污染正式資料庫）"
            >
              <span className="text-sm">📁</span>
              <span>匯入比對樣本 Excel</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isExporting}
              className="px-4 py-2.5 rounded-xl text-xs font-black text-[#5D4037] bg-white border border-[#DAC0A3]/80 hover:bg-[#FAF7F2] hover:border-[#795548] disabled:opacity-50 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              {isExporting ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-[#795548] border-t-transparent animate-spin"></span>
                  <span>匯出中...</span>
                </>
              ) : (
                <>
                  <span className="text-sm">📥</span>
                  <span>匯出比對 Excel</span>
                </>
              )}
            </button>

            <button
              onClick={handleRunAiSimulation}
              disabled={isAiLoading}
              className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-[#5D4037] via-[#795548] to-purple-800 hover:opacity-95 disabled:opacity-50 transition-all shadow-md active:translate-y-0 cursor-pointer flex items-center gap-2"
            >
              {isAiLoading ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                  <span>AI 比對演算中...</span>
                </>
              ) : (
                <>
                  <span className="text-sm">⚡</span>
                  <span>{aiSchedules ? '重新執行排班比對' : '執行排班比對 (含 AI 模擬)'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Sample upload notification banner */}
      {sampleStatus && (
        <div
          className={`p-3 rounded-xl text-xs font-bold animate-fade-in flex items-center justify-between border ${
            sampleStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : sampleStatus.type === 'info'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{sampleStatus.type === 'success' ? '✅' : sampleStatus.type === 'info' ? 'ℹ️' : '⚠️'}</span>
            <span>{sampleStatus.message}</span>
          </div>
          <button
            onClick={() => setSampleStatus(null)}
            className="text-gray-500 hover:text-gray-800 text-xs font-bold cursor-pointer ml-3 px-1"
          >
            ✕
          </button>
        </div>
      )}

      {aiError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold animate-fade-in flex items-center justify-between">
          <span>⚠️ {aiError}</span>
          <button onClick={() => {}} className="text-rose-500 hover:text-rose-800 text-sm font-bold">✕</button>
        </div>
      )}

      {/* 2. Top Summary KPI Comparison Card */}
      <div className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/60 shadow-sm bg-white/85 space-y-3">
        <h3 className="text-sm font-extrabold text-[#3E2723] flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
          核心排班指標即時綜合評比 (KPI Summary)
          <span className="text-xs font-bold text-[#8D6E63] font-normal">
            [{monthStr} {dateRangePart === 'all' ? `全月 1~${lastDayNum}日` : dateRangePart === 'part1' ? '上半月 1~15日' : `下半月 16~${lastDayNum}日`}]
          </span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DAC0A3]/40 text-[#5D4037]">
                <th className="py-2 px-3 font-extrabold w-1/4">評估指標維度</th>
                <th className={`py-2 px-3 font-extrabold w-1/4 rounded-t-lg ${
                  isUsingSampleData
                    ? 'bg-amber-500/15 text-amber-950'
                    : 'bg-emerald-500/10 text-emerald-950'
                }`}>
                  {isUsingSampleData ? '📋 比對樣本排班 (Excel 樣本)' : '📋 手動現有排班 (現行實績)'}
                </th>
                <th className="py-2 px-3 font-extrabold w-1/4 bg-blue-500/10 text-blue-950 rounded-t-lg">
                  ⚙️ 程式規則演算法 (autoScheduler)
                </th>
                <th className="py-2 px-3 font-extrabold w-1/4 bg-purple-500/10 text-purple-950 rounded-t-lg">
                  🤖 Gemini AI 智慧排班
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DAC0A3]/30 font-medium">
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">總排定班次數</td>
                <td className="py-2 px-3 font-mono font-bold text-[#3E2723] bg-emerald-50/20">{manualStats?.totalShifts || 0} 班</td>
                <td className="py-2 px-3 font-mono font-bold text-[#3E2723] bg-blue-50/20">{ruleStats?.totalShifts || 0} 班</td>
                <td className="py-2 px-3 font-mono font-bold text-[#3E2723] bg-purple-50/20">{aiStats ? `${aiStats.totalShifts} 班` : <span className="text-[#8D6E63] italic">-</span>}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">總出勤工時 (人時)</td>
                <td className="py-2 px-3 font-mono font-extrabold text-[#795548] bg-emerald-50/20">{manualStats?.totalLaborHours || 0} hrs</td>
                <td className="py-2 px-3 font-mono font-extrabold text-[#1565C0] bg-blue-50/20">{ruleStats?.totalLaborHours || 0} hrs</td>
                <td className="py-2 px-3 font-mono font-extrabold text-[#6A1B9A] bg-purple-50/20">{aiStats ? `${aiStats.totalLaborHours} hrs` : <span className="text-[#8D6E63] italic">-</span>}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">時段缺額人時</td>
                <td className="py-2 px-3 font-mono font-bold bg-emerald-50/20">
                  <span className={`px-2 py-0.5 rounded-full ${manualStats && manualStats.deficitHoursCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {manualStats?.deficitHoursCount || 0}h 缺額
                  </span>
                </td>
                <td className="py-2 px-3 font-mono font-bold bg-blue-50/20">
                  <span className={`px-2 py-0.5 rounded-full ${ruleStats && ruleStats.deficitHoursCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {ruleStats?.deficitHoursCount || 0}h 缺額
                  </span>
                </td>
                <td className="py-2 px-3 font-mono font-bold bg-purple-50/20">
                  {aiStats ? (
                    <span className={`px-2 py-0.5 rounded-full ${aiStats.deficitHoursCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {aiStats.deficitHoursCount}h 缺額
                    </span>
                  ) : <span className="text-[#8D6E63] italic">-</span>}
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">開早達標率 (前30分 ≥{staffingDemandConfig?.openingStaffCount ?? 1}人)</td>
                <td className="py-2 px-3 font-mono font-bold bg-emerald-50/20">{manualStats ? `${manualStats.openingMetRate}%` : '-'}</td>
                <td className="py-2 px-3 font-mono font-bold bg-blue-50/20 text-blue-900">{ruleStats ? `${ruleStats.openingMetRate}%` : '-'}</td>
                <td className="py-2 px-3 font-mono font-bold bg-purple-50/20 text-purple-900">{aiStats ? `${aiStats.openingMetRate}%` : '-'}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold text-[#6D4C41]">收班達標率 (後30分 ≥{staffingDemandConfig?.closingStaffCount ?? 1}人)</td>
                <td className="py-2 px-3 font-mono font-bold bg-emerald-50/20">{manualStats ? `${manualStats.closingMetRate}%` : '-'}</td>
                <td className="py-2 px-3 font-mono font-bold bg-blue-50/20 text-blue-900">{ruleStats ? `${ruleStats.closingMetRate}%` : '-'}</td>
                <td className="py-2 px-3 font-mono font-bold bg-purple-50/20 text-purple-900">{aiStats ? `${aiStats.closingMetRate}%` : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. View Mode Switcher: Excel Grid vs Hourly Heatmap */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DAC0A3]/50 pb-2 pt-2">
        <div className="flex items-center gap-2 bg-[#FAF7F2] p-1.5 rounded-xl border border-[#DAC0A3]/60 shadow-xs">
          <button
            type="button"
            onClick={() => setViewMode('excel')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'excel'
                ? 'bg-[#795548] text-white shadow-xs font-black'
                : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
            }`}
          >
            <span>📋</span>
            <span>人員排班表 (Excel 網格對比)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('heatmap')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'heatmap'
                ? 'bg-[#795548] text-white shadow-xs font-black'
                : 'text-[#6D4C41] hover:text-[#3E2723] hover:bg-white'
            }`}
          >
            <span>⏰</span>
            <span>每小時人數分析圖 (時段熱力圖)</span>
          </button>
        </div>

        {viewMode === 'heatmap' && (
          <div className="flex items-center gap-1 bg-[#FAF7F2] p-1.5 rounded-xl border border-[#DAC0A3]/60 text-xs shadow-xs">
            <span className="text-[11px] font-bold text-[#6D4C41] px-2">顯示圖表:</span>
            <button
              type="button"
              onClick={() => setHeatmapFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                heatmapFilter === 'all' ? 'bg-[#795548] text-white shadow-xs font-black' : 'text-[#6D4C41] hover:bg-white'
              }`}
            >
              全部並列
            </button>
            <button
              type="button"
              onClick={() => setHeatmapFilter('manual')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                heatmapFilter === 'manual' ? 'bg-emerald-700 text-white shadow-xs font-black' : 'text-[#6D4C41] hover:bg-white'
              }`}
            >
              📋 手動實績
            </button>
            <button
              type="button"
              onClick={() => setHeatmapFilter('rule')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                heatmapFilter === 'rule' ? 'bg-blue-700 text-white shadow-xs font-black' : 'text-[#6D4C41] hover:bg-white'
              }`}
            >
              ⚙️ 程式規則
            </button>
            <button
              type="button"
              onClick={() => setHeatmapFilter('ai')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                heatmapFilter === 'ai' ? 'bg-purple-700 text-white shadow-xs font-black' : 'text-[#6D4C41] hover:bg-white'
              }`}
            >
              🤖 Gemini AI
            </button>
          </div>
        )}
      </div>

      {/* 4. Display Content: Excel Grids vs Hourly Heatmaps */}
      {viewMode === 'excel' ? (
        /* Excel Grids */
        <div className="space-y-6">
          {/* Sample Data Banner / Priority Notice */}
          {isUsingSampleData && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📌</span>
                <span>
                  <strong>目前採用 Excel 比對樣本</strong>：本月資料庫尚無排班實績，表格一正顯示您匯入之比對樣本（共 {manualMonthSchedules.length} 筆班次，僅獨立保存在本機瀏覽器，絕未寫入正式資料庫）。
                </span>
              </div>
              <button
                onClick={() => {
                  if (window.confirm(`確定要清除 ${monthStr} 月份的本機比對樣本排班嗎？`)) {
                    handleClearSampleSchedules(monthStr);
                  }
                }}
                className="px-2.5 py-1 text-xs font-bold bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                🗑️ 清除此月樣本
              </button>
            </div>
          )}

          {hasActualManualData && sampleMonthSchedules.length > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">ℹ️</span>
                <span>
                  <strong>優先採用正式資料庫實績</strong>：本月份資料庫中已存在真實手動排班記錄，依系統規則自動略過 (Ignore) 上傳之比對樣本（本月上傳樣本 {sampleMonthSchedules.length} 筆已略過）。
                </span>
              </div>
              <button
                onClick={() => {
                  if (window.confirm(`確定要清除 ${monthStr} 月份已略過的本機比對樣本嗎？`)) {
                    handleClearSampleSchedules(monthStr);
                  }
                }}
                className="px-2.5 py-1 text-xs font-bold bg-emerald-200 hover:bg-emerald-300 text-emerald-900 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                🗑️ 清除已略過樣本
              </button>
            </div>
          )}

          {/* Table 1: Manual Live Schedules or Sample Manual Schedules */}
          <ComparisonScheduleGrid
            keyId="manual"
            title={isUsingSampleData ? "📋 表格一：比對樣本排班 (Sample Manual Schedule)" : "📋 表格一：手動現有排班 (Manual Schedule)"}
            subtitle={
              isUsingSampleData
                ? "比對專用樣本資料 (由 Excel 匯入，獨立儲存，未污染正式資料庫)"
                : (hasActualManualData ? "現行門市資料庫實績" : "目前暫無手動排班資料")
            }
            badgeText={isUsingSampleData ? "Excel 樣本" : "手動實績"}
            badgeColor={isUsingSampleData ? "bg-amber-700" : "bg-emerald-700"}
            cardBorderColor={isUsingSampleData ? "border-amber-400" : "border-emerald-300"}
            cellTheme={isUsingSampleData ? "amber" : "emerald"}
            scheduleList={manualMonthSchedules}
            stats={manualStats}
            isCollapsed={collapsedTables.manual}
            onToggleCollapse={() => toggleTableCollapse('manual')}
            displayedDaysInMonth={displayedDaysInMonth}
            activeEmployees={activeEmployees}
            staffingDemandConfig={staffingDemandConfig}
            operatingStartTime={operatingStartTime}
            operatingEndTime={operatingEndTime}
            timeToMins={timeToMins}
          />

          {/* Table 2: Rule / Code Auto Schedules */}
          <ComparisonScheduleGrid
            keyId="rule"
            title="⚙️ 表格二：程式規則演算法排班 (Rule Auto Schedule)"
            subtitle="由 autoScheduler 依據保早、保晚、尖峰封頂原則模擬"
            badgeText="程式規則"
            badgeColor="bg-blue-700"
            cardBorderColor="border-blue-300"
            cellTheme="blue"
            scheduleList={ruleSchedules}
            stats={ruleStats}
            isCollapsed={collapsedTables.rule}
            onToggleCollapse={() => toggleTableCollapse('rule')}
            displayedDaysInMonth={displayedDaysInMonth}
            activeEmployees={activeEmployees}
            staffingDemandConfig={staffingDemandConfig}
            operatingStartTime={operatingStartTime}
            operatingEndTime={operatingEndTime}
            timeToMins={timeToMins}
          />

          {/* Table 3: Gemini AI Schedules */}
          <ComparisonScheduleGrid
            keyId="ai"
            title="🤖 表格三：Gemini AI 智慧排班 (Gemini AI Schedule)"
            subtitle="由 Gemini 模型根據自然語言指示與同仁登記備註生成"
            badgeText="Gemini AI"
            badgeColor="bg-purple-700"
            cardBorderColor="border-purple-300"
            cellTheme="purple"
            scheduleList={aiCombinedSchedules}
            stats={aiStats}
            isCollapsed={collapsedTables.ai}
            onToggleCollapse={() => toggleTableCollapse('ai')}
            displayedDaysInMonth={displayedDaysInMonth}
            activeEmployees={activeEmployees}
            staffingDemandConfig={staffingDemandConfig}
            operatingStartTime={operatingStartTime}
            operatingEndTime={operatingEndTime}
            timeToMins={timeToMins}
          />
        </div>
      ) : (
        /* Hourly Heatmap Grids */
        <div className="space-y-6">
          {(heatmapFilter === 'all' || heatmapFilter === 'manual') && (
            <ComparisonHeatmapGrid
              keyId="manual"
              title={
                isUsingSampleData
                  ? "📋 圖表一：比對樣本排班 (Sample Manual Schedule) - 每小時在勤人數分析"
                  : "📋 圖表一：手動現有排班 (Manual Schedule) - 每小時在勤人數分析"
              }
              subtitle={
                isUsingSampleData
                  ? "由 Excel 匯入之比對樣本各小時在勤人數與缺額分析"
                  : "現行門市資料庫實績各小時在勤人數與缺額分析"
              }
              badgeText={isUsingSampleData ? "Excel 樣本" : "手動實績"}
              themeClasses={
                isUsingSampleData
                  ? { badgeBg: 'bg-amber-700', headerBg: 'bg-amber-50/70' }
                  : { badgeBg: 'bg-emerald-700', headerBg: 'bg-emerald-50/70' }
              }
              cardBorderColor={isUsingSampleData ? "border-amber-400" : "border-emerald-300"}
              scheduleList={manualMonthSchedules}
              stats={manualStats}
              isCollapsed={collapsedTables.heatmap_manual}
              onToggleCollapse={() => toggleTableCollapse('heatmap_manual')}
              displayedDaysInMonth={displayedDaysInMonth}
              analysisHoursRange={analysisHoursRange}
              employees={employees}
              getStaffingTarget={getStaffingTarget}
            />
          )}

          {(heatmapFilter === 'all' || heatmapFilter === 'rule') && (
            <ComparisonHeatmapGrid
              keyId="rule"
              title="⚙️ 圖表二：程式規則演算法 (Rule Auto Schedule) - 每小時在勤人數分析"
              subtitle="由 autoScheduler 模擬產生之各小時在勤人數與缺額分析"
              badgeText="程式規則"
              themeClasses={{ badgeBg: 'bg-blue-700', headerBg: 'bg-blue-50/70' }}
              cardBorderColor="border-blue-300"
              scheduleList={ruleSchedules}
              stats={ruleStats}
              isCollapsed={collapsedTables.heatmap_rule}
              onToggleCollapse={() => toggleTableCollapse('heatmap_rule')}
              displayedDaysInMonth={displayedDaysInMonth}
              analysisHoursRange={analysisHoursRange}
              employees={employees}
              getStaffingTarget={getStaffingTarget}
            />
          )}

          {(heatmapFilter === 'all' || heatmapFilter === 'ai') && (
            <ComparisonHeatmapGrid
              keyId="ai"
              title="🤖 圖表三：Gemini AI 智慧排班 (Gemini AI Schedule) - 每小時在勤人數分析"
              subtitle="由 Gemini 模型模擬產生之各小時在勤人數與缺額分析"
              badgeText="Gemini AI"
              themeClasses={{ badgeBg: 'bg-purple-700', headerBg: 'bg-purple-50/70' }}
              cardBorderColor="border-purple-300"
              scheduleList={aiCombinedSchedules}
              stats={aiStats}
              isCollapsed={collapsedTables.heatmap_ai}
              onToggleCollapse={() => toggleTableCollapse('heatmap_ai')}
              displayedDaysInMonth={displayedDaysInMonth}
              analysisHoursRange={analysisHoursRange}
              employees={employees}
              getStaffingTarget={getStaffingTarget}
            />
          )}
        </div>
      )}
    </div>
  );
};
