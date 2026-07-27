import React from 'react';
import type { StaffingTarget, RevenueStaffRules } from '../../services/scheduler';

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
  return (
    <div className="space-y-6 animate-fade-in bg-white/40 p-6 rounded-2xl border border-[#DAC0A3]/50">
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
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 w-full md:w-auto shrink-0 md:pt-4">
          <button
            onClick={handleApplyRevenuesToGlobalTargets}
            className="w-full md:w-56 bg-[#795548] hover:bg-[#6D4C41] text-white font-bold px-5 py-3 rounded-xl transition-all shadow-md shadow-[#795548]/10 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            💾 套用至預設排班目標 (db-global)
          </button>
          <button
            onClick={handleResetRevenues}
            className="w-full md:w-56 bg-white hover:bg-red-50 border border-[#E5DCD5] text-[#5D4037] hover:text-red-650 font-bold px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            🔄 重設營業額數據
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
    </div>
  );
};
