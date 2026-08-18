import React, { useState, useRef } from 'react';
import type { StaffingTarget, RevenueStaffRules } from '../../services/scheduler';
import { parseG031Excel, type G031ParsedData } from '../../utils/g031Parser';

interface ManagerCalculationViewProps {
  revenueStaffRules: RevenueStaffRules;
  monthlyRevenues: Record<number, number>;
  setMonthlyRevenues: (revenues: Record<number, number>) => void;
  staffingTargets: StaffingTarget[];
  analysisHoursRange: number[];
  handleApplyRevenuesToGlobalTargets: () => void;
  handleResetRevenues: () => void;
  getRecommendedStaff: (dailyAvg: number, rules: RevenueStaffRules) => number;
  updateMonthlyRevenues: (revenues: Record<number, number>) => void;
}

export const ManagerCalculationView: React.FC<ManagerCalculationViewProps> = ({
  revenueStaffRules,
  monthlyRevenues,
  setMonthlyRevenues,
  staffingTargets,
  analysisHoursRange,
  handleApplyRevenuesToGlobalTargets,
  handleResetRevenues,
  getRecommendedStaff,
  updateMonthlyRevenues
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsedG031, setParsedG031] = useState<G031ParsedData | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [divideByMonths, setDivideByMonths] = useState<number>(1);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseG031Excel(buffer);
      setParsedG031(parsed);
      setDivideByMonths(parsed.estimatedMonths || 1);
      setIsImportModalOpen(true);
    } catch (err: any) {
      console.error('Failed to parse G031 Excel:', err);
      alert(`匯入失敗：${err.message || '無法解析該檔案，請確認是否為 G031 時段營業資料分析表。'}`);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmImport = () => {
    if (!parsedG031) return;

    const divisor = Math.max(0.1, divideByMonths);
    const newMonthlyRevenues: Record<number, number> = { ...monthlyRevenues };

    analysisHoursRange.forEach(hour => {
      const rawAmount = parsedG031.hourlyAmounts[hour] || 0;
      const computedMonthly = Math.round(rawAmount / divisor);
      newMonthlyRevenues[hour] = computedMonthly;
    });

    setMonthlyRevenues(newMonthlyRevenues);
    updateMonthlyRevenues(newMonthlyRevenues);
    setIsImportModalOpen(false);
    setParsedG031(null);
    alert('已成功匯入 G031 時段營業資料並更新月營業額！');
  };

  return (
    <div className="space-y-6 animate-fade-in bg-white/40 p-6 rounded-2xl border border-[#DAC0A3]/50">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls"
        className="hidden"
      />

      {/* Header & Rules Reference Card */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
        <div className="space-y-2 flex-1">
          <h2 className="text-lg font-bold text-[#3E2723] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
            營業額排班需求計算與設定
          </h2>
          <p className="text-xs text-[#6D4C41]">
            依據各時段的月營業額數據，自動估算日平均營業額及對應的建議排班人數。此人數將可作為一鍵套用至 <strong>db-global.json 預設排班目標人數</strong>（無日期限制的基礎人數需求）的參考基準。
          </p>

          {/* Rules display for reference */}
          <div className="mt-4 p-4 rounded-xl border border-[#DAC0A3]/45 bg-[#FAF7F2] space-y-1.5 shadow-xs">
            <h4 className="text-xs font-extrabold text-[#5D4037] uppercase tracking-wider mb-1">📋 營業額排班人數對照規則：</h4>
            <ul className="text-[11px] text-[#6D4C41] space-y-1 font-medium list-disc pl-4.5">
              <li>日平均營業額 <strong>{revenueStaffRules.tier1Limit.toLocaleString()} 元以下</strong>：配置 <span className="font-extrabold text-[#3E2723]">{revenueStaffRules.tier1Staff} 名</span> 員工</li>
              <li>日平均營業額 <strong>{(revenueStaffRules.tier1Limit + 1).toLocaleString()} - {revenueStaffRules.tier2Limit.toLocaleString()} 元</strong>：配置 <span className="font-extrabold text-[#3E2723]">{revenueStaffRules.tier2Staff} 名</span> 員工</li>
              <li>日平均營業額 <strong>{(revenueStaffRules.tier2Limit + 1).toLocaleString()} - {revenueStaffRules.tier3Limit.toLocaleString()} 元</strong>：配置 <span className="font-extrabold text-[#3E2723]">{revenueStaffRules.tier3Staff} 名</span> 員工</li>
              <li>日平均營業額 <strong>{revenueStaffRules.tier3Limit.toLocaleString()} 元以上</strong>：配置 <span className="font-extrabold text-[#3E2723]">{revenueStaffRules.tier4Staff} 名</span> 員工 (每增加 {revenueStaffRules.incrementAmount.toLocaleString()} 元再追加 1 人，上限為 {revenueStaffRules.maxStaff} 人)</li>
            </ul>
          </div>

          {/* Import Upload Hint */}
          <div className="mt-2 text-[11px] text-[#8D6E63] font-medium flex items-center gap-1.5 bg-[#FAF7F2]/80 px-3 py-1.5 rounded-lg border border-[#DAC0A3]/30 w-fit">
            <span>💡</span>
            <span>支援上傳 <strong>G031 時段營業資料分析表</strong> 檔案 (.xlsx, .xls) 自動解析各時段營業額。</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 w-full md:w-auto shrink-0 md:pt-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full md:w-60 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-3 rounded-xl transition-all shadow-md shadow-emerald-700/15 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer text-xs"
            title="上傳 G031 時段營業資料統計表 Excel 檔"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>📥 匯入 G031 營業資料 (Excel)</span>
          </button>

          <button
            onClick={handleApplyRevenuesToGlobalTargets}
            className="w-full md:w-60 bg-[#795548] hover:bg-[#6D4C41] text-white font-bold px-5 py-3 rounded-xl transition-all shadow-md shadow-[#795548]/10 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            <span>💾 套用至預設排班目標 (db-global)</span>
          </button>

          <button
            onClick={handleResetRevenues}
            className="w-full md:w-60 bg-white hover:bg-red-50 border border-[#E5DCD5] text-[#5D4037] hover:text-red-650 font-bold px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            <span>🔄 重設營業額數據</span>
          </button>
        </div>
      </div>

      {/* Hourly spreadsheet table */}
      <div className="glass-panel p-5 rounded-2xl border border-[#DAC0A3]/50 shadow-sm bg-white/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DAC0A3]/50 text-xs font-bold text-[#6D4C41]/80">
                <th className="pb-3 pl-2 w-1/4">時段</th>
                <th className="pb-3 w-1/4">月營業額輸入 (NTD)</th>
                <th className="pb-3 w-1/6">日平均營業額 (/30)</th>
                <th className="pb-3 w-1/6">建議配置人數</th>
                <th className="pb-3 pr-2 w-1/6">目前預設人數 (db-global)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DAC0A3]/25 text-sm text-[#3E2723]">
              {analysisHoursRange.map(hour => {
                const monthlyVal = monthlyRevenues[hour] || 0;
                const dailyAvg = Number((monthlyVal / 30).toFixed(1));
                const recommendedStaff = getRecommendedStaff(dailyAvg, revenueStaffRules);
                const currentDefaultTarget = staffingTargets.find(t => t.hour === hour && !t.date)?.targetCount ?? 2;

                return (
                  <tr key={hour} className="hover:bg-[#FAF7F2]/30 transition-colors">
                    <td className="py-3.5 pl-2 font-mono font-bold text-xs text-[#6D4C41]">
                      ⏰ {hour.toString().padStart(2, '0')}:00 - {(hour + 1).toString().padStart(2, '0')}:00
                    </td>
                    <td className="py-2">
                      <div className="relative w-44">
                        <span className="absolute left-3.5 top-2 text-xs text-[#8D6E63] font-mono">$</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="請輸入月營業額"
                          value={monthlyVal || ''}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            const next = { ...monthlyRevenues, [hour]: val };
                            setMonthlyRevenues(next);
                            updateMonthlyRevenues(next);
                          }}
                          className="w-full glass-input pl-7 pr-3 py-1.5 rounded-xl text-xs font-mono text-left focus:border-[#795548]"
                        />
                      </div>
                    </td>
                    <td className="py-3.5 font-mono text-xs font-extrabold text-[#795548]">
                      ${dailyAvg.toLocaleString()}
                    </td>
                    <td className="py-2.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1 rounded-full border ${recommendedStaff === 2
                        ? 'bg-blue-50 text-blue-750 border-blue-200'
                        : recommendedStaff === 3
                          ? 'bg-amber-50 text-amber-850 border-amber-200'
                          : 'bg-emerald-50 text-emerald-750 border-emerald-200'
                        }`}>
                        👥 {recommendedStaff} 人
                      </span>
                    </td>
                    <td className="py-3.5 pr-2 font-mono text-xs font-extrabold text-[#8D6E63]/75 pl-3">
                      {currentDefaultTarget} 人
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* G031 Import Preview Modal */}
      {isImportModalOpen && parsedG031 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="glass-panel bg-white p-6 rounded-3xl border border-[#DAC0A3]/60 max-w-2xl w-full shadow-2xl space-y-5 animate-scale-in max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#DAC0A3]/40 pb-3.5 shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-[#3E2723] flex items-center gap-2">
                  <span>📊 匯入 G031 時段營業資料預覽</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono px-2 py-0.5 rounded-full font-bold">
                    {parsedG031.reportCode}
                  </span>
                </h3>
                <p className="text-xs text-[#6D4C41] mt-0.5">
                  已成功解析營業報表，請確認以下門市資訊與換算方式。
                </p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-[#8D6E63] hover:text-[#3E2723] p-1.5 rounded-lg hover:bg-[#FAF7F2] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Report Metadata Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-[#FAF7F2] rounded-xl border border-[#DAC0A3]/40 text-xs shrink-0">
              <div>
                <span className="text-[10px] text-[#8D6E63] block font-bold">🏪 門市名稱</span>
                <span className="font-extrabold text-[#3E2723] truncate block" title={parsedG031.storeName || '未指定'}>
                  {parsedG031.storeName || '埔里酒廠門市'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#8D6E63] block font-bold">📅 統計區間</span>
                <span className="font-extrabold text-[#3E2723] font-mono block">
                  {parsedG031.dateRangeStr || '未指定'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#8D6E63] block font-bold">⏳ 區間長度</span>
                <span className="font-extrabold text-[#3E2723] block">
                  共 {parsedG031.totalDays} 天 (約 {parsedG031.estimatedMonths} 個月)
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#8D6E63] block font-bold">💰 報表總營收</span>
                <span className="font-extrabold text-emerald-800 font-mono block">
                  ${Math.round(parsedG031.totalAmount).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Conversion Mode */}
            <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-1.5 shrink-0">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <span>⚙️ 以區間月數平均</span>
                </span>
                <div className="text-xs text-emerald-900 font-medium flex items-center gap-1.5">
                  <span>將各時段金額除以</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={divideByMonths}
                    onChange={(e) => setDivideByMonths(parseFloat(e.target.value) || 1)}
                    className="w-16 px-2 py-1 bg-white border border-emerald-300 rounded-lg text-center font-mono font-extrabold text-emerald-950 shadow-xs focus:ring-1 focus:ring-emerald-500"
                  />
                  <span>個月換算為月營業額</span>
                </div>
              </div>
            </div>

            {/* Preview Table */}
            <div className="border border-[#DAC0A3]/40 rounded-xl overflow-hidden flex-1 overflow-y-auto min-h-[160px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF7F2] sticky top-0 border-b border-[#DAC0A3]/40 font-bold text-[#6D4C41]">
                  <tr>
                    <th className="py-2.5 px-3">時段</th>
                    <th className="py-2.5 px-3">G031 報表金額</th>
                    <th className="py-2.5 px-3">換算月營業額</th>
                    <th className="py-2.5 px-3">換算日均</th>
                    <th className="py-2.5 px-3">建議人數</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DAC0A3]/25 font-mono">
                  {analysisHoursRange.map(hour => {
                    const rawVal = parsedG031.hourlyAmounts[hour] || 0;
                    const divisor = Math.max(0.1, divideByMonths);
                    const monthlyVal = Math.round(rawVal / divisor);
                    const dailyAvg = Number((monthlyVal / 30).toFixed(1));
                    const staff = getRecommendedStaff(dailyAvg, revenueStaffRules);

                    return (
                      <tr key={hour} className="hover:bg-[#FAF7F2]/40 transition-colors">
                        <td className="py-2 px-3 font-bold text-[#5D4037]">
                          {hour.toString().padStart(2, '0')}:00 - {(hour + 1).toString().padStart(2, '0')}:00
                        </td>
                        <td className="py-2 px-3 text-[#6D4C41]">
                          ${Math.round(rawVal).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 font-extrabold text-emerald-900">
                          ${monthlyVal.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-[#795548]">
                          ${dailyAvg.toLocaleString()}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${staff === 2
                            ? 'bg-blue-50 text-blue-750'
                            : staff === 3
                              ? 'bg-amber-50 text-amber-850'
                              : 'bg-emerald-50 text-emerald-750'
                            }`}>
                            {staff} 人
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#DAC0A3]/40 shrink-0">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[#DAC0A3] text-[#5D4037] hover:bg-[#FAF7F2] font-bold text-xs cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md shadow-emerald-700/15 cursor-pointer transition-all flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>確認匯入並套用營業額</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

