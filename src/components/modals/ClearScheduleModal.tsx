import React, { useState, useMemo } from 'react';
import { clearConfirmedSchedulesInRange } from '../../services/scheduler';
import { formatDateString, getDaysInMonth } from '../../utils/dateUtils';

interface ClearScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMonthStart: Date;
}

export const ClearScheduleModal: React.FC<ClearScheduleModalProps> = ({
  isOpen,
  onClose,
  currentMonthStart
}) => {
  const daysInMonth = useMemo(() => getDaysInMonth(currentMonthStart), [currentMonthStart]);
  const defaultStartDate = daysInMonth[15] ? formatDateString(daysInMonth[15]) : (daysInMonth[0] ? formatDateString(daysInMonth[0]) : '');
  const defaultEndDate = daysInMonth[daysInMonth.length - 1] ? formatDateString(daysInMonth[daysInMonth.length - 1]) : '';

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [clearScope, setClearScope] = useState<'ai_only' | 'all'>('ai_only');
  const [isClearing, setIsClearing] = useState(false);
  const [clearStatusMessage, setClearStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClear = async () => {
    if (!startDate || !endDate || startDate > endDate) {
      alert('請選擇有效的日期範圍。');
      return;
    }

    const onlyAi = clearScope === 'ai_only';
    const targetDesc = onlyAi ? 'AI 自動演算生成的班表 (保留人工手動排班)' : '所有已確認班次 (包含 AI 演算與手動排班)';
    const confirmMsg = `⚠️ 確定要清除 ${startDate} 至 ${endDate} 區間內的【${targetDesc}】嗎？\n\n（同仁登記的可用時間將會保留並重置為待排班狀態）`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsClearing(true);
      setClearStatusMessage(null);
      const res = await clearConfirmedSchedulesInRange(startDate, endDate, onlyAi);
      setClearStatusMessage(`🧹 清除完成！已刪除 ${res.deletedSchedulesCount} 筆班次，並重置 ${res.resetAvailabilitiesCount} 筆可用時間登記為待排班。`);
      setTimeout(() => {
        setIsClearing(false);
        onClose();
        setClearStatusMessage(null);
      }, 1800);
    } catch (e: any) {
      console.error('Clear schedules failed:', e);
      alert(`清除班表失敗: ${e?.message || e}`);
      setIsClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#FAF5EF] rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#DAC0A3]/60 flex flex-col gap-5 text-[#3E2723]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#DAC0A3]/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧹</span>
            <h3 className="font-extrabold text-base text-[#3E2723]">班表清除與重置管理</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#8D6E63] hover:text-[#3E2723] text-xl font-bold p-1 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex flex-col gap-4 text-xs">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[#5D4037]">
            <p className="font-bold text-amber-900 mb-1">💡 說明：</p>
            <p className="leading-relaxed">
              此功能可讓您選擇單獨清除 <strong>AI 自動生成的班表</strong> 或 <strong>所有班表</strong>，並將同仁已登記的可用時間重置為 <strong>「待排班」</strong> 狀態，方便您彈性重新演練。
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-bold text-[#5D4037]">1. 請選擇要清除的對象類型：</label>
            <div className="flex flex-col gap-2.5 bg-white/80 p-3 rounded-xl border border-[#DAC0A3]/60">
              <label className="flex items-center gap-2.5 cursor-pointer font-bold text-xs text-[#3E2723]">
                <input
                  type="radio"
                  name="clearScope"
                  value="ai_only"
                  checked={clearScope === 'ai_only'}
                  onChange={() => setClearScope('ai_only')}
                  className="text-[#795548]"
                />
                <span>🤖 僅清除 AI 自動演算生成的班表 <span className="text-[#8D6E63] font-normal">(保留經理手動排定的班次)</span></span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer font-bold text-xs text-[#3E2723]">
                <input
                  type="radio"
                  name="clearScope"
                  value="all"
                  checked={clearScope === 'all'}
                  onChange={() => setClearScope('all')}
                  className="text-[#795548]"
                />
                <span>🧹 清除所有已確認班表 <span className="text-[#8D6E63] font-normal">(包含 AI 演算與人工手動排班)</span></span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-bold text-[#5D4037]">2. 請選擇要清除的日期範圍：</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-[#DAC0A3]/60 rounded-xl px-3 py-2 outline-none font-mono text-xs text-[#3E2723] focus:border-[#795548] flex-1"
              />
              <span className="font-bold text-[#8D6E63]">至</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-[#DAC0A3]/60 rounded-xl px-3 py-2 outline-none font-mono text-xs text-[#3E2723] focus:border-[#795548] flex-1"
              />
            </div>
          </div>

          {clearStatusMessage && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-900 font-bold text-center animate-fade-in">
              {clearStatusMessage}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#DAC0A3]/40">
          <button
            type="button"
            onClick={onClose}
            disabled={isClearing}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#6D4C41] bg-white border border-[#DAC0A3]/60 hover:bg-[#FAF5EF] transition-all cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={isClearing}
            className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-rose-700 hover:bg-rose-800 transition-all shadow-md active:translate-y-0 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {isClearing ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                清除中...
              </>
            ) : (
              <>
                <span>🧹</span> 確定清除已確認班表
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
