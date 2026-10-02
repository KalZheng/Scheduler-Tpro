import React, { useState, useMemo } from 'react';
import { clearConfirmedSchedulesInRange, type ScheduleClearSource } from '../../services/scheduler';
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
  
  // Selected sources for Clear (default to automated: AI + Rule)
  const [selectedSources, setSelectedSources] = useState<Set<ScheduleClearSource>>(
    new Set<ScheduleClearSource>(['ai', 'rule'])
  );

  const [isClearing, setIsClearing] = useState(false);
  const [clearStatusMessage, setClearStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleSource = (source: ScheduleClearSource) => {
    setSelectedSources(prev => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  const applyPreset = (preset: 'auto_only' | 'ai_only' | 'rule_only' | 'all') => {
    if (preset === 'auto_only') {
      setSelectedSources(new Set(['ai', 'rule']));
    } else if (preset === 'ai_only') {
      setSelectedSources(new Set(['ai']));
    } else if (preset === 'rule_only') {
      setSelectedSources(new Set(['rule']));
    } else if (preset === 'all') {
      setSelectedSources(new Set(['ai', 'rule', 'instant', 'manual']));
    }
  };

  const handleClear = async () => {
    if (!startDate || !endDate || startDate > endDate) {
      alert('請選擇有效的日期範圍。');
      return;
    }

    if (selectedSources.size === 0) {
      alert('請至少勾選一種類型的班次以進行清除。');
      return;
    }

    const sourceNames: Record<ScheduleClearSource, string> = {
      ai: '🤖 AI 排班',
      rule: '⚙️ 規則演算法',
      instant: '⚡ 即時帶入',
      manual: '✍️ 手動排班'
    };

    const targetDesc = Array.from(selectedSources).map(s => sourceNames[s]).join('、');
    const confirmMsg = `⚠️ 確定要清除 ${startDate} 至 ${endDate} 區間內的【${targetDesc}】嗎？\n\n（被清除班次所對應的夥伴可用時間登記將自動重置為「待排班」狀態）`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsClearing(true);
      setClearStatusMessage(null);
      const res = await clearConfirmedSchedulesInRange(startDate, endDate, Array.from(selectedSources));
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
            <h3 className="font-extrabold text-base text-[#3E2723]">班表清除與重置管理 (細拆維度)</h3>
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
              您可以勾選想清除的特定排班來源。被清除班次所關聯的同仁可用時間登記將自動重置為 <strong>「待排班」</strong> 狀態，方便您針對特定演算法重新模擬。
            </p>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-col gap-1.5">
            <label className="font-bold text-[#5D4037]">快捷選擇方案：</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('auto_only')}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                  selectedSources.size === 2 && selectedSources.has('ai') && selectedSources.has('rule')
                    ? 'bg-[#795548] text-white border-[#795548] shadow-xs'
                    : 'bg-white border-[#DAC0A3]/70 text-[#5D4037] hover:bg-[#FAF7F2]'
                }`}
              >
                自動排班 (AI+規則)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('ai_only')}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                  selectedSources.size === 1 && selectedSources.has('ai')
                    ? 'bg-purple-800 text-white border-purple-800 shadow-xs'
                    : 'bg-white border-[#DAC0A3]/70 text-[#5D4037] hover:bg-[#FAF7F2]'
                }`}
              >
                僅清空 AI
              </button>
              <button
                type="button"
                onClick={() => applyPreset('rule_only')}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                  selectedSources.size === 1 && selectedSources.has('rule')
                    ? 'bg-blue-800 text-white border-blue-800 shadow-xs'
                    : 'bg-white border-[#DAC0A3]/70 text-[#5D4037] hover:bg-[#FAF7F2]'
                }`}
              >
                僅清空規則
              </button>
              <button
                type="button"
                onClick={() => applyPreset('all')}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                  selectedSources.size === 4
                    ? 'bg-rose-800 text-white border-rose-800 shadow-xs'
                    : 'bg-white border-[#DAC0A3]/70 text-[#5D4037] hover:bg-[#FAF7F2]'
                }`}
              >
                清空全部 (含手動)
              </button>
            </div>
          </div>

          {/* Granular Source Checkboxes */}
          <div className="flex flex-col gap-2">
            <label className="font-bold text-[#5D4037]">1. 請勾選要清除的班次來源：</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white/80 p-3 rounded-xl border border-[#DAC0A3]/60">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-[#3E2723] hover:text-[#795548]">
                <input
                  type="checkbox"
                  checked={selectedSources.has('ai')}
                  onChange={() => toggleSource('ai')}
                  className="w-4 h-4 rounded text-[#795548] accent-[#795548] cursor-pointer"
                />
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  🤖 Gemini AI 智慧排班
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-[#3E2723] hover:text-[#795548]">
                <input
                  type="checkbox"
                  checked={selectedSources.has('rule')}
                  onChange={() => toggleSource('rule')}
                  className="w-4 h-4 rounded text-[#795548] accent-[#795548] cursor-pointer"
                />
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  ⚙️ 程式規則演算法班次
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-[#3E2723] hover:text-[#795548]">
                <input
                  type="checkbox"
                  checked={selectedSources.has('instant')}
                  onChange={() => toggleSource('instant')}
                  className="w-4 h-4 rounded text-[#795548] accent-[#795548] cursor-pointer"
                />
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                  ⚡ 即時帶入班次 (Instant)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-[#3E2723] hover:text-[#795548]">
                <input
                  type="checkbox"
                  checked={selectedSources.has('manual')}
                  onChange={() => toggleSource('manual')}
                  className="w-4 h-4 rounded text-[#795548] accent-[#795548] cursor-pointer"
                />
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  ✍️ 人工手動排班班次
                </span>
              </label>
            </div>
          </div>

          {/* Date Range */}
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
            disabled={isClearing || selectedSources.size === 0}
            className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-rose-700 hover:bg-rose-800 transition-all shadow-md active:translate-y-0 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {isClearing ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                清除中...
              </>
            ) : (
              <>
                <span>🧹</span> 確定清除所選來源班表 ({selectedSources.size} 種來源)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

