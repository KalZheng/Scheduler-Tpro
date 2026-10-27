import { useState, useEffect } from 'react';

export function useAuthRouting() {
  // Role selection state: worker or manager
  const [activeRole, setActiveRole] = useState<'worker' | 'manager'>('worker');

  // Manager authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => sessionStorage.getItem('manager_auth') === 'true');
  const [managerRole, setManagerRole] = useState<'manager' | 'admin'>(() => (sessionStorage.getItem('manager_role') as 'manager' | 'admin') || 'manager');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Helper for uniform SPA paths (/manager, /worker)
  const getAppPath = (subPath: 'manager' | 'worker') => {
    const base = import.meta.env.BASE_URL || '/';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}/${subPath}`;
  };

  const navigateToRole = (role: 'manager' | 'worker') => {
    const targetPath = getAppPath(role);
    window.history.pushState(null, '', targetPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Path, Hash & Query-based routing with automatic URL normalization & ?i=1 cleanup
  useEffect(() => {
    const handleRouteChange = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const hasSecurityParam = searchParams.has('i'); // InfinityFree ?i=1 challenge param

      const isManager =
        hash.includes('manager') ||
        pathname.endsWith('/manager') ||
        pathname.endsWith('/manager/') ||
        searchParams.get('role') === 'manager';

      const isWorker =
        hash.includes('worker') ||
        pathname.endsWith('/worker') ||
        pathname.endsWith('/worker/') ||
        searchParams.get('role') === 'worker';

      const savedRole = sessionStorage.getItem('last_role');
      const isAuth = sessionStorage.getItem('manager_auth') === 'true';

      if (isManager || (hasSecurityParam && savedRole === 'manager')) {
        setActiveRole('manager');
        sessionStorage.setItem('last_role', 'manager');
        const targetPath = getAppPath('manager');
        if (window.location.pathname !== targetPath || window.location.hash || hasSecurityParam || searchParams.has('role')) {
          window.history.replaceState(null, '', targetPath);
        }
      } else if (isWorker) {
        setActiveRole('worker');
        sessionStorage.setItem('last_role', 'worker');
        const targetPath = getAppPath('worker');
        if (window.location.pathname !== targetPath || window.location.hash || hasSecurityParam || searchParams.has('role')) {
          window.history.replaceState(null, '', targetPath);
        }
      } else {
        // Fallback: If authenticated as manager or remembered from session
        if (savedRole === 'manager' || (isAuth && !hash && !isWorker)) {
          setActiveRole('manager');
          const targetPath = getAppPath('manager');
          if (window.location.pathname !== targetPath || window.location.hash || hasSecurityParam) {
            window.history.replaceState(null, '', targetPath);
          }
        } else {
          setActiveRole('worker');
          if (hasSecurityParam || (hash && hash !== '#/worker')) {
            const targetPath = getAppPath('worker');
            window.history.replaceState(null, '', targetPath);
          }
        }
      }
    };

    handleRouteChange();
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // Handle Login authentication
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const MANAGER_PASSCODE = 'coffee888';
    const ADMIN_PASSCODE = 'admincoffee888';
    if (passcodeInput === ADMIN_PASSCODE) {
      setIsAuthenticated(true);
      setManagerRole('admin');
      sessionStorage.setItem('manager_auth', 'true');
      sessionStorage.setItem('manager_role', 'admin');
      setLoginError('');
      setPasscodeInput('');
    } else if (passcodeInput === MANAGER_PASSCODE) {
      setIsAuthenticated(true);
      setManagerRole('manager');
      sessionStorage.setItem('manager_auth', 'true');
      sessionStorage.setItem('manager_role', 'manager');
      setLoginError('');
      setPasscodeInput('');
    } else {
      setLoginError('密碼不正確，請重新輸入 ☕');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    setIsAuthenticated(false);
    setManagerRole('manager');
    sessionStorage.removeItem('manager_auth');
    sessionStorage.removeItem('manager_role');
    setPasscodeInput('');
    navigateToRole('worker');
  };

  return {
    activeRole,
    setActiveRole,
    isAuthenticated,
    setIsAuthenticated,
    managerRole,
    setManagerRole,
    passcodeInput,
    setPasscodeInput,
    loginError,
    setLoginError,
    getAppPath,
    navigateToRole,
    handleLogin,
    handleLogout
  };
}
