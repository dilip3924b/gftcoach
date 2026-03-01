import { useCallback, useEffect, useState } from 'react';
import { tradeTracker } from '../engine/tradeTracker';

export const useActiveTrade = () => {
  const [activeTrade, setActiveTradeState] = useState(null);
  const [liveTrade, setLiveTrade] = useState(null);

  const refresh = useCallback(async () => {
    const trade = await tradeTracker.getActiveTrade();
    setActiveTradeState(trade);
    if (trade) {
      const live = await tradeTracker.estimatePnL();
      setLiveTrade(live);
    } else {
      setLiveTrade(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const setActiveTrade = async (trade) => {
    await tradeTracker.setActiveTrade(trade);
    await refresh();
  };

  const clearActiveTrade = async () => {
    await tradeTracker.clearActiveTrade();
    await refresh();
  };

  return { activeTrade, liveTrade, refresh, setActiveTrade, clearActiveTrade };
};
