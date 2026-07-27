import React from 'react';

interface ManagerLoginProps {
  passcodeInput: string;
  setPasscodeInput: (val: string) => void;
  loginError: string;
  onLogin: (e: React.FormEvent) => void;
}

export const ManagerLogin: React.FC<ManagerLoginProps> = ({
  passcodeInput,
  setPasscodeInput,
  loginError,
  onLogin
}) => {
  return (
    <div className="max-w-md mx-auto my-12 animate-scale-in">
      <div className="glass-panel p-8 rounded-3xl border border-[#DAC0A3]/50 shadow-2xl flex flex-col space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#DAC0A3]/50 text-3xl shadow-sm">
            ☕
          </div>
          <h2 className="text-xl font-black text-[#3E2723] pt-2">
            精品咖啡館 ☕ 主管登入
          </h2>
          <p className="text-xs text-[#6D4C41] font-medium">
            請輸入管理密碼以進入排班規劃中心
          </p>
        </div>

        <form onSubmit={onLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#6D4C41] uppercase tracking-wider mb-2">管理密碼</label>
            <input
              type="password"
              required
              placeholder="請輸入密碼..."
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm font-mono tracking-widest text-center"
              autoFocus
            />
          </div>

          {loginError && (
            <div className="text-xs text-red-650 font-bold text-center bg-red-50/50 py-2 rounded-lg border border-red-100 animate-pulse">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-[#795548] hover:bg-[#5D4037] text-white font-semibold px-4 py-3 rounded-xl transition-all shadow-lg shadow-[#795548]/15 cursor-pointer text-center text-sm"
          >
            驗證登入
          </button>
        </form>
      </div>
    </div>
  );
};
