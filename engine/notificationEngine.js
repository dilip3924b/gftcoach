import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const toDate = (iso) => (iso ? new Date(iso) : new Date());
const ENTRY_WINDOW_WARNING_KEY = 'entry_window_warning_notification_id';
const ENTRY_WINDOW_EXPIRED_KEY = 'entry_window_expired_notification_id';

const schedule = async ({ title, body, trigger, data }) => {
  return Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger });
};

export const notificationEngine = {
  scheduleBestWindowAlert: async () => {
    return schedule({
      title: '⚡ Best trading window starts in 5 min!',
      body: 'London+NY overlap opens at 6:30 PM IST. Tight spreads. Best signals.',
      trigger: { weekday: 2, hour: 18, minute: 25, repeats: true },
      data: { screen: 'today' },
    });
  },
  scheduleDailyPlan: async (plan) => {
    return schedule({
      title: `☀️ Your Trading Plan for ${plan?.dateLabel || 'Today'}`,
      body:
        plan?.summary ||
        `Best window: ${plan?.bestWindow || '6:30 PM - 10:30 PM IST'} | Goal +$5 today.`,
      trigger: {
        hour: 9,
        minute: 0,
        repeats: true,
      },
      data: { screen: 'today', planId: plan?.id || null },
    });
  },

  sendTradeAlert: async (signal) => {
    const high = signal?.confidence === 'HIGH';
    const symbolLabel = signal?.symbol === 'XAUUSD' ? '🥇 XAU/USD' : signal?.symbol === 'BTCUSD' ? '₿ BTC/USD' : '💶 EUR/USD';
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: high ? `🎯 ${symbolLabel} ${signal.signal} setup ready` : `👀 ${symbolLabel} potential setup`,
        subtitle: high ? `${signal?.confidence || 'MEDIUM'} confidence` : 'Tap to review now',
        body: high
          ? `Entry ${signal.entry?.range || signal.entry?.price || 'N/A'} | SL ${signal.stopLoss?.price || 'N/A'} | TP ${signal.takeProfit?.price || 'N/A'}`
          : `Direction: ${signal.signal}. Open app and review full instructions.`,
        data: { screen: 'signal', signalId: signal?.id || null, symbol: signal?.symbol || 'EURUSD' },
        categoryIdentifier: 'SIGNAL_ACTIONS',
      },
      trigger: null,
    });
    await notificationEngine.scheduleEntryWindowWarnings(signal);
    return id;
  },

  sendMultiAssetAlert: async (signal, totalSignals = 1) => {
    const symbolLabel = signal?.symbol === 'XAUUSD' ? '🥇 XAU/USD' : signal?.symbol === 'BTCUSD' ? '₿ BTC/USD' : '💶 EUR/USD';
    return Notifications.scheduleNotificationAsync({
      content: {
        title: `🎯 ${symbolLabel} ${signal?.signal || 'WAIT'} Signal`,
        subtitle: `${signal?.confidence || 'LOW'} confidence`,
        body: totalSignals > 1
          ? `${totalSignals} setups found. Best: ${symbolLabel}. Confidence: ${signal?.confidence} (${signal?.confidenceScore || 'N/A'}/100).`
          : `${symbolLabel} setup ready. Confidence: ${signal?.confidence} (${signal?.confidenceScore || 'N/A'}/100).`,
        data: { screen: 'signal', symbol: signal?.symbol || 'EURUSD', signalId: signal?.id || null },
        categoryIdentifier: 'SIGNAL_ACTIONS',
      },
      trigger: null,
    });
  },

  scheduleDangerWarnings: async (events = []) => {
    for (const event of events) {
      const start = toDate(event.dangerWindowStart);
      const pre35 = new Date(start.getTime() - 35 * 60 * 1000);
      const pre5 = new Date(start.getTime() - 5 * 60 * 1000);
      const allClear = new Date(toDate(event.timestamp).getTime() + 30 * 60 * 1000);

      if (pre35 > new Date()) {
        await schedule({
          title: `⚠️ ${event.event} in 35 minutes`,
          body: `Close open trades before ${event.time}.`,
          trigger: pre35,
          data: { screen: 'today' },
        });
      }
      if (pre5 > new Date()) {
        await schedule({
          title: '🚨 CLOSE TRADE NOW',
          body: `${event.event} in 5 minutes. Protect capital.`,
          trigger: pre5,
          data: { screen: 'today' },
        });
      }
      if (allClear > new Date()) {
        await schedule({
          title: `✅ ${event.event} passed`,
          body: 'Market settling. Check for new setup.',
          trigger: allClear,
          data: { screen: 'today' },
        });
      }
    }
  },

  sendTradeWon: async (profit, totalProfit) => {
    return Notifications.scheduleNotificationAsync({
      content: {
        title: `🎉 Take Profit Hit! +$${profit}`,
        body: `Total now $${totalProfit}/$100. Keep discipline.`,
      },
      trigger: null,
    });
  },

  sendTradeLost: async (loss, todayPL) => {
    return Notifications.scheduleNotificationAsync({
      content: {
        title: `📉 Stop Loss Hit -$${Math.abs(loss)}`,
        body: `Today's P&L: $${todayPL}. Stay calm and follow rules.`,
      },
      trigger: null,
    });
  },

  sendMilestone: async (amount) => {
    const map = {
      25: { title: '🌟 25% There!', body: '$25 hit. Keep consistency.' },
      50: { title: '🔥 Halfway!', body: '$50 hit. Stay disciplined.' },
      75: { title: '💪 Almost!', body: '$75 hit. $25 left.' },
      100: { title: '🏆 GOAL HIT!', body: 'You reached $100. Request payout now.' },
    };
    const m = map[amount] || { title: 'Milestone', body: `Reached $${amount}.` };
    return Notifications.scheduleNotificationAsync({ content: m, trigger: null });
  },

  sendMilestoneByProfit: async (totalProfit) => {
    const key = [100, 75, 50, 25].find((m) => Number(totalProfit) >= m && Number(totalProfit) < m + 5);
    if (!key) return null;
    return notificationEngine.sendMilestone(key);
  },

  scheduleExpiryWarnings: async (startDate) => {
    const start = toDate(startDate);
    const checkpoints = [20, 24, 27, 28];
    for (const day of checkpoints) {
      const date = new Date(start.getTime() + day * 24 * 60 * 60 * 1000);
      if (date <= new Date()) continue;
      await schedule({
        title: day === 28 ? '🔔 Account expires today' : `⏳ ${28 - day} day(s) left on account`,
        body: 'Keep trading plan focused and risk-controlled.',
        trigger: date,
        data: { screen: 'today' },
      });
    }
  },

  sendConsistencyWarning: async (todayProfit, totalProfit) => {
    const pct = totalProfit > 0 ? ((todayProfit / totalProfit) * 100).toFixed(1) : '0';
    return Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Consistency Rule Warning',
        body: `Today is ${pct}% of total profit. Consider stopping for the day.`,
      },
      trigger: null,
    });
  },

  scheduleWeeklyReview: async () => {
    return schedule({
      title: '📊 Weekly Review Ready',
      body: 'Tap to review your week and next plan.',
      trigger: { weekday: 1, hour: 19, minute: 0, repeats: true },
      data: { screen: 'ai' },
    });
  },

  scheduleFridayCloseWarning: async () => {
    return schedule({
      title: '⚠️ Close your trades - market closing soon',
      body: 'Market closes for weekend tonight. Close all trades before 10:30 PM IST.',
      trigger: { weekday: 6, hour: 21, minute: 30, repeats: true },
      data: { screen: 'today' },
    });
  },

  scheduleSessionReminders: async () => {
    const reminders = [
      { hour: 13, minute: 25, title: '🟡 London opening in 5 min' },
      { hour: 18, minute: 30, title: '🔥 BEST TIME TO TRADE' },
      { hour: 22, minute: 25, title: '⏰ Window closing in 5 min' },
      { hour: 22, minute: 30, title: '🛑 Close open trades now' },
    ];
    for (const reminder of reminders) {
      await schedule({
        title: reminder.title,
        body: 'Open GFT Coach for live instructions.',
        trigger: { hour: reminder.hour, minute: reminder.minute, repeats: true },
        data: { screen: 'today' },
      });
    }
  },

  scheduleMarketHoursNotifications: async () => {
    const jobs = [
      { weekday: 6, hour: 21, minute: 30, title: '⚠️ Close Your Trades — Market Closing Soon', body: 'Close all EUR/USD trades before 10:30 PM IST. Weekend close is near.' },
      { weekday: 6, hour: 22, minute: 30, title: '🔴 LAST CALL — Market Closing Now', body: 'Close open trades now. Weekend market closure has started.' },
      { weekday: 7, hour: 9, minute: 0, title: '📅 Market Closed — Weekend Mode', body: 'Forex is closed this weekend. Review your week in the app.' },
      { weekday: 1, hour: 16, minute: 0, title: '☀️ Market Opens Tomorrow!', body: 'London opens Monday 1:30 PM IST. Best window starts 6:30 PM IST.' },
      { weekday: 2, hour: 13, minute: 20, title: '🟢 Market Opens in 10 Minutes!', body: 'London session starts at 1:30 PM IST. Scanner will resume.' },
    ];
    for (const job of jobs) {
      await schedule({
        title: job.title,
        body: job.body,
        trigger: { weekday: job.weekday, hour: job.hour, minute: job.minute, repeats: true },
        data: { screen: 'today' },
      });
    }
  },

  scheduleEntryWindowWarnings: async (signal) => {
    if (!signal || !['BUY', 'SELL'].includes(signal.signal)) return;

    await notificationEngine.cancelEntryWindowWarnings();

    const now = new Date();
    const oneMinuteLeft = new Date(now.getTime() + 4 * 60 * 1000);
    const expiredAt = new Date(now.getTime() + 5 * 60 * 1000);

    const warningId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏱️ 1 Minute Left — Signal Expiring!',
        body: `EUR/USD ${signal.signal} signal expires in 1 minute. Open app now if you want to enter.`,
        data: { screen: 'signal', signalId: signal?.id || null },
      },
      trigger: oneMinuteLeft,
    });

    const expiredId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⌛ Signal Expired',
        body: `EUR/USD ${signal.signal} entry window passed. Scanner is still active for the next setup.`,
        data: { screen: 'today' },
      },
      trigger: expiredAt,
    });

    await AsyncStorage.multiSet([
      [ENTRY_WINDOW_WARNING_KEY, warningId],
      [ENTRY_WINDOW_EXPIRED_KEY, expiredId],
    ]);
  },

  scheduleSignalExpiryWarning: async (signal) => notificationEngine.scheduleEntryWindowWarnings(signal),
  cancelSignalExpiryWarning: async () => notificationEngine.cancelEntryWindowWarnings(),

  cancelEntryWindowWarnings: async () => {
    const [warningId, expiredId] = await AsyncStorage.multiGet([ENTRY_WINDOW_WARNING_KEY, ENTRY_WINDOW_EXPIRED_KEY]);
    const ids = [warningId?.[1], expiredId?.[1]].filter(Boolean);
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    await AsyncStorage.multiRemove([ENTRY_WINDOW_WARNING_KEY, ENTRY_WINDOW_EXPIRED_KEY]);
  },

  cancelAll: async () => Notifications.cancelAllScheduledNotificationsAsync(),
};
