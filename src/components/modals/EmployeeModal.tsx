import React from 'react';
import { ALL_POSITIONS } from '../../utils/constants';

interface EmployeeModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  empName: string;
  setEmpName: (val: string) => void;
  empPhone: string;
  setEmpPhone: (val: string) => void;
  empStatus: '正式夥伴' | '兼職夥伴';
  setEmpStatus: (val: '正式夥伴' | '兼職夥伴') => void;
  empActive: boolean;
  setEmpActive: (val: boolean) => void;
  empIsNewcomer: boolean;
  setEmpIsNewcomer: (val: boolean) => void;
  empTrainingPos: '餐吧' | 'POS機' | '後吧' | '收班' | '開早' | null;
  setEmpTrainingPos: (val: '餐吧' | 'POS機' | '後吧' | '收班' | '開早' | null) => void;
  empTrainedPoss: ('餐吧' | 'POS機' | '後吧' | '收班' | '開早')[];
  setEmpTrainedPoss: React.Dispatch<React.SetStateAction<('餐吧' | 'POS機' | '後吧' | '收班' | '開早')[]>>;
  empCertificates: ('FBI' | '黃金吧檯手')[];
  setEmpCertificates: React.Dispatch<React.SetStateAction<('FBI' | '黃金吧檯手')[]>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  handleTagClick: (pos: '餐吧' | 'POS機' | '後吧' | '收班' | '開早') => void;
  handleDragStart: (e: React.DragEvent, pos: '餐吧' | 'POS機' | '後吧' | '收班' | '開早') => void;
  handleDropToAvailable: (e: React.DragEvent) => void;
  handleDropToTraining: (e: React.DragEvent) => void;
  handleDropToTrained: (e: React.DragEvent) => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  isOpen,
  mode,
  empName,
  setEmpName,
  empPhone,
  setEmpPhone,
  empStatus,
  setEmpStatus,
  empActive,
  setEmpActive,
  empIsNewcomer,
  setEmpIsNewcomer,
  empTrainingPos,
  empTrainedPoss,
  empCertificates,
  setEmpCertificates,
  onClose,
  onSubmit,
  handleTagClick,
  handleDragStart,
  handleDropToAvailable,
  handleDropToTraining,
  handleDropToTrained
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#3E2723]/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-panel rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-[#DAC0A3]/50 flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-[#DAC0A3]/35 flex items-center justify-between">
          <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
            {mode === 'create' ? '新增員工資料' : '編輯員工資料'}
          </h3>
          <button
            onClick={onClose}
            className="text-[#6D4C41] hover:text-[#3E2723] p-1.5 rounded-lg hover:bg-[#FAF7F2] transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={onSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[85vh]">
          {/* Employee Name */}
          <div>
            <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">員工姓名</label>
            <input
              type="text"
              required
              placeholder="輸入真實姓名 (例如：王大明)"
              value={empName}
              onChange={(e) => setEmpName(e.target.value)}
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
            />
          </div>

          {/* Employee Phone */}
          <div>
            <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">聯絡電話 (驗證身分用)</label>
            <input
              type="text"
              required
              placeholder="例如：0912345678"
              value={empPhone}
              onChange={(e) => setEmpPhone(e.target.value)}
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm font-mono"
            />
          </div>

          {/* Employee Type Selection */}
          <div>
            <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">職務類別</label>
            <div className="grid grid-cols-2 gap-3">
              {(['正式夥伴', '兼職夥伴'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEmpStatus(type)}
                  className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border cursor-pointer ${empStatus === type
                    ? 'bg-[#795548] text-white border-[#795548] shadow-md shadow-[#795548]/10'
                    : 'bg-white text-[#8D6E63] border-[#DAC0A3]/50 hover:border-[#8D6E63]'
                    }`}
                >
                  {type === '正式夥伴' ? '☕ 正式夥伴' : '🍹 兼職夥伴'}
                </button>
              ))}
            </div>
          </div>

          {/* Active Status & Newcomer Checkbox */}
          <div className="flex items-center gap-6 bg-[#FAF7F2] p-3 rounded-xl border border-[#E5DCD5]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={empActive}
                onChange={(e) => setEmpActive(e.target.checked)}
                className="w-4 h-4 rounded text-[#795548] focus:ring-[#795548]"
              />
              <span className="text-xs font-bold text-[#5D4037]">在職狀態 (Active)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={empIsNewcomer}
                onChange={(e) => setEmpIsNewcomer(e.target.checked)}
                className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500"
              />
              <span className="text-xs font-bold text-pink-700">🌱 新進夥伴 (Newcomer)</span>
            </label>
          </div>

          {/* Skills & Training Position Management */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider">
                工作崗位培訓與合格狀態 (Drag or Click)
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3.5">
              {/* Column 1: Available */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropToAvailable}
                className="flex flex-col gap-2 p-3 rounded-xl border border-[#E5DCD5] bg-[#FAF7F2]/60 min-h-[140px] transition-colors"
              >
                <span className="text-[10px] font-extrabold text-[#8D6E63] text-center border-b border-[#E5DCD5] pb-1">
                  可培訓 / 待學習
                </span>
                <div className="flex flex-wrap gap-1.5 justify-center items-center flex-1">
                  {ALL_POSITIONS.filter(p => p !== empTrainingPos && !empTrainedPoss.includes(p)).map(pos => (
                    <div
                      key={pos}
                      draggable
                      onDragStart={(e) => handleDragStart(e, pos)}
                      onClick={() => handleTagClick(pos)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-[#DAC0A3] text-[#5D4037] hover:border-[#8D6E63] shadow-xs cursor-pointer select-none transition-all active:scale-95"
                    >
                      {pos}
                    </div>
                  ))}
                </div>
              </div>

              {/* Column 2: In Training */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropToTraining}
                className="flex flex-col gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50/20 min-h-[140px] transition-colors"
              >
                <span className="text-[10px] font-extrabold text-amber-700 text-center border-b border-amber-200 pb-1">
                  📖 正在培訓中 (max 1)
                </span>
                <div className="flex flex-wrap gap-1.5 justify-center items-center flex-1">
                  {empTrainingPos ? (
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, empTrainingPos)}
                      onClick={() => handleTagClick(empTrainingPos)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 border border-amber-300 text-amber-700 hover:border-amber-400 shadow-xs cursor-pointer select-none transition-all active:scale-95 animate-pulse"
                    >
                      {empTrainingPos}
                    </div>
                  ) : (
                    <span className="text-[9px] text-[#7B1FA2]/40 text-center select-none p-2 leading-normal">
                      拖入或點擊標籤開始培訓
                    </span>
                  )}
                </div>
              </div>

              {/* Column 3: Trained */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropToTrained}
                className="flex flex-col gap-2 p-3 rounded-xl border border-emerald-100 bg-emerald-50/10 min-h-[140px] transition-colors"
              >
                <span className="text-[10px] font-extrabold text-[#2E7D32] text-center border-b border-emerald-100 pb-1">
                  ✅ 已考試合格 (Qualified)
                </span>
                <div className="flex flex-wrap gap-1.5 justify-center items-center flex-1">
                  {empTrainedPoss && empTrainedPoss.length > 0 ? (
                    empTrainedPoss.map(pos => (
                      <div
                        key={pos}
                        draggable
                        onDragStart={(e) => handleDragStart(e, pos)}
                        onClick={() => handleTagClick(pos)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 border border-emerald-250 text-emerald-700 hover:border-emerald-350 shadow-xs cursor-pointer select-none transition-all active:scale-95"
                      >
                        {pos}
                      </div>
                    ))
                  ) : (
                    <span className="text-[9px] text-[#2E7D32]/40 text-center select-none p-2 leading-normal">
                      尚未有合格項目
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Certificates Selector */}
          <div>
            <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">持有證照</label>
            <div className="flex flex-wrap gap-2">
              {(['FBI', '黃金吧檯手'] as const).map(cert => {
                const hasCert = empCertificates.includes(cert);
                return (
                  <button
                    key={cert}
                    type="button"
                    onClick={() => {
                      setEmpCertificates(prev =>
                        prev.includes(cert)
                          ? prev.filter(c => c !== cert)
                          : [...prev, cert]
                      );
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${hasCert
                      ? 'bg-[#795548] text-white border-[#795548] shadow-xs'
                      : 'bg-white text-[#8D6E63] border-[#DAC0A3]/50 hover:border-[#8D6E63]'
                      }`}
                  >
                    {cert === 'FBI' ? '🛡️ FBI' : '☕ 黃金吧檯手'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 border-t border-[#E5DCD5] pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white hover:bg-[#FAF7F2] border border-[#E5DCD5] text-[#5D4037] font-semibold px-4 py-3 rounded-xl transition-all cursor-pointer text-center text-sm"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#795548] hover:bg-[#5D4037] text-white font-semibold px-4 py-3 rounded-xl transition-all shadow-lg shadow-[#795548]/10 cursor-pointer text-center text-sm"
            >
              儲存員工
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
