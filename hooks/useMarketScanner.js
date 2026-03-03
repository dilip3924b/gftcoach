import { useCallback, useEffect, useState } from 'react';
import { getLatestSignal, performScan, startScanner, stopScanner } from '../engine/scanner';
import { isScannerAllowedNow } from '../engine/marketHours';

export const useMarketScanner = (userId) => {
  const [scanStatus, setScanStatus] = useState('waiting');
  const [activeSignal, setActiveSignal] = useState(null);
  const [lastScanAt, setLastScanAt] = useState(null);
  const [nextScanAt, setNextScanAt] = useState(null);
  const [lastNoSignalReason, setLastNoSignalReason] = useState('');

  const manualScan = useCallback(async () => {
    if (!userId) return null;
    setScanStatus('scanning');
    const result = await performScan(userId);
    const now = new Date();
    setLastScanAt(now.toISOString());
    setNextScanAt(new Date(now.getTime() + 30 * 60 * 1000).toISOString());
    if (result?.signal) {
      setActiveSignal(result.signal);
      setScanStatus('signal_found');
      setLastNoSignalReason('');
      return result.signal;
    }
    if (result?.reason) {
      setLastNoSignalReason(result.reason);
    }
    if (result?.reason?.toLowerCase?.().includes('market closed')) {
      setScanStatus('session_closed');
    } else if (result?.reason?.toLowerCase?.().includes('danger')) {
      setScanStatus('danger_zone');
    } else if (result?.reason?.toLowerCase?.().includes('session')) {
      setScanStatus('wrong_session');
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
        setLastNoSignalReason('Scanner paused: market closed or restricted session.');
      }
      setNextScanAt(new Date(Date.now() + 30 * 60 * 1000).toISOString());
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
    lastScanAt,
    nextScanAt,
    lastNoSignalReason,
  };
};
