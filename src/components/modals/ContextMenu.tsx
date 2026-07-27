import React from 'react';
import type { WorkSchedule } from '../../services/scheduler';

interface ContextMenuProps {
  contextMenu: {
    x: number;
    y: number;
    schedule?: WorkSchedule;
    emptyCell?: { employeeName: string; dateStr: string };
  } | null;
  markedEmptyCells: Record<string, boolean>;
  onClose: () => void;
  onToggleMarkBlue: (schedule: WorkSchedule) => void;
  onToggleMarkEmptyCellBlue: (employeeName: string, dateStr: string) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  contextMenu,
  markedEmptyCells,
  onClose,
  onToggleMarkBlue,
  onToggleMarkEmptyCellBlue
}) => {
  if (!contextMenu) return null;

  const empName = contextMenu.schedule ? contextMenu.schedule.employeeName : contextMenu.emptyCell?.employeeName;
  const dateStr = contextMenu.schedule ? contextMenu.schedule.date : contextMenu.emptyCell?.dateStr;

  return (
    <>
      <div
        className="fixed inset-0 z-[200]"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-[201] bg-white rounded-xl shadow-xl border border-[#DAC0A3]/50 py-1.5 min-w-[180px]"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <div className="px-3 py-1.5 text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider border-b border-[#DAC0A3]/30 mb-1">
          {empName} ({dateStr})
        </div>
        {contextMenu.schedule ? (
          <button
            onClick={() => onToggleMarkBlue(contextMenu.schedule!)}
            className="w-full text-left px-3 py-2 text-xs font-semibold text-[#1e40af] hover:bg-blue-50 transition-colors flex items-center gap-2 cursor-pointer"
          >
            {contextMenu.schedule.markedBlue ? (
              <><span className="text-base">⬜</span><span>取消藍色標記</span></>
            ) : (
              <><span className="text-base">🔵</span><span>藍色標記此班次</span></>
            )}
          </button>
        ) : contextMenu.emptyCell ? (
          <button
            onClick={() => onToggleMarkEmptyCellBlue(contextMenu.emptyCell!.employeeName, contextMenu.emptyCell!.dateStr)}
            className="w-full text-left px-3 py-2 text-xs font-semibold text-[#1e40af] hover:bg-blue-50 transition-colors flex items-center gap-2 cursor-pointer"
          >
            {markedEmptyCells[`${contextMenu.emptyCell.employeeName.trim().toLowerCase()}|${contextMenu.emptyCell.dateStr}`] ? (
              <><span className="text-base">⬜</span><span>取消日期藍色標記</span></>
            ) : (
              <><span className="text-base">🔵</span><span>藍色標記此日期</span></>
            )}
          </button>
        ) : null}
      </div>
    </>
  );
};
