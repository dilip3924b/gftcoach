import { useEffect, useState } from 'react';
import { goalTracker } from '../engine/goalTracker';

export const useGoalPacing = (totalProfit, accountStartDate) => {
  const [pacing, setPacing] = useState(() => goalTracker.getPacingStatus(totalProfit, accountStartDate));

  useEffect(() => {
    setPacing(goalTracker.getPacingStatus(totalProfit, accountStartDate));
  }, [totalProfit, accountStartDate]);

  return pacing;
};
