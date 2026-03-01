import { useEffect, useMemo, useState } from 'react';
import { evaluateEntryStatusFromLivePrice } from '../engine/entryWindow';

export const useEntryWindow = (signal) => {
  const [entryStatus, setEntryStatus] = useState(null);
  const [loading, setLoading] = useState(Boolean(signal));

  const evaluateNow = async () => {
    if (!signal) {
      setEntryStatus(null);
      setLoading(false);
      return;
    }

    try {
      const status = await evaluateEntryStatusFromLivePrice(signal);
      setEntryStatus(status);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!signal) {
      setEntryStatus(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    evaluateNow();

    const refreshInterval = setInterval(evaluateNow, 30000);
    const countdownInterval = setInterval(() => {
      setEntryStatus((prev) => {
        if (!prev || typeof prev.secondsRemaining !== 'number') return prev;
        const next = Math.max(0, prev.secondsRemaining - 1);
        const mm = String(Math.floor(next / 60)).padStart(2, '0');
        const ss = String(next % 60).padStart(2, '0');
        return { ...prev, secondsRemaining: next, countdownDisplay: `${mm}:${ss}` };
      });
    }, 1000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
    };
  }, [signal]);

  const statusLabel = useMemo(() => {
    if (!entryStatus) return 'loading';
    return entryStatus.window;
  }, [entryStatus]);

  return { entryStatus, loading, evaluateNow, statusLabel };
};

export default useEntryWindow;
