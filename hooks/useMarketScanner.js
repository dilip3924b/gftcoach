import { useCallback, useEffect, useState } from 'react';
import { getLatestSignal, performScan, startScanner, stopScanner } from '../engine/scanner';
import { isScannerAllowedNow } from '../engine/marketHours';

export const useMarketScanner = (userId) => {
  const [scanStatus, setScanStatus] = useState('waiting');
  const [activeSignal, setActiveSignal] = useState(null);

  const manualScan = useCallback(async () => {
    if (!userId) return null;
    setScanStatus('scanning');
    const result = await performScan(userId);
    if (result?.signal) {
      setActiveSignal(result.signal);
      setScanStatus('signal_found');
      return result.signal;
    }
    if (result?.reason?.toLowerCase?.().includes('market closed')) {
      setScanStatus('session_closed');
    } else {
      setScanStatus('waiting');
    }
    return null;
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let mounted = true;

    const init = async () => {
      const signal = await getLatestSignal();
      if (!mounted) return;
      if (signal) {
        setActiveSignal(signal);
        setScanStatus('signal_found');
      }
      if (isScannerAllowedNow()) {
        await startScanner(userId).catch(() => {});
      } else {
        setScanStatus('session_closed');
      }
      manualScan();
    };

    init();

    const interval = setInterval(async () => {
      if (isScannerAllowedNow()) {
        await startScanner(userId).catch(() => {});
      } else {
        await stopScanner().catch(() => {});
      }
      manualScan();
    }, 30 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
      stopScanner().catch(() => {});
    };
  }, [manualScan, userId]);

  return {
    scanStatus,
    activeSignal,
    setActiveSignal,
    manualScan,
  };
};
