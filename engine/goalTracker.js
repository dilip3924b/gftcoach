import { db } from '../lib/db';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const goalTracker = {
  getPacingStatus: (totalProfit, accountStartDate) => {
    const profitSoFar = Number(totalProfit || 0);
    const start = accountStartDate ? new Date(accountStartDate) : new Date();
    const daysUsed = clamp(Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1, 1, 28);
    const daysRemaining = Math.max(0, 28 - daysUsed);
    const expectedByNow = Number(((100 / 28) * daysUsed).toFixed(2));
    const profitNeeded = Number(Math.max(0, 100 - profitSoFar).toFixed(2));
    const dailyTargetRemaining = Number((profitNeeded / Math.max(1, daysRemaining)).toFixed(2));
    const projectedFinalProfit = Number((profitSoFar + dailyTargetRemaining * daysRemaining).toFixed(2));

    let pacingStatus = 'on_track';
    if (profitSoFar > expectedByNow + 10) pacingStatus = 'ahead';
    else if (profitSoFar < expectedByNow - 10) pacingStatus = 'behind';
    if (daysRemaining < 5 && profitSoFar < 70) pacingStatus = 'critical';

    const urgency =
      pacingStatus === 'critical' ? 'critical' : pacingStatus === 'behind' ? 'high' : pacingStatus === 'on_track' ? 'medium' : 'low';

    const message =
      pacingStatus === 'ahead'
        ? `You are ahead. Keep consistency and protect gains.`
        : pacingStatus === 'critical'
          ? `Critical pace. Need strong focus in remaining days.`
          : pacingStatus === 'behind'
            ? `Behind pace. Need about $${dailyTargetRemaining}/day now.`
            : `On track. Need about $${dailyTargetRemaining}/day.`;

    return {
      daysTotal: 28,
      daysUsed,
      daysRemaining,
      profitSoFar,
      profitNeeded,
      expectedByNow,
      pacingStatus,
      dailyTargetRemaining,
      percentComplete: Number(((profitSoFar / 100) * 100).toFixed(1)),
      projectedFinalProfit,
      message,
      urgency,
    };
  },

  checkConsistencyRule: (todayProfit, totalProfit) => {
    const total = Math.max(1, Number(totalProfit || 0));
    const pct = Number(((Number(todayProfit || 0) / total) * 100).toFixed(1));
    const isViolation = pct > 15;
    return {
      isViolation,
      todayPercent: pct,
      maxAllowed: 15,
      advice: isViolation
        ? `Today's profit is ${pct}% of total. Stop trading today to protect consistency.`
        : 'Consistency looks safe today.',
      safeToTrade: !isViolation,
    };
  },

  checkWithdrawalEligibility: async (userId) => {
    const [profileRes, weeklyRes] = await Promise.all([db.getProfile(userId), db.getWeeklyStats(userId)]);
    const totalProfit = Number(profileRes?.data?.total_profit || 0);
    const stats = weeklyRes?.data || [];

    const profitableDays = stats.filter((d) => Number(d.total_pl) >= 5);
    const minTradingDaysPass = profitableDays.length >= 3;
    const minAmountPass = totalProfit >= 35;
    const consistencyPass = stats.every((d) => {
      if (totalProfit <= 0) return true;
      return (Number(d.total_pl) / totalProfit) * 100 <= 15;
    });

    return {
      eligible: minTradingDaysPass && minAmountPass && consistencyPass,
      userPayout: Number((Math.min(totalProfit, 100) * 0.8).toFixed(2)),
      totalProfit,
      checks: {
        minTradingDays: { pass: minTradingDaysPass, found: profitableDays.length, required: 3 },
        minDailyProfit: { pass: minTradingDaysPass, detail: `Profitable days: ${profitableDays.length}` },
        consistencyRule: { pass: consistencyPass, detail: consistencyPass ? 'No day exceeded 15%.' : 'At least one day exceeded 15%.' },
        minAmount: { pass: minAmountPass, found: totalProfit, required: 35 },
      },
      nextStep: 'Go to goatfundedtrader.com dashboard and request payout when eligible.',
      blockers: [
        ...(minTradingDaysPass ? [] : ['Need at least 3 profitable days with $5+ each.']),
        ...(minAmountPass ? [] : ['Need at least $35 total profit.']),
        ...(consistencyPass ? [] : ['One trading day exceeds 15% consistency limit.']),
      ],
    };
  },
};
