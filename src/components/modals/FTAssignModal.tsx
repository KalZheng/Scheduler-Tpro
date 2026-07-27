import React from 'react';
import type { WorkerAvailability, ShiftPreset } from '../../services/scheduler';

interface FTAssignModalProps {
  isFTAssignModalOpen: boolean;
  pendingAssignAvail: WorkerAvailability | null;
  shiftPresets: ShiftPreset[];
  timeSlots: string[];
  onClose: () => void;
  onExecuteFTAssign: (avail: WorkerAvailability, shiftName: string, startTime: string, endTime: string) => void;
}

export const FTAssignModal: React.FC<FTAssignModalProps> = ({
  isFTAssignModalOpen,
  pendingAssignAvail,
  shiftPresets,
  timeSlots,
  onClose,
  onExecuteFTAssign
}) => {
  if (!isFTAssignModalOpen || !pendingAssignAvail) return null;

  return (
    <div className="fixed inset-0 bg-[#3E2723]/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-panel rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#DAC0A3]/50 p-5 space-y-4">
        <div className="border-b border-[#DAC0A3]/35 pb-3">
          <h3 className="text-base font-bold text-[#3E2723] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#795548]"></span>
            指派正式同仁班次
          </h3>
          <p className="text-xs text-[#6D4C41] mt-1 font-medium">
            同仁：{pendingAssignAvail.employeeName}<br />
            日期：{pendingAssignAvail.date}
          </p>
          <p className="text-[11px] text-[#8D6E63] mt-1.5 leading-normal">
            請選擇要指派的班次時間（此指派將設定為該班次的原始時間，因此不會觸發工時調整標記的顏色）：
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          {shiftPresets.map((preset) => {
            const isAvailable = timeSlots.includes(preset.startTime) && timeSlots.includes(preset.endTime);
            if (!isAvailable) return null;
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => onExecuteFTAssign(pendingAssignAvail, preset.name, preset.startTime, preset.endTime)}
                className="w-full py-3 bg-[#795548] hover:bg-[#5D4037] text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:shadow-[#795548]/10"
              >
                ☀️ {preset.name} ({preset.startTime} - {preset.endTime})
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#E5DCD5]/60 pt-3 mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#FAF7F2] hover:bg-[#FAF7F2]/80 text-[#6D4C41] font-semibold rounded-lg text-xs transition-colors cursor-pointer border border-[#DAC0A3]/40"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
