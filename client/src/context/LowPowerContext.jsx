import { createContext, useContext, useEffect, useState } from 'react';

const LowPowerContext = createContext({ lowPower: false, setLowPower: () => {} });

export function LowPowerProvider({ children }) {
  const [lowPower, setLowPowerState] = useState(() => {
    try {
      return localStorage.getItem('mm_low_power') === '1';
    } catch {
      return false;
    }
  });

  const setLowPower = (v) => {
    setLowPowerState(!!v);
    try {
      localStorage.setItem('mm_low_power', v ? '1' : '0');
    } catch { /* ignore */ }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('mm-low-power', lowPower);
  }, [lowPower]);

  return (
    <LowPowerContext.Provider value={{ lowPower, setLowPower }}>
      {children}
    </LowPowerContext.Provider>
  );
}

export function useLowPower() {
  return useContext(LowPowerContext);
}
