import React from 'react';
import type { Employee } from '../../services/scheduler';

interface WorkerLoginProps {
  employees: Employee[];
  selectedWorkerName: string;
  setSelectedWorkerName: (val: string) => void;
  workerPhoneInput: string;
  setWorkerPhoneInput: (val: string) => void;
  workerVerifyError: string;
  onVerify: (e: React.FormEvent) => void;
}

export const WorkerLogin: React.FC<WorkerLoginProps> = ({
  employees,
  selectedWorkerName,
  setSelectedWorkerName,
  workerPhoneInput,
  setWorkerPhoneInput,
  workerVerifyError,
  onVerify
}) => {
  return (
    <div className="max-w-md mx-auto my-12 animate-scale-in">
      <div className="glass-panel p-8 rounded-3xl border border-[#DAC0A3]/50 shadow-2xl flex flex-col space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#DAC0A3]/50 text-3xl shadow-sm">
            👤
          </div>
          <h2 className="text-xl font-black text-[#3E2723] pt-2">
            員工可用時間系統 ☕ 驗證身分
          </h2>
          <p className="text-xs text-[#6D4C41] font-medium">
            請選擇您的姓名並輸入聯絡電話以確認身分
          </p>
        </div>

        <form onSubmit={onVerify} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">員工姓名</label>
            <select
              required
              value={selectedWorkerName}
              onChange={(e) => setSelectedWorkerName(e.target.value)}
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm cursor-pointer"
            >
              <option value="" className="bg-white text-[#3E2723]">請選擇您的姓名...</option>
              {employees.filter(emp => emp.active !== false).map(emp => (
                <option key={emp.id} value={emp.name} className="bg-white text-[#3E2723]">
                  {emp.name} ({emp.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#6D4C41] uppercase tracking-wider mb-2">聯絡電話</label>
            <input
              type="tel"
              required
              placeholder="請輸入您的聯絡電話..."
              value={workerPhoneInput}
              onChange={(e) => setWorkerPhoneInput(e.target.value)}
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-center"
            />
          </div>

          {workerVerifyError && (
            <div className="text-xs text-red-650 font-bold text-center bg-red-50/50 py-2 rounded-lg border border-red-100 animate-pulse">
              {workerVerifyError}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-[#795548] hover:bg-[#5D4037] text-white font-semibold px-4 py-3 rounded-xl transition-all shadow-lg shadow-[#795548]/15 cursor-pointer text-center text-sm"
          >
            驗證並登入
          </button>
        </form>
      </div>
    </div>
  );
};
