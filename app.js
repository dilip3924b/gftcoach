import 'react-native-url-polyfill/auto';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Animated, StatusBar, TextInput, Alert, Vibration,
  KeyboardAvoidingView,
  Platform, Dimensions
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { supabase } from './lib/supabase';
import { dbHelpers, OFFLINE_QUEUE_KEY } from './lib/db';


const { width } = Dimensions.get('window');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const C = {
  bg: '#080D1A', card: '#0F1826', card2: '#162033',
  green: '#00FFB0', red: '#FF3B5C', yellow: '#FFD60A',
  blue: '#3B82F6', purple: '#A855F7', orange: '#F97316',
  text: '#F8FAFC', muted: '#475569', border: '#1E293B',
};

const GUIDE_STEPS = [
  {
    phase: 'PHASE 1', phaseLabel: '☀️ Morning Prep', phaseColor: C.yellow,
    steps: [
      {
        id: 'wake', title: '👋 Good Morning, Trader!', emoji: '☀️', color: C.yellow,
        simple: 'Before doing ANYTHING, let\'s check if today is safe to trade.',
        detailed: 'Just like you check the weather before going outside, we check the "trading weather" every morning. Some days are dangerous. Some are perfect. Let\'s find out!',
        action: 'Tap NEXT when you are ready!',
        actionType: 'next',
      },
      {
        id: 'check_calendar', title: '📅 Step 1: Check the News Calendar', emoji: '📅', color: C.blue,
        simple: 'Open investing.com/economic-calendar in your browser RIGHT NOW.',
        detailed: 'Think of this like checking if there\'s a storm coming. The calendar shows when big news drops that can make prices go CRAZY. We need to know this BEFORE we trade.',
        action: 'Open: investing.com/economic-calendar',
        actionType: 'external',
        link: 'https://investing.com/economic-calendar',
        tip: '💡 Look for RED 🔴 events today. Those are the dangerous ones that move the market 50-100 pips in seconds.',
      },
      {
        id: 'read_calendar', title: '🔍 Step 2: Spot the Danger Events', emoji: '🔍', color: C.red,
        simple: 'Find any RED 🔴 events today and note their times. These are your NO-TRADE zones.',
        detailed: 'Red events = market earthquakes. 30 minutes BEFORE and 30 minutes AFTER a red event, prices jump randomly. Even the best traders lose money then. Solution? Simply don\'t trade during those windows.',
        action: 'Type what red events you see today:',
        actionType: 'input',
        inputPlaceholder: 'e.g. "NFP at 7:00 PM IST" or "No red events today ✅"',
        inputKey: 'red_events',
        tip: '✅ No red events = full green light day!\n⚠️ Red events = mark those times in your phone calendar and avoid them.',
      },
      {
        id: 'check_time', title: '⏰ Step 3: Are You in a Good Time Window?', emoji: '⏰', color: C.green,
        simple: 'Check the time right now and see if you\'re in a good trading session.',
        detailed: 'Forex is a global market. Different countries open at different times. The BEST time for us in India is when both London AND New York are open simultaneously. That\'s called the overlap — the most liquid and predictable time to trade.',
        action: 'Find your current time below:',
        actionType: 'timecheck',
        color: C.green,
        timeZones: [
          { label: '😴 Dead Zone',         range: '11 PM – 1:30 PM IST', color: C.muted,   advice: 'Market is sleeping. Spreads are wide. Do NOT trade.' },
          { label: '🟡 London Opens',      range: '1:30 PM – 6:30 PM IST', color: C.yellow, advice: 'OK to trade but not ideal. Spread improving.' },
          { label: '🔥 BEST TIME TO TRADE',range: '6:30 PM – 10:30 PM IST', color: C.green, advice: 'PERFECT! London + New York both open. Most volume!' },
          { label: '🟡 NY Closing',        range: '10:30 PM – 11 PM IST', color: C.orange, advice: 'Activity dropping. Close trades. Don\'t open new ones.' },
        ],
      },
    ],
  },
  {
    phase: 'PHASE 2', phaseLabel: '📊 Chart Analysis', phaseColor: C.blue,
    steps: [
      {
        id: 'open_tv', title: '📊 Step 4: Open TradingView', emoji: '📊', color: C.blue,
        simple: 'Open TradingView app or website. This is your MAP before you drive.',
        detailed: 'TradingView shows you WHERE prices have been and WHERE they might go. Before you trade, you MUST look at the chart. Skipping this is like driving blindfolded.',
        action: 'Open TradingView now:',
        actionType: 'external',
        link: 'https://tradingview.com',
        tip: '💡 Download the free TradingView app from Play Store if you haven\'t already!',
      },
      {
        id: 'search_pair', title: '🔎 Step 5: Search EUR/USD', emoji: '🔎', color: C.blue,
        simple: 'In TradingView, search for "EURUSD" — this is our pair to trade.',
        detailed: 'EUR/USD = 1 Euro in US Dollars. This is the MOST traded pair in the world. Over $1 TRILLION of this pair is traded every single day. Why does that matter? More traders = smoother, more predictable price movement. Perfect for beginners.',
        action: 'Search EURUSD in TradingView:',
        actionType: 'instruction',
        color: C.blue,
        steps_list: [
          '1️⃣  Tap the search icon (🔍) at the top of TradingView',
          '2️⃣  Type: EURUSD',
          '3️⃣  Tap the result that says "EUR/USD • FX • FOREXCOM"',
          '4️⃣  A candle chart will appear — you\'re in the right place!',
        ],
      },
      {
        id: 'set_timeframe', title: '⏱️ Step 6: Switch to H1 (1 Hour) Chart', emoji: '⏱️', color: C.purple,
        simple: 'Change the timeframe to "1H". Each candle = 1 hour of price movement.',
        detailed: 'Think of timeframes like camera zoom:\n\n• 1 minute chart = extreme zoom in, too noisy\n• 1 hour chart = perfect balance ✅\n• 1 day chart = too zoomed out, too slow\n\nH1 gives us clear signals without the crazy noise.',
        action: 'Set timeframe to 1H:',
        actionType: 'instruction',
        color: C.purple,
        steps_list: [
          '1️⃣  Look at the top of the chart for time buttons',
          '2️⃣  You\'ll see: 1m  5m  15m  1h  4h  1D',
          '3️⃣  Tap "1H" or "1h"',
          '4️⃣  Candles should now be bigger and clearer',
          '',
          '💡 Green candle = that hour, price went UP',
          '💡 Red candle = that hour, price went DOWN',
        ],
      },
      {
        id: 'identify_trend', title: '📈 Step 7: Which Way Is the Market Going?', emoji: '📈', color: C.green,
        simple: 'Look at the last 10-15 candles. Are they climbing UP or falling DOWN overall?',
        detailed: 'The trend is your BEST FRIEND. Always trade WITH the trend, never against it.\n\nImagine you\'re swimming in a river:\n🏊 With the current = easy (trading with trend)\n🏊 Against the current = exhausting and losing (trading against trend)\n\nSimple rule: Trend goes UP → only look for BUY. Trend goes DOWN → only look for SELL.',
        action: 'What direction are the last 10 candles going?',
        actionType: 'choice',
        choices: [
          { label: '📈 Mostly going UP (Uptrend)', value: 'up', color: C.green, advice: '→ You will ONLY look for BUY trades today!' },
          { label: '📉 Mostly going DOWN (Downtrend)', value: 'down', color: C.red, advice: '→ You will ONLY look for SELL trades today!' },
          { label: '↔️ Going sideways (No clear direction)', value: 'sideways', color: C.yellow, advice: '→ Skip today. Come back tomorrow when there\'s a clear trend.' },
        ],
        inputKey: 'trend',
        color: C.green,
      },
      {
        id: 'draw_levels', title: '📏 Step 8: Draw Your Support & Resistance Lines', emoji: '📏', color: C.orange,
        simple: 'Draw a line at the highest point AND lowest point visible on the chart.',
        detailed: 'These invisible walls are called:\n\n🔴 RESISTANCE = ceiling. Price keeps bouncing DOWN from here.\n🟢 SUPPORT = floor. Price keeps bouncing UP from here.\n\nWhen price touches these walls = that\'s your signal to trade! Price near support → BUY. Price near resistance → SELL.',
        action: 'Draw your 2 lines in TradingView:',
        actionType: 'instruction',
        color: C.orange,
        steps_list: [
          '1️⃣  Tap the drawing tool icon (✏️ pencil) on the left side',
          '2️⃣  Select "Horizontal Line"',
          '3️⃣  Tap on the HIGHEST point (peak) you can see → RESISTANCE line',
          '4️⃣  Draw another line at the LOWEST dip → SUPPORT line',
          '5️⃣  Now you have your trading zones! 🎯',
          '',
          '🎯 Price near SUPPORT line → look to BUY',
          '🎯 Price near RESISTANCE line → look to SELL',
        ],
        tip: '💡 The more times price has bounced off a level before, the stronger that level is!',
      },
      {
        id: 'wait_signal', title: '🎯 Step 9: Wait for the Perfect Signal', emoji: '🎯', color: C.yellow,
        simple: 'Don\'t touch anything yet. WATCH and wait for price to reach your line AND a clear candle to form.',
        detailed: 'This is the hardest step. Waiting.\n\nMost beginners lose because they get bored and trade random setups. A professional is like a SNIPER — they wait for the perfect shot. They might wait hours. But when the setup appears, they strike fast.\n\nYou are the sniper. Wait for all 5 boxes below to be true.',
        action: 'Tick ALL 5 boxes — only trade if all are checked:',
        actionType: 'checklist',
        checklist: [
          '✅ Price has reached my support OR resistance line',
          '✅ A big clear candle just closed at that level',
          '✅ Candle direction matches my trend (UP trend = green candle at support)',
          '✅ No red news event in the NEXT 30 minutes',
          '✅ It is currently between 6:30 PM – 10:30 PM IST',
        ],
        inputKey: 'signal_ready',
        color: C.yellow,
        tip: '⚠️ If you CANNOT tick all 5 → NO TRADE today. Protecting your account is more important than any single trade!',
      },
    ],
  },
  {
    phase: 'PHASE 3', phaseLabel: '💹 Open MT5', phaseColor: C.green,
    steps: [
      {
        id: 'open_mt5', title: '💹 Step 10: Open MetaTrader 5', emoji: '💹', color: C.green,
        simple: 'Now open the MT5 app. This is where you actually place the real trade.',
        detailed: 'TradingView = your brain (analysis)\nMT5 = your hands (execution)\n\nYou analyzed on TradingView. Now you act on MT5. Think of TradingView as Google Maps showing you the route, and MT5 as the actual car you drive.',
        action: 'Open MT5 and log in:',
        actionType: 'instruction',
        color: C.green,
        steps_list: [
          '1️⃣  Find the MetaTrader 5 app on your phone',
          '2️⃣  Log in with the credentials GFT emailed you',
          '3️⃣  Check that you see your $1,000 balance at the top',
          '4️⃣  If balance shows → you\'re connected! ✅',
          '',
          '❓ Can\'t find login details? Check the email you used to buy the GFT $1 model.',
        ],
        tip: '🔐 Your MT5 login is different from your GFT website login. GFT sends separate MT5 credentials to your email!',
      },
      {
        id: 'find_pair', title: '🔍 Step 11: Find EUR/USD in MT5', emoji: '🔍', color: C.blue,
        simple: 'Locate EUR/USD in MT5 and check the current price.',
        detailed: 'MT5 has hundreds of pairs. We need EUR/USD specifically. The price in MT5 might look slightly different from TradingView — that\'s normal and called the "spread". It\'s tiny and fine.',
        action: 'Find EUR/USD in MT5:',
        actionType: 'instruction',
        color: C.blue,
        steps_list: [
          '1️⃣  Tap "Quotes" tab at the bottom of MT5',
          '2️⃣  Look for EUR/USD in the list',
          '3️⃣  If not visible, tap the ➕ icon to search and add it',
          '4️⃣  You\'ll see TWO prices next to EUR/USD:',
          '      • BID price (lower) = the SELL price',
          '      • ASK price (higher) = the BUY price',
          '5️⃣  The tiny difference between them = the spread (your entry cost)',
        ],
        tip: '💡 During the 6:30 PM – 10:30 PM IST window, EUR/USD spread should be just 1-3 pips. Outside this window it gets wider and costlier!',
      },
      {
        id: 'check_spread', title: '💰 Step 12: Is the Spread Acceptable?', emoji: '💰', color: C.orange,
        simple: 'Look at the difference between the two EUR/USD prices shown in MT5.',
        detailed: 'The spread is like the entry fee to get into the trade. On 0.01 lots:\n• 1 pip spread = $0.10 cost\n• 3 pip spread = $0.30 cost\n• 10 pip spread = $1.00 cost\n\nDuring peak hours the spread is tiny. Outside peak hours it can be 5x higher. This eats into your profit before you even start!',
        action: 'How does the spread look right now?',
        actionType: 'choice',
        choices: [
          { label: '✅ 1-3 pips (tiny spread)', value: 'good', color: C.green, advice: '→ Perfect timing! Proceed to place the trade.' },
          { label: '⚠️ 4-7 pips (medium spread)', value: 'ok', color: C.yellow, advice: '→ Acceptable. Proceed with caution.' },
          { label: '❌ 8+ pips (huge spread!)', value: 'bad', color: C.red, advice: '→ WAIT. Market conditions are bad. Come back during 6:30-10:30 PM IST.' },
        ],
        inputKey: 'spread_check',
        color: C.orange,
      },
    ],
  },
  {
    phase: 'PHASE 4', phaseLabel: '🎯 Place The Trade', phaseColor: C.orange,
    steps: [
      {
        id: 'new_order', title: '🆕 Step 13: Open New Order Ticket', emoji: '🆕', color: C.orange,
        simple: 'In MT5, tap "New Order". A trade form will appear. DO NOT click BUY or SELL yet!',
        detailed: 'The order ticket is a form you fill in before committing to a trade. It\'s like filling in a form before a medical procedure — you confirm all details BEFORE anything happens. Never rush this step.',
        action: 'Open New Order in MT5:',
        actionType: 'instruction',
        color: C.orange,
        steps_list: [
          '1️⃣  On the EUR/USD chart in MT5, tap "Trade" button',
          '      OR press and hold EUR/USD → select "New Order"',
          '2️⃣  A form/ticket will pop up',
          '3️⃣  You\'ll see fields for: Symbol, Volume, Stop Loss, Take Profit',
          '4️⃣  DO NOT tap BUY or SELL yet — fill in all fields first!',
        ],
        tip: '🚨 Placing a trade without filling Stop Loss and Take Profit first is the #1 beginner mistake. Always fill the form completely BEFORE clicking!',
      },
      {
        id: 'set_volume', title: '📏 Step 14: Set Lot Size to 0.01 ONLY', emoji: '📏', color: C.green,
        simple: 'Find the "Volume" field and change it to: 0.01',
        detailed: '0.01 is called a micro lot — the smallest possible trade size.\n\nOn EUR/USD with 0.01 lots:\n→ 1 pip moves = $0.10 profit or loss\n→ 10 pips = $1.00\n→ 50 pips = $5.00\n\nThis keeps your maximum risk tiny while you\'re learning the game.',
        action: 'Set volume to exactly 0.01:',
        actionType: 'instruction',
        color: C.green,
        steps_list: [
          '1️⃣  Find the "Volume" or "Lots" field in the order ticket',
          '2️⃣  Clear whatever number is showing',
          '3️⃣  Type: 0.01',
          '4️⃣  Triple check: it should say 0.01 — NOT 0.1 or 1.0',
          '',
          '⚠️  0.1 lots = 10x the risk ($1 per pip)',
          '⚠️  1.0 lots = 100x the risk ($10 per pip)',
          '✅  0.01 lots = safe ($0.10 per pip)',
        ],
        tip: '🚨 If you accidentally use 0.1 or 1.0 lots, a 30 pip move against you = $30 or $300 loss. ALWAYS 0.01!',
      },
      {
        id: 'set_sl', title: '🛡️ Step 15: Set Your Stop Loss', emoji: '🛡️', color: C.red,
        simple: 'Find the "Stop Loss" field. Set it 20-25 pips AWAY from the current price.',
        detailed: 'Stop Loss = your emergency brake.\n\nIf price moves against you, MT5 automatically closes your trade at this level to prevent bigger losses. Trading WITHOUT a Stop Loss is like driving a car with no brakes — fine until something goes wrong, then catastrophic.',
        action: 'Calculate and enter your Stop Loss:',
        actionType: 'calculator',
        color: C.red,
        calc_info: 'Example: If EUR/USD is at 1.0850:\n\n📈 BUY trade → Stop Loss = 1.0850 - 0.0020 = 1.0830\n   (20 pips below your entry)\n\n📉 SELL trade → Stop Loss = 1.0850 + 0.0020 = 1.0870\n   (20 pips above your entry)',
        tip: '🧮 With 0.01 lots:\n• 20 pip SL = max $2.00 loss\n• 25 pip SL = max $2.50 loss\n\nAlways know your maximum loss BEFORE entering!',
      },
      {
        id: 'set_tp', title: '🎯 Step 16: Set Your Take Profit', emoji: '🎯', color: C.green,
        simple: 'Find the "Take Profit" field. Set it 40-50 pips AWAY — double your Stop Loss distance.',
        detailed: 'Take Profit = your victory flag.\n\nWhen price reaches this level, MT5 automatically closes your trade and locks in your profit. You don\'t need to watch! MT5 does it for you.\n\nAlways make your Take Profit at LEAST 2x your Stop Loss distance. This is called 1:2 risk/reward — you risk $2 to potentially make $4.',
        action: 'Set your Take Profit:',
        actionType: 'instruction',
        color: C.green,
        steps_list: [
          '1️⃣  Find the "Take Profit" field in the order ticket',
          '2️⃣  Rule: Take Profit = 2x the Stop Loss distance',
          '',
          '📏 If your SL is 20 pips → TP should be 40 pips',
          '📏 If your SL is 25 pips → TP should be 50 pips',
          '',
          '📈 BUY trade example (entry 1.0850, SL 1.0830):',
          '   Take Profit = 1.0850 + 0.0040 = 1.0890',
          '',
          '📉 SELL trade example (entry 1.0850, SL 1.0870):',
          '   Take Profit = 1.0850 - 0.0040 = 1.0810',
        ],
        tip: '💰 With 0.01 lots:\n• 40 pip TP = $4.00 potential profit\n• 50 pip TP = $5.00 potential profit\n\nRisk $2 → Make $4 = smart money management!',
      },
      {
        id: 'preflight', title: '✅ Step 17: The Pre-Flight Checklist', emoji: '✅', color: C.yellow,
        simple: 'STOP. Before clicking BUY or SELL, verify EVERY item below.',
        detailed: 'Pilots do a pre-flight check before EVERY flight, even if they\'ve flown 10,000 times. Because one missed step can be catastrophic.\n\nYou do this check before EVERY trade. It takes 30 seconds. It saves accounts.',
        action: 'Verify all 7 items in the order ticket:',
        actionType: 'checklist',
        checklist: [
          'Symbol/Pair shows: EUR/USD ✓',
          'Volume shows: 0.01 (not 0.1 or 1.0) ✓',
          'Stop Loss field is filled (not blank or zero) ✓',
          'Take Profit field is filled (not blank or zero) ✓',
          'TP distance is roughly 2x the SL distance ✓',
          'No red news event firing in the next 30 minutes ✓',
          'Current time is between 6:30 PM – 10:30 PM IST ✓',
        ],
        inputKey: 'preflight',
        color: C.yellow,
        tip: '⚠️ If even ONE item is wrong → fix it before proceeding. Never compromise the checklist!',
      },
      {
        id: 'click_trade', title: '🚀 Step 18: EXECUTE — Tap BUY or SELL!', emoji: '🚀', color: C.green,
        simple: 'Based on your trend analysis — tap BUY if uptrend, SELL if downtrend.',
        detailed: 'This is the moment of execution. But stay calm — this is NOT gambling. This is an informed, calculated decision based on:\n✅ Calendar check\n✅ Session timing\n✅ Trend analysis\n✅ Support/Resistance\n✅ Signal candle\n✅ Risk management\n\nYou\'ve done the work. Execute with confidence.',
        action: 'Based on your earlier trend choice:',
        actionType: 'tradeentry',
        color: C.green,
        steps_list: [
          '📈 Uptrend identified → Tap the BLUE "Buy by Market" button',
          '📉 Downtrend identified → Tap the RED "Sell by Market" button',
          '',
          'After tapping:',
          '✅ A confirmation screen will appear',
          '✅ Verify the details one last time',
          '✅ Tap "OK" or "Confirm"',
          '✅ Your trade is now LIVE and running! 🎉',
        ],
        tip: '🎊 You just placed a real funded trade! Stay calm. The SL and TP will handle the exit automatically.',
      },
    ],
  },
  {
    phase: 'PHASE 5', phaseLabel: '📵 After The Trade', phaseColor: C.purple,
    steps: [
      {
        id: 'close_mt5', title: '📵 Step 19: Close MT5. Walk Away.', emoji: '📵', color: C.purple,
        simple: 'Seriously. Close MT5 right now. Stop watching. Walk away.',
        detailed: 'Watching a live trade is poison for beginners.\n\nYour heart races. You see price dip slightly. You panic and close early for a tiny loss — just before it would have hit your Take Profit.\n\nThis is the most common reason beginners don\'t make money. They LET THEIR EMOTIONS MANAGE THE TRADE instead of letting their Stop Loss and Take Profit do their job.\n\nYour setup is complete. The system will do the rest.',
        action: 'Do these RIGHT NOW:',
        actionType: 'instruction',
        color: C.purple,
        steps_list: [
          '1️⃣  Press the home button on your phone',
          '2️⃣  Swipe MT5 away (close the app completely)',
          '3️⃣  Open TradingView',
          '4️⃣  Set alerts at your TP and SL levels',
          '5️⃣  Put your phone face-down',
          '6️⃣  Go do ANYTHING else — eat, study, watch TV',
          '',
          '⏰ Check MT5 again only when TradingView alerts you!',
        ],
        tip: '💆 The trade will do what it does. Your job is done. Watching it every minute doesn\'t change the outcome — it only causes bad decisions.',
      },
      {
        id: 'set_alerts', title: '🔔 Step 20: Set TradingView Alerts', emoji: '🔔', color: C.blue,
        simple: 'Set 2 price alerts in TradingView — one at your TP, one at your SL.',
        detailed: 'TradingView will buzz your phone the moment price hits your target levels. This is your automated watcher. You don\'t need to check constantly — TradingView will tell you when something important happens.',
        action: 'Set your 2 alerts in TradingView:',
        actionType: 'instruction',
        color: C.blue,
        steps_list: [
          '1️⃣  Open TradingView → EUR/USD H1 chart',
          '2️⃣  Long press on your TAKE PROFIT price level',
          '3️⃣  Select "Add Alert" → set to "Price crossing"',
          '4️⃣  Name it: "🎉 TP HIT - Go check MT5!"',
          '5️⃣  Tap Save',
          '6️⃣  Now long press on your STOP LOSS price level',
          '7️⃣  Add another alert → Name it: "❌ SL HIT - Stop trading today"',
          '8️⃣  Done! TradingView will notify you.',
        ],
        tip: '📳 Make sure TradingView notifications are turned ON in your phone settings → Apps → TradingView → Notifications → Allow',
      },
      {
        id: 'wait_result', title: '⏳ Step 21: Wait For the Outcome', emoji: '⏳', color: C.purple,
        simple: 'Now you wait. Your phone will buzz when the trade resolves.',
        detailed: 'While you wait, your ONLY job is to NOT open MT5.\n\nSeriously — that\'s the job. Don\'t look. The SL is protecting you. The TP will catch the win. Everything is automated.',
        action: 'Three possible outcomes:',
        actionType: 'outcomes',
        outcomes: [
          { label: '🎉 Take Profit alert fires!', desc: 'You made ~$4-5 profit! Open MT5 to confirm the trade closed. Then come to Phase 6 to log it.', color: C.green },
          { label: '😮 Stop Loss alert fires', desc: 'You lost ~$2. COMPLETELY NORMAL. Open MT5 to confirm. Log the loss in journal. DO NOT open another trade today.', color: C.red },
          { label: '😴 No alert yet', desc: 'Trade still running. Check MT5 once before bed to confirm it\'s still open. Then sleep. Let it run overnight if needed.', color: C.yellow },
        ],
        color: C.purple,
      },
    ],
  },
  {
    phase: 'PHASE 6', phaseLabel: '📓 Journal & Review', phaseColor: C.orange,
    steps: [
      {
        id: 'log_trade', title: '📓 Step 22: Log the Trade in This App', emoji: '📓', color: C.orange,
        simple: 'Go to the JOURNAL tab in this app and log your trade result right now.',
        detailed: 'Your journal is the MOST VALUABLE thing you\'ll build as a trader.\n\nAfter 20-30 trades, you\'ll start seeing patterns:\n→ "I always lose when I trade on Monday mornings"\n→ "My BUY setups win 70% of the time"\n→ "I always cut winners early when I\'m nervous"\n\nThis self-knowledge is worth more than any YouTube strategy. It\'s YOUR edge.',
        action: 'Go to the Journal tab and fill in:',
        actionType: 'journal_prompt',
        prompts: [
          'What pair did I trade? (EUR/USD)',
          'BUY or SELL?',
          'What was my reason for entering?',
          'Result: How much profit or loss?',
          'What did I feel? (nervous, calm, excited, scared)',
          'What would I do differently next time?',
        ],
        color: C.orange,
      },
      {
        id: 'daily_done', title: '🏆 Trading Day Complete!', emoji: '🏆', color: C.green,
        simple: 'You followed the complete process like a professional. That\'s the real win — regardless of profit or loss.',
        detailed: 'Here\'s the truth most people don\'t tell you:\n\nProfessional traders don\'t win every trade. They win maybe 50-60% of trades. But they win MORE on winning trades than they lose on losing ones.\n\nWith 1:2 risk/reward:\n• Win 5 trades at $4 each = $20\n• Lose 5 trades at $2 each = -$10\n• Net profit = +$10 even at 50% win rate!\n\nThe PROCESS is what makes money. Not luck. Not one big win. The repeatable, disciplined process you just completed.',
        action: 'Come back tomorrow and start from Phase 1!',
        actionType: 'complete',
        color: C.green,
        tip: '📊 Your $100 goal tracker:\n• $5/day × 20 trading days = $100\n• Your payout = $80\n• From just ₹84 invested!\n\nAfter this → Funding Pips $10K account → real income begins 🚀',
      },
    ],
  },
];

export default function App() {
  const [screen, setScreen]         = useState('home');
  const [guidePhase, setGuidePhase] = useState(0);
  const [guideStep, setGuideStep]   = useState(0);
  const [answers, setAnswers]       = useState({});
  const [totalProfit, setTotalProfit] = useState(0);
  const [trades, setTrades]         = useState([]);
  const [todayPL, setTodayPL]       = useState(0);
  const [tradeInput, setTradeInput] = useState('');
  const [tradePair, setTradePair]   = useState('EUR/USD');
  const [tradeDir, setTradeDir]     = useState('BUY');
  const [tradeNote, setTradeNote]   = useState('');
  const [checklist, setChecklist]   = useState({});
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [now, setNow] = useState(new Date());
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState('synced');
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const currentPhaseData = GUIDE_STEPS[guidePhase];
  const currentStep      = currentPhaseData?.steps[guideStep];
  const totalSteps       = GUIDE_STEPS.reduce((a, p) => a + p.steps.length, 0);
  const completedSteps   = GUIDE_STEPS.slice(0, guidePhase).reduce((a, p) => a + p.steps.length, 0) + guideStep;

  useEffect(() => { registerNotif(); scheduleAlarms(); pulseLoop(); }, []);
  useEffect(() => { if (screen === 'guide') animStep(); }, [guidePhase, guideStep, screen]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    const bootstrapAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.log('Session fetch failed:', error.message);
        if (!alive) return;

        const nextSession = data?.session || null;
        setSession(nextSession);
        setUser(nextSession?.user || null);

        if (nextSession?.user) {
          await loadUserData(nextSession.user.id);
          await syncOfflineQueue(nextSession.user.id);
        }
      } catch (error) {
        console.log('Auth bootstrap failed:', error?.message || error);
      } finally {
        if (alive) setIsLoadingAuth(false);
      }
    };

    bootstrapAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      const nextUser = nextSession?.user || null;
      setUser(nextUser);

      if (nextUser) {
        await loadUserData(nextUser.id);
        await syncOfflineQueue(nextUser.id);
      } else {
        await clearLocalState();
      }
    });

    return () => {
      alive = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkConnection = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
        if (!mounted) return;
        setIsOnline(connected);
        if (!connected) setSyncStatus('offline');
      } catch {
        if (!mounted) return;
        setIsOnline(false);
        setSyncStatus('offline');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isOnline || !user?.id) return;
    syncOfflineQueue(user.id);
  }, [isOnline, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const channel = supabase
      .channel(`trades-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` },
        async () => {
          const { data } = await dbHelpers.getTrades(user.id);
          const normalized = normalizeTrades(data || []);
          setTrades(normalized);
          calcToday(normalized);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const pulseLoop = () => Animated.sequence([
    Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, useNativeDriver: true }),
    Animated.timing(pulseAnim, { toValue: 1.00, duration: 900, useNativeDriver: true }),
  ]).start(() => pulseLoop());

  const animStep = () => {
    fadeAnim.setValue(0); slideAnim.setValue(40);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  };

  const normalizeTrades = (tradeList) => (tradeList || [])
    .map((t) => ({
      ...t,
      id: String(t.id),
      profit: Number(t.profit),
      note: t.note || '',
      date: t.date || t.traded_at || t.created_at || new Date().toISOString(),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const calcToday = (tl) => {
    const today = new Date().toDateString();
    const pl = tl.filter(t => new Date(t.date).toDateString() === today).reduce((s, t) => s + Number(t.profit), 0);
    setTodayPL(parseFloat(pl.toFixed(2)));
  };

  const persistLocalSnapshot = async ({ tradesList, total, phase, step, nextAnswers }) => {
    try {
      await Promise.all([
        AsyncStorage.setItem('profit', String(total ?? 0)),
        AsyncStorage.setItem('trades', JSON.stringify(tradesList || [])),
        AsyncStorage.setItem('guide', JSON.stringify({ p: phase ?? 0, s: step ?? 0 })),
        AsyncStorage.setItem('answers', JSON.stringify(nextAnswers || {})),
      ]);
    } catch (e) {
      console.log('Local snapshot failed:', e?.message || e);
    }
  };

  const clearLocalState = async () => {
    setScreen('home');
    setGuidePhase(0);
    setGuideStep(0);
    setAnswers({});
    setTotalProfit(0);
    setTrades([]);
    setTodayPL(0);
    setTradeInput('');
    setTradePair('EUR/USD');
    setTradeDir('BUY');
    setTradeNote('');
    setChecklist({});
    setSelectedChoice(null);
    setInputValue('');
    setSyncStatus(isOnline ? 'synced' : 'offline');
    await AsyncStorage.multiRemove(['profit', 'trades', 'answers', 'guide', OFFLINE_QUEUE_KEY]);
  };

  const loadUserData = async (userId) => {
    try {
      const [profileRes, tradesRes, guideRes] = await Promise.all([
        dbHelpers.getProfile(userId),
        dbHelpers.getTrades(userId),
        dbHelpers.getGuideProgress(userId),
      ]);

      if (profileRes.data) setTotalProfit(Number(profileRes.data.total_profit || 0));
      const normalizedTrades = normalizeTrades(tradesRes.data || []);
      setTrades(normalizedTrades);
      calcToday(normalizedTrades);

      if (guideRes.data) {
        setGuidePhase(Number(guideRes.data.phase_index || 0));
        setGuideStep(Number(guideRes.data.step_index || 0));
        setAnswers(guideRes.data.answers || {});
      } else {
        setGuidePhase(0);
        setGuideStep(0);
        setAnswers({});
      }

      await persistLocalSnapshot({
        tradesList: normalizedTrades,
        total: Number(profileRes.data?.total_profit || 0),
        phase: Number(guideRes.data?.phase_index || 0),
        step: Number(guideRes.data?.step_index || 0),
        nextAnswers: guideRes.data?.answers || {},
      });
      setSyncStatus(isOnline ? 'synced' : 'offline');
    } catch (error) {
      console.log('User data load failed:', error?.message || error);
      await loadLocalFallback();
    }
  };

  const loadLocalFallback = async () => {
    try {
      const [p, t, a, g] = await Promise.all([
        AsyncStorage.getItem('profit'),
        AsyncStorage.getItem('trades'),
        AsyncStorage.getItem('answers'),
        AsyncStorage.getItem('guide'),
      ]);

      if (p) setTotalProfit(parseFloat(p));
      if (t) {
        const parsed = normalizeTrades(JSON.parse(t));
        setTrades(parsed);
        calcToday(parsed);
      }
      if (a) setAnswers(JSON.parse(a));
      if (g) {
        const gp = JSON.parse(g);
        setGuidePhase(gp.p || 0);
        setGuideStep(gp.s || 0);
      }
      setSyncStatus(isOnline ? 'syncing' : 'offline');
    } catch (error) {
      console.log('Local fallback failed:', error?.message || error);
    }
  };

  const syncOfflineQueue = async (userId) => {
    if (!userId || !isOnline) {
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('syncing');
    const { data, error } = await dbHelpers.processOfflineQueue(userId);
    if (error || data?.pending) {
      setSyncStatus('syncing');
      return;
    }

    setSyncStatus('synced');
    const [tradesRes, profileRes] = await Promise.all([
      dbHelpers.getTrades(userId),
      dbHelpers.getProfile(userId),
    ]);

    const normalized = normalizeTrades(tradesRes.data || []);
    setTrades(normalized);
    calcToday(normalized);
    if (profileRes.data) setTotalProfit(Number(profileRes.data.total_profit || 0));
  };

  const saveAll = async (phase, step, newAnswers) => {
    const answersToSave = newAnswers || answers;
    setGuidePhase(phase);
    setGuideStep(step);
    setAnswers(answersToSave);
    await persistLocalSnapshot({
      tradesList: trades,
      total: totalProfit,
      phase,
      step,
      nextAnswers: answersToSave,
    });

    if (!user?.id) return;

    if (!isOnline) {
      setSyncStatus('offline');
      await dbHelpers.addToOfflineQueue({
        action: 'UPDATE_GUIDE',
        data: { phase, step, answers: answersToSave },
      });
      return;
    }

    const { error } = await dbHelpers.updateGuideProgress(user.id, phase, step, answersToSave);
    if (error) {
      setSyncStatus('syncing');
      await dbHelpers.addToOfflineQueue({
        action: 'UPDATE_GUIDE',
        data: { phase, step, answers: answersToSave },
      });
    } else {
      setSyncStatus('synced');
    }
  };

  const registerNotif = async () => {
    if (!Device.isDevice) {
      console.log('Notifications require a physical device.');
      return;
    }
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('gft', {
          name: 'GFT Trading Coach', importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 200, 500], sound: true,
        });
      }
    } catch (error) {
      console.log('Notification setup failed:', error);
    }
  };

  const scheduleAlarms = async () => {
    if (!Device.isDevice) {
      console.log('Skipping alarm scheduling on non-physical device.');
      return;
    }
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      const alarms = [
        { h: 13, m: 30, title: '🟡 London Opens', body: 'London session is open. Check charts and market conditions before trading.' },
        { h: 18, m: 30, title: '🔥 Best Time To Trade', body: 'London + New York overlap is live. This is the best EUR/USD window.' },
        { h: 22, m: 30, title: '🟠 NY Overlap Ending', body: 'Session quality is dropping. Manage open trades and avoid new entries.' },
        { h: 23, m: 0, title: '📓 Journal Reminder', body: 'Trading day complete. Log your trade(s) in the Journal tab.' },
      ];
      for (const a of alarms) {
        await Notifications.scheduleNotificationAsync({
          content: { title: a.title, body: a.body, sound: true, channelId: 'gft' },
          trigger: { type: 'daily', hour: a.h, minute: a.m, channelId: 'gft' },
        });
      }
    } catch (error) {
      console.log('Error scheduling notifications:', error);
    }
  };

  const sendNotif = async (title, body) => {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, channelId: 'gft' }, trigger: null,
    });
  };

  const nextStep = () => {
    let newAnswers = { ...answers };
    if (currentStep?.inputKey && inputValue) newAnswers[currentStep.inputKey] = inputValue;
    if (currentStep?.inputKey && selectedChoice) newAnswers[currentStep.inputKey] = selectedChoice;
    setAnswers(newAnswers);
    setInputValue(''); setSelectedChoice(null); setChecklist({});

    if (guideStep < currentPhaseData.steps.length - 1) {
      const ns = guideStep + 1; setGuideStep(ns); saveAll(guidePhase, ns, newAnswers);
    } else if (guidePhase < GUIDE_STEPS.length - 1) {
      const np = guidePhase + 1; setGuidePhase(np); setGuideStep(0); saveAll(np, 0, newAnswers);
    } else {
      Alert.alert('🏆 All Steps Done!', 'Come back tomorrow and start from Phase 1 again!\n\nConsistency is the secret weapon. 💪');
      setGuidePhase(0); setGuideStep(0); saveAll(0, 0, newAnswers);
    }
  };

  const prevStep = () => {
    setInputValue(''); setSelectedChoice(null); setChecklist({});
    if (guideStep > 0) { const ns = guideStep - 1; setGuideStep(ns); saveAll(guidePhase, ns, null); }
    else if (guidePhase > 0) { const np = guidePhase - 1; const ns = GUIDE_STEPS[np].steps.length - 1; setGuidePhase(np); setGuideStep(ns); saveAll(np, ns, null); }
  };

  const computeDailyStats = (tradeList) => {
    const today = new Date().toDateString();
    const todayTrades = tradeList.filter((t) => new Date(t.date).toDateString() === today);
    const wins = todayTrades.filter((t) => Number(t.profit) > 0).length;
    const losses = todayTrades.filter((t) => Number(t.profit) < 0).length;
    const total = todayTrades.reduce((sum, t) => sum + Number(t.profit), 0);
    return {
      stat_date: new Date().toISOString().slice(0, 10),
      total_pl: Number(total.toFixed(2)),
      trades_count: todayTrades.length,
      wins,
      losses,
    };
  };

  const upsertStatsWithFallback = async (stats) => {
    if (!user?.id) return;

    if (!isOnline) {
      await dbHelpers.addToOfflineQueue({ action: 'UPSERT_DAILY_STATS', data: stats });
      return;
    }

    const { error } = await dbHelpers.upsertDailyStats(user.id, stats);
    if (error) {
      await dbHelpers.addToOfflineQueue({ action: 'UPSERT_DAILY_STATS', data: stats });
      setSyncStatus('syncing');
    }
  };

  const addTrade = async () => {
    const p = parseFloat(tradeInput);
    if (isNaN(p)) { Alert.alert('⚠️', 'Enter a valid number (e.g. 5.20 or -2.50)'); return; }
    if (todayPL + p < -30) {
      Vibration.vibrate([500, 200, 500, 200, 500]);
      Alert.alert('🚨 DAILY LIMIT HIT!', 'You\'ve reached the $30 daily loss limit.\n\nRule: NO MORE TRADES today.\n\nCome back tomorrow fresh and with a clear head.'); return;
    }

    const trade = { id: Date.now().toString(), pair: tradePair, direction: tradeDir, profit: p, note: tradeNote, date: new Date().toISOString() };
    const nt = normalizeTrades([trade, ...trades]);
    const np = parseFloat((totalProfit + p).toFixed(2));
    setTrades(nt); setTotalProfit(np); calcToday(nt);
    setTradeInput(''); setTradeNote('');
    await persistLocalSnapshot({
      tradesList: nt,
      total: np,
      phase: guidePhase,
      step: guideStep,
      nextAnswers: answers,
    });

    const stats = computeDailyStats(nt);

    if (!user?.id) {
      setSyncStatus('offline');
    } else if (!isOnline) {
      setSyncStatus('offline');
      await dbHelpers.addToOfflineQueue({ action: 'ADD_TRADE', data: trade });
      await dbHelpers.addToOfflineQueue({ action: 'UPDATE_PROFIT', data: { totalProfit: np } });
      await upsertStatsWithFallback(stats);
    } else {
      setSyncStatus('syncing');
      const [tradeRes, profileRes] = await Promise.all([
        dbHelpers.addTrade(user.id, trade),
        dbHelpers.updateTotalProfit(user.id, np),
      ]);
      await upsertStatsWithFallback(stats);

      if (tradeRes.error || profileRes.error) {
        await dbHelpers.addToOfflineQueue({ action: 'ADD_TRADE', data: trade });
        await dbHelpers.addToOfflineQueue({ action: 'UPDATE_PROFIT', data: { totalProfit: np } });
        setSyncStatus('syncing');
      } else {
        setSyncStatus('synced');
      }
    }

    if (np >= 100) {
      Vibration.vibrate([200, 100, 200, 100, 500, 100, 500]);
      await sendNotif('🎉 $100 GOAL REACHED!', `Request your ${(np * 0.8).toFixed(2)} payout on GFT dashboard NOW!`);
      Alert.alert('🏆 YOU DID IT!', `$100 GOAL ACHIEVED!\n\nYour payout: ${(np * 0.8).toFixed(2)} (~₹${Math.round(np * 0.8 * 83).toLocaleString()})\n\nGo to goatfundedtrader.com → Dashboard → Request Payout! 🎊`);
    } else if ([25, 50, 75].find(m => totalProfit < m && np >= m)) {
      await sendNotif(`💪 ${np} profit milestone!`, `${Math.round((np / 100) * 100)}% of your $100 goal done!`);
      Alert.alert('💪 Milestone!', `${np} profit!\n${Math.round((np / 100) * 100)}% to your $100 goal!\n${(100 - np).toFixed(2)} more needed.`);
    } else {
      Alert.alert(p > 0 ? '✅ Trade Logged!' : '📉 Loss Logged', `${p > 0 ? '+' : ''}${p}\nRunning total: ${np}\nTo $100 goal: ${Math.max(0, 100 - np).toFixed(2)} left`);
    }
  };

  const handleAuth = async () => {
    const email = authEmail.trim().toLowerCase();
    if (!email || !authPassword) {
      setAuthError('Please enter email and password.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: authPassword });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password: authPassword });
        if (error) throw error;
        Alert.alert('Account created', 'Your account is ready. You can start trading now.');
      }
    } catch (error) {
      setAuthError(error?.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    await clearLocalState();
  };

  const handleResetAll = async () => {
    setTotalProfit(0);
    setTrades([]);
    setTodayPL(0);
    setGuidePhase(0);
    setGuideStep(0);
    setAnswers({});
    await persistLocalSnapshot({ tradesList: [], total: 0, phase: 0, step: 0, nextAnswers: {} });

    if (!user?.id) return;

    if (!isOnline) {
      setSyncStatus('offline');
      await dbHelpers.addToOfflineQueue({ action: 'UPDATE_PROFIT', data: { totalProfit: 0 } });
      await dbHelpers.addToOfflineQueue({ action: 'UPDATE_GUIDE', data: { phase: 0, step: 0, answers: {} } });
      return;
    }

    setSyncStatus('syncing');
    await supabase.from('trades').delete().eq('user_id', user.id);
    await dbHelpers.updateTotalProfit(user.id, 0);
    await dbHelpers.updateGuideProgress(user.id, 0, 0, {});
    await dbHelpers.upsertDailyStats(user.id, {
      stat_date: new Date().toISOString().slice(0, 10),
      total_pl: 0,
      trades_count: 0,
      wins: 0,
      losses: 0,
    });
    setSyncStatus('synced');
  };
  const truncateEmail = (email = '') => {
    if (email.length <= 24) return email;
    return `${email.slice(0, 10)}...${email.slice(-11)}`;
  };

  const getSyncMeta = () => {
    if (!isOnline) return { label: '🔴 offline', color: C.red };
    if (syncStatus === 'syncing') return { label: '🟡 syncing', color: C.yellow };
    return { label: '🟢 synced', color: C.green };
  };

  const syncMeta = getSyncMeta();

  const progress  = Math.min((totalProfit / 100) * 100, 100);
  const barColor  = totalProfit >= 100 ? C.green : totalProfit >= 50 ? C.yellow : C.blue;
  const istDateTime = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);
  const istHM = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now).split(':');
  const istNowMinutes = (parseInt(istHM[0], 10) * 60) + parseInt(istHM[1], 10);
  const getSessionNow = () => {
    if (istNowMinutes >= (18 * 60 + 30) && istNowMinutes < (22 * 60 + 30)) {
      return { label: '🔥 BEST TIME TO TRADE', advice: 'London + NY overlap is active now.', color: C.green };
    }
    if (istNowMinutes >= (13 * 60 + 30) && istNowMinutes < (18 * 60 + 30)) {
      return { label: '🟡 London Session', advice: 'Tradable session; wait for clean setups.', color: C.yellow };
    }
    if (istNowMinutes >= (22 * 60 + 30) && istNowMinutes < (23 * 60)) {
      return { label: '🟠 NY Closing', advice: 'Close trades; avoid opening new positions.', color: C.orange };
    }
    return { label: '😴 Dead Zone', advice: 'Low-quality session; avoid trading.', color: C.muted };
  };
  const sessionNow = getSessionNow();
  const allChecked = currentStep?.actionType === 'checklist'
    ? currentStep.checklist?.every((_, i) => checklist[i]) : true;

  // ── HOME
  const HomeScreen = () => (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={s.header}>
        <Text style={s.headerTitle}>🐐 GFT Coach</Text>
        <Text style={s.headerSub}>Your step-by-step trading guide</Text>
      </View>
      <View style={s.userInfoBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.syncDot, { backgroundColor: syncMeta.color }]} />
          <Text style={s.userInfoTxt}>{truncateEmail(user?.email || '')}</Text>
        </View>
        <Text style={[s.userInfoSync, { color: syncMeta.color }]}>{syncMeta.label}</Text>
        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
          <Text style={s.logoutTxt}>Logout</Text>
        </TouchableOpacity>
      </View>
      <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: sessionNow.color }]}>
        <Text style={s.cardTitle}>🕒 Today & Time (IST)</Text>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{istDateTime}</Text>
        <Text style={{ color: sessionNow.color, fontSize: 14, fontWeight: '800', marginTop: 8 }}>{sessionNow.label}</Text>
        <Text style={[s.muted, { marginTop: 2 }]}>{sessionNow.advice}</Text>
      </View>
      <Animated.View style={[s.card, s.goalCard, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={s.goalLabel}>PROFIT TRACKER</Text>
        <Text style={[s.goalAmt, { color: barColor }]}>${totalProfit.toFixed(2)}</Text>
        <Text style={s.goalSub}>of $100.00 goal</Text>
        <View style={s.barBg}><View style={[s.barFill, { width: `${progress}%`, backgroundColor: barColor }]} /></View>
        <Text style={[s.pctTxt, { color: barColor }]}>{progress.toFixed(1)}% Complete · ${Math.max(0, 100 - totalProfit).toFixed(2)} remaining</Text>
        <View style={s.miniRow}>
          {[
            { label: 'Your Payout', val: `$${(Math.min(totalProfit, 100) * 0.8).toFixed(2)}`, color: C.green },
            { label: 'Today P&L', val: `${todayPL >= 0 ? '+' : ''}$${todayPL}`, color: todayPL >= 0 ? C.green : C.red },
            { label: 'Trades', val: String(trades.length), color: C.blue },
          ].map((m, i) => (
            <View key={i} style={s.miniBox}>
              <Text style={[s.miniVal, { color: m.color }]}>{m.val}</Text>
              <Text style={s.miniLbl}>{m.label}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <TouchableOpacity style={s.guideBtn} onPress={() => setScreen('guide')}>
        <Text style={{ fontSize: 30 }}>🗺️</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.guideBtnTitle}>Follow Today's Guide</Text>
          <Text style={s.guideBtnSub}>{currentPhaseData?.phaseLabel} · Step {completedSteps + 1} of {totalSteps}</Text>
          <View style={[s.miniBarBg, { marginTop: 6 }]}>
            <View style={[s.miniBarFill, { width: `${(completedSteps / totalSteps) * 100}%` }]} />
          </View>
        </View>
        <Text style={{ color: C.green, fontSize: 20, fontWeight: '900' }}>▶</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.cardTitle}>⏰ Best Times to Trade (IST)</Text>
        {[
          { t: '1:30 PM', l: 'London Opens', c: C.yellow },
          { t: '6:30 PM', l: '🔥 BEST TIME (London + NY overlap)', c: C.green },
          { t: '10:30 PM', l: 'NY Session Ends — close trades', c: C.orange },
          { t: '11:00 PM', l: '📓 Journal reminder', c: C.blue },
        ].map((row, i) => (
          <View key={i} style={s.sessionRow}>
            <Text style={{ color: row.c, fontWeight: '800', fontSize: 14, width: 70 }}>{row.t}</Text>
            <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{row.l}</Text>
          </View>
        ))}
      </View>

      <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: todayPL >= 5 ? C.green : todayPL < -15 ? C.red : C.yellow, marginBottom: 100 }]}>
        <Text style={s.cardTitle}>📊 Today's Status</Text>
        <Text style={{ color: todayPL >= 5 ? C.green : todayPL < 0 ? C.red : C.yellow, fontSize: 15, fontWeight: '700' }}>
          {todayPL >= 5 ? '✅ Daily target hit! Great job — rest now.' : todayPL < -20 ? '🚨 Warning: Near daily loss limit!' : todayPL < 0 ? `⚠️ Down $${Math.abs(todayPL)} today. Stay disciplined.` : todayPL === 0 ? '⏳ No trades today yet' : `📈 Up $${todayPL} today. Keep going!`}
        </Text>
        <Text style={[s.muted, { marginTop: 4 }]}>Daily target: +$5/day · Max loss limit: -$30</Text>
      </View>
    </ScrollView>
  );

  // ── GUIDE
  const GuideScreen = () => {
    if (!currentStep) return null;
    return (
      <View style={{ flex: 1 }}>
        <View style={[s.phaseBar, { backgroundColor: currentPhaseData.phaseColor + '18' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[s.phaseTag, { color: currentPhaseData.phaseColor }]}>{currentPhaseData.phase} · {currentPhaseData.phaseLabel}</Text>
            <Text style={s.stepCount}>{completedSteps + 1} / {totalSteps} steps</Text>
          </View>
          <View style={s.phaseBarBg}>
            <View style={[s.phaseBarFill, { width: `${(guideStep / currentPhaseData.steps.length) * 100}%`, backgroundColor: currentPhaseData.phaseColor }]} />
          </View>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], padding: 14 }}>
            {/* Step Card */}
            <View style={[s.stepCard, { borderTopWidth: 3, borderTopColor: currentStep.color }]}>
              <Text style={{ fontSize: 50, textAlign: 'center', marginBottom: 10 }}>{currentStep.emoji}</Text>
              <Text style={[s.stepTitle, { color: currentStep.color }]}>{currentStep.title}</Text>
              <Text style={s.stepSimple}>{currentStep.simple}</Text>
              <View style={s.divider} />
              <Text style={s.stepDetail}>{currentStep.detailed}</Text>
            </View>

            {/* Tip */}
            {currentStep.tip && (
              <View style={[s.tipBox, { borderColor: currentStep.color }]}>
                <Text style={[{ color: currentStep.color, fontSize: 13, fontWeight: '600', lineHeight: 20 }]}>{currentStep.tip}</Text>
              </View>
            )}

            {/* Steps List */}
            {currentStep.steps_list && (
              <View style={s.stepsBox}>
                {currentStep.steps_list.map((item, i) => (
                  <Text key={i} style={[s.stepItem, item === '' && { height: 6 }]}>{item}</Text>
                ))}
              </View>
            )}

            {/* External Link */}
            {currentStep.actionType === 'external' && (
              <View style={[s.linkBox, { borderColor: currentStep.color, backgroundColor: currentStep.color + '12' }]}>
                <Text style={[{ color: currentStep.color, fontWeight: '700', fontSize: 13, marginBottom: 6 }]}>🌐 Open in your browser:</Text>
                <Text style={[{ color: currentStep.color, fontSize: 17, fontWeight: '900' }]}>{currentStep.link}</Text>
                <Text style={s.muted}>Long press to copy the link</Text>
              </View>
            )}

            {/* Input */}
            {currentStep.actionType === 'input' && (
              <View style={s.inputWrap}>
                <Text style={[{ color: currentStep.color, fontWeight: '700', fontSize: 13, marginBottom: 8 }]}>{currentStep.action}</Text>
                <TextInput
                  style={s.textInput}
                  value={inputValue || answers[currentStep.inputKey] || ''}
                  onChangeText={setInputValue}
                  placeholder={currentStep.inputPlaceholder}
                  placeholderTextColor={C.muted}
                  multiline
                />
              </View>
            )}

            {/* Time Check */}
            {currentStep.actionType === 'timecheck' && (
              <View style={s.card}>
                <Text style={[s.cardTitle, { color: currentStep.color }]}>Find your current time:</Text>
                {currentStep.timeZones.map((tz, i) => (
                  <View key={i} style={[s.tzRow, { borderLeftColor: tz.color }]}>
                    <Text style={[{ color: tz.color, fontWeight: '700', fontSize: 13 }]}>{tz.label}</Text>
                    <Text style={[{ color: C.text, fontSize: 12, marginTop: 2 }]}>{tz.range}</Text>
                    <Text style={[{ color: C.muted, fontSize: 12, marginTop: 2 }]}>{tz.advice}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Choice */}
            {currentStep.actionType === 'choice' && (
              <View style={s.card}>
                <Text style={[s.cardTitle, { color: currentStep.color }]}>{currentStep.action}</Text>
                {currentStep.choices.map((ch, i) => {
                  const chosen = selectedChoice === ch.value || answers[currentStep.inputKey] === ch.value;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[s.choiceBtn, chosen && { backgroundColor: ch.color + '25', borderColor: ch.color }]}
                      onPress={() => { setSelectedChoice(ch.value); const na = { ...answers, [currentStep.inputKey]: ch.value }; setAnswers(na); saveAll(guidePhase, guideStep, na); }}
                    >
                      <Text style={[s.choiceTxt, { color: ch.color }]}>{ch.label}</Text>
                      {chosen && <Text style={[{ color: ch.color, fontSize: 12, marginTop: 6, fontWeight: '600' }]}>{ch.advice}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Checklist */}
            {currentStep.actionType === 'checklist' && (
              <View style={s.card}>
                <Text style={[s.cardTitle, { color: currentStep.color }]}>{currentStep.action}</Text>
                {currentStep.checklist.map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.checkRow, checklist[i] && { backgroundColor: C.green + '12' }]}
                    onPress={() => setChecklist(p => ({ ...p, [i]: !p[i] }))}
                  >
                    <Text style={{ fontSize: 22 }}>{checklist[i] ? '✅' : '⬜'}</Text>
                    <Text style={[{ fontSize: 14, flex: 1, lineHeight: 20 }, checklist[i] ? { color: C.green } : { color: C.text }]}>{item}</Text>
                  </TouchableOpacity>
                ))}
                {!allChecked && <Text style={{ color: C.red, fontSize: 12, marginTop: 10, fontWeight: '600' }}>⚠️ Tick ALL boxes before you can proceed!</Text>}
              </View>
            )}

            {/* Calculator */}
            {currentStep.actionType === 'calculator' && (
              <View>
                <View style={[s.card, { borderColor: C.red, borderWidth: 1, backgroundColor: C.red + '08' }]}>
                  <Text style={[s.cardTitle, { color: C.red }]}>🧮 Stop Loss Calculator</Text>
                  <Text style={[{ color: C.text, fontSize: 13, lineHeight: 22 }]}>{currentStep.calc_info}</Text>
                </View>
                <View style={s.card}>
                  <Text style={s.cardTitle}>Stop Loss Size → Max Loss (at 0.01 lots):</Text>
                  {[['20 pips', '$2.00', C.green], ['25 pips', '$2.50', C.yellow], ['30 pips', '$3.00', C.orange], ['50 pips', '$5.00', C.red]].map(([pip, loss, c], i) => (
                    <View key={i} style={[s.calcRow, { borderBottomColor: C.border }]}>
                      <Text style={[{ fontWeight: '700', fontSize: 14 }, { color: c }]}>{pip} SL</Text>
                      <Text style={[{ fontWeight: '800', fontSize: 14 }, { color: c }]}>Max Loss: {loss}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Outcomes */}
            {currentStep.actionType === 'outcomes' && (
              <View style={s.card}>
                <Text style={[s.cardTitle, { color: currentStep.color }]}>{currentStep.action || 'Possible outcomes:'}</Text>
                {currentStep.outcomes.map((o, i) => (
                  <View key={i} style={[s.outcomeRow, { borderLeftColor: o.color }]}>
                    <Text style={[{ fontWeight: '800', fontSize: 15 }, { color: o.color }]}>{o.label}</Text>
                    <Text style={[{ fontSize: 13, marginTop: 5, lineHeight: 19 }, { color: C.muted }]}>{o.desc}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Trade Entry */}
            {currentStep.actionType === 'tradeentry' && (
              <View style={s.card}>
                <Text style={[s.cardTitle, { color: currentStep.color }]}>Based on your analysis:</Text>
                {answers['trend'] === 'up' && (
                  <View style={[s.signalBox, { backgroundColor: C.green + '18', borderColor: C.green }]}>
                    <Text style={[{ fontSize: 22, fontWeight: '900' }, { color: C.green }]}>📈 YOUR ACTION: TAP BUY</Text>
                    <Text style={[{ fontSize: 13, marginTop: 8, lineHeight: 20 }, { color: C.text }]}>You identified an UPTREND earlier.\nIn MT5, tap the BLUE "Buy by Market" button.\nThen confirm the popup.</Text>
                  </View>
                )}
                {answers['trend'] === 'down' && (
                  <View style={[s.signalBox, { backgroundColor: C.red + '18', borderColor: C.red }]}>
                    <Text style={[{ fontSize: 22, fontWeight: '900' }, { color: C.red }]}>📉 YOUR ACTION: TAP SELL</Text>
                    <Text style={[{ fontSize: 13, marginTop: 8, lineHeight: 20 }, { color: C.text }]}>You identified a DOWNTREND earlier.\nIn MT5, tap the RED "Sell by Market" button.\nThen confirm the popup.</Text>
                  </View>
                )}
                {(!answers['trend'] || answers['trend'] === 'sideways') && (
                  <View style={[s.signalBox, { backgroundColor: C.yellow + '18', borderColor: C.yellow }]}>
                    <Text style={[{ fontSize: 20, fontWeight: '900' }, { color: C.yellow }]}>⚠️ NO TRADE TODAY</Text>
                    <Text style={[{ fontSize: 13, marginTop: 8, lineHeight: 20 }, { color: C.text }]}>You said the market is going sideways.\nSkip today. Protecting your account is the priority.\nCome back tomorrow for a cleaner setup.</Text>
                  </View>
                )}
              </View>
            )}

            {/* Journal Prompt */}
            {currentStep.actionType === 'journal_prompt' && (
              <View style={s.card}>
                <Text style={[s.cardTitle, { color: currentStep.color }]}>📝 Go to the Journal tab and answer these:</Text>
                {currentStep.prompts.map((p, i) => (
                  <View key={i} style={s.promptRow}>
                    <View style={s.promptNum}><Text style={{ color: C.text, fontWeight: '800', fontSize: 11 }}>{i + 1}</Text></View>
                    <Text style={[{ fontSize: 14, flex: 1, lineHeight: 20 }, { color: C.text }]}>{p}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Complete */}
            {currentStep.actionType === 'complete' && (
              <View style={[s.card, { alignItems: 'center', padding: 30 }]}>
                <Text style={{ fontSize: 64 }}>🏆</Text>
                <Text style={[s.cardTitle, { color: C.green, textAlign: 'center', fontSize: 20, marginTop: 12 }]}>Full Process Complete!</Text>
                <Text style={[s.muted, { textAlign: 'center', marginTop: 8, lineHeight: 20 }]}>You followed the complete professional trading process today.\n\nCome back tomorrow and start from Phase 1!\nConsistency over time = real money.</Text>
              </View>
            )}

            {/* NAV BUTTONS */}
            <View style={[s.navBtns, { marginBottom: 120 }]}>
              {(guidePhase > 0 || guideStep > 0) && (
                <TouchableOpacity style={s.prevBtn} onPress={prevStep}>
                  <Text style={{ color: C.muted, fontWeight: '700' }}>← Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.nextBtn, { backgroundColor: currentStep.color, opacity: allChecked ? 1 : 0.35 }]}
                onPress={allChecked ? nextStep : () => Alert.alert('⚠️', 'Please tick all checkboxes before proceeding!')}
              >
                <Text style={{ color: '#000', fontWeight: '900', fontSize: 16 }}>
                  {currentStep.actionType === 'complete' ? '🔄 Start Tomorrow\'s Guide' : 'Next Step →'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    );
  };

  // ── JOURNAL
  const JournalScreen = () => {
    const wins = trades.filter(t => t.profit > 0).length;
    const losses = trades.filter(t => t.profit < 0).length;
    const wr = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(0) : 0;
    return (
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={s.header}>
          <Text style={s.headerTitle}>📓 Trade Journal</Text>
          <Text style={s.headerSub}>Win Rate: {wr}% · {trades.length} trades logged</Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>➕ Log New Trade</Text>
          <View style={s.row}>
            {['BUY', 'SELL'].map(d => (
              <TouchableOpacity key={d} style={[s.dirBtn, tradeDir === d && { backgroundColor: d === 'BUY' ? C.green : C.red, borderColor: 'transparent' }]} onPress={() => setTradeDir(d)}>
                <Text style={[{ fontWeight: '800', fontSize: 15 }, tradeDir === d ? { color: '#000' } : { color: C.text }]}>{d === 'BUY' ? '📈 BUY' : '📉 SELL'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.row}>
            {['EUR/USD', 'AUD/USD', 'GBP/USD'].map(p => (
              <TouchableOpacity key={p} style={[s.pairBtn, tradePair === p && { borderColor: C.blue }]} onPress={() => setTradePair(p)}>
                <Text style={[{ fontSize: 12, fontWeight: '600' }, tradePair === p ? { color: C.blue } : { color: C.muted }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={[s.textInput, { marginTop: 8 }]} value={tradeInput} onChangeText={setTradeInput} keyboardType="numeric" placeholder="Profit/Loss: 5.20 or -2.50" placeholderTextColor={C.muted} />
          <TextInput style={[s.textInput, { marginTop: 8, height: 60 }]} value={tradeNote} onChangeText={setTradeNote} placeholder="Note (optional): Why did you trade? What happened?" placeholderTextColor={C.muted} multiline />
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: C.green, marginTop: 12 }]} onPress={addTrade}>
            <Text style={{ color: '#000', fontWeight: '900', fontSize: 15 }}>✅ LOG TRADE</Text>
          </TouchableOpacity>
        </View>
        {trades.length > 0 && (
          <View style={s.card}>
            <View style={s.row}>
              {[{ l: 'Wins', v: wins, c: C.green }, { l: 'Losses', v: losses, c: C.red }, { l: 'Win %', v: `${wr}%`, c: C.yellow }].map((m, i) => (
                <View key={i} style={s.miniBox}>
                  <Text style={[s.miniVal, { color: m.c }]}>{m.v}</Text>
                  <Text style={s.miniLbl}>{m.l}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {trades.length === 0 ? (
          <View style={[s.card, { alignItems: 'center', padding: 40 }]}>
            <Text style={{ fontSize: 48 }}>📭</Text>
            <Text style={[s.muted, { marginTop: 12, textAlign: 'center', lineHeight: 20 }]}>No trades yet!\nFollow the Guide, place a trade,\nthen come here to log it.</Text>
          </View>
        ) : (
          trades.map(t => (
            <View key={t.id} style={[s.card, { borderLeftWidth: 4, borderLeftColor: t.profit >= 0 ? C.green : C.red }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{t.direction === 'BUY' ? '📈' : '📉'} {t.pair}</Text>
                <Text style={[{ fontSize: 18, fontWeight: '900' }, { color: t.profit >= 0 ? C.green : C.red }]}>{t.profit >= 0 ? '+' : ''}${t.profit}</Text>
              </View>
              <Text style={[s.muted, { marginTop: 4 }]}>{new Date(t.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
              {t.note ? <Text style={[s.muted, { marginTop: 6, fontStyle: 'italic' }]}>💬 {t.note}</Text> : null}
            </View>
          ))
        )}
        {trades.length > 0 && (
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: C.red, marginHorizontal: 14, marginBottom: 100 }]}
            onPress={() => Alert.alert('Reset?', 'Delete all trades and profit data?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete All', style: 'destructive', onPress: handleResetAll }
            ])}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>🗑️ Reset All Data</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  // ── RULES
  const RulesScreen = () => (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={s.header}>
        <Text style={s.headerTitle}>📋 GFT $1 Rules</Text>
        <Text style={s.headerSub}>Know these by heart</Text>
      </View>
      {[
        { color: C.red, title: '🚨 Account Basics', items: ['$1,000 is GFT\'s money — you get the profits', 'Maximum you can ever withdraw: $100', 'Your payout (80% split): up to $80', 'Minimum withdrawal: $35', 'Account expires after 28 days — use it!'] },
        { color: C.orange, title: '⚠️ Loss Limits — Never Cross These', items: ['Daily loss limit: $30 max (3% of $1,000)', 'Open trade loss limit: $20 at one time', 'Hit -$30 in a day → STOP all trading immediately', 'Never move your Stop Loss further away once set'] },
        { color: C.blue, title: '📊 Trade Rules', items: ['Lot size: 0.01 — ALWAYS, NO EXCEPTIONS', 'Always set Stop Loss before clicking BUY/SELL', 'Max 1-2 trades per day as a beginner', 'No hedging allowed (instant account ban)', 'No bots or automated trading on $1 model'] },
        { color: C.green, title: '💸 To Withdraw Your Money', items: ['Minimum 3 profitable trading days required', 'Each "trading day" must have 0.5% profit ($5 min)', 'No single day can be 15%+ of total profit', 'Max $15 profit from one day can count', 'One $1 account per person only'] },
        { color: C.purple, title: '⏰ When to Trade', items: ['BEST: 6:30 PM – 10:30 PM IST (London + NY overlap)', 'OK: 1:30 PM – 6:30 PM IST (London only)', 'AVOID: 11 PM – 1:30 PM IST (market asleep)', 'NEVER: Friday after 6 PM IST (NFP day)', 'NEVER: 30 min before/after red news events'] },
        { color: C.yellow, title: '💡 The 5 Golden Rules', items: ['1. Never risk more than $5 on any single trade', '2. Always set Stop Loss — ALWAYS', '3. Close MT5 after placing trade — don\'t watch', '4. If you lose today, stop. Come back tomorrow.', '5. Journal EVERY trade, win or loss'] },
      ].map((sec, i) => (
        <View key={i} style={[s.card, { borderLeftWidth: 4, borderLeftColor: sec.color }]}>
          <Text style={[s.cardTitle, { color: sec.color }]}>{sec.title}</Text>
          {sec.items.map((item, j) => <Text key={j} style={[s.muted, { fontSize: 13, paddingVertical: 3, lineHeight: 20 }]}>→ {item}</Text>)}
        </View>
      ))}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const AuthScreen = () => (
    <KeyboardAvoidingView
      style={[s.container, { justifyContent: 'center', paddingHorizontal: 18 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={[s.card, { borderWidth: 1, borderColor: C.border }]}> 
        <Text style={[s.headerTitle, { fontSize: 30 }]}>🐐 GFT Coach</Text>
        <Text style={[s.headerSub, { marginTop: 6 }]}>Secure cloud sync for your trading progress</Text>

        <View style={s.authTabs}>
          <TouchableOpacity
            style={[s.authTabBtn, authMode === 'login' && s.authTabActive]}
            onPress={() => { setAuthMode('login'); setAuthError(''); }}
          >
            <Text style={[s.authTabText, authMode === 'login' && s.authTabTextActive]}>LOGIN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.authTabBtn, authMode === 'signup' && s.authTabActive]}
            onPress={() => { setAuthMode('signup'); setAuthError(''); }}
          >
            <Text style={[s.authTabText, authMode === 'signup' && s.authTabTextActive]}>SIGN UP</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[s.textInput, { marginTop: 14 }]}
          value={authEmail}
          onChangeText={setAuthEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={C.muted}
        />
        <TextInput
          style={[s.textInput, { marginTop: 10 }]}
          value={authPassword}
          onChangeText={setAuthPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={C.muted}
        />

        {authError ? <Text style={s.authError}>{authError}</Text> : null}

        <TouchableOpacity
          style={[s.nextBtn, { backgroundColor: C.green, marginTop: 14, opacity: authLoading ? 0.7 : 1 }]}
          onPress={handleAuth}
          disabled={authLoading}
        >
          <Text style={{ color: '#000', fontWeight: '900', fontSize: 15 }}>
            {authLoading ? 'Please wait...' : authMode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
  const tabs = [
    { key: 'home', icon: '🏠', label: 'Home' },
    { key: 'guide', icon: '🗺️', label: 'Guide' },
    { key: 'journal', icon: '📓', label: 'Journal' },
    { key: 'rules', icon: '📋', label: 'Rules' },
  ];

  if (isLoadingAuth) {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Loading your coach...</Text>
      </View>
    );
  }

  if (!session || !user) {
    return <AuthScreen />;
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {screen === 'home'    && <HomeScreen />}
      {screen === 'guide'   && <GuideScreen />}
      {screen === 'journal' && <JournalScreen />}
      {screen === 'rules'   && <RulesScreen />}
      <View style={s.bottomNav}>
        {tabs.map(tab => (
          <TouchableOpacity key={tab.key} style={[s.navItem, screen === tab.key && s.navActive]} onPress={() => setScreen(tab.key)}>
            <Text style={{ fontSize: 22 }}>{tab.icon}</Text>
            <Text style={[s.navLabel, screen === tab.key && { color: C.green }]}>{tab.label}</Text>
            {tab.key === 'guide' && (
              <View style={s.navBadge}><Text style={s.navBadgeTxt}>{completedSteps + 1}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </KeyboardAvoidingView>
  );
}


const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  scroll:       { flex: 1 },
  scrollContent:{ paddingBottom: 120 },
  header:       { padding: 20, paddingTop: 50 },
  headerTitle:  { fontSize: 26, fontWeight: '900', color: C.text },
  headerSub:    { fontSize: 13, color: C.muted, marginTop: 2 },
  userInfoBar:  { marginHorizontal: 12, marginBottom: 8, backgroundColor: C.card2, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncDot:      { width: 9, height: 9, borderRadius: 5 },
  userInfoTxt:  { color: C.text, fontSize: 12, fontWeight: '600', maxWidth: 140 },
  userInfoSync: { fontSize: 11, fontWeight: '700', textTransform: 'lowercase' },
  logoutBtn:    { marginLeft: 'auto', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  logoutTxt:    { color: C.muted, fontSize: 11, fontWeight: '700' },
  card:         { backgroundColor: C.card, borderRadius: 16, padding: 16, margin: 12, marginVertical: 6 },
  cardTitle:    { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 10 },
  goalCard:     { alignItems: 'center', padding: 24, backgroundColor: C.card, borderRadius: 16, margin: 12, marginVertical: 6 },
  goalLabel:    { fontSize: 11, letterSpacing: 3, color: C.muted },
  goalAmt:      { fontSize: 56, fontWeight: '900', marginTop: 4 },
  goalSub:      { fontSize: 13, color: C.muted, marginBottom: 16 },
  barBg:        { width: '100%', height: 10, backgroundColor: C.border, borderRadius: 5, overflow: 'hidden' },
  barFill:      { height: '100%', borderRadius: 5 },
  pctTxt:       { fontSize: 12, marginTop: 6, fontWeight: '700' },
  miniRow:      { flexDirection: 'row', marginTop: 14, gap: 8, width: '100%' },
  miniBox:      { flex: 1, alignItems: 'center', backgroundColor: C.card2, borderRadius: 10, padding: 10 },
  miniVal:      { fontSize: 16, fontWeight: '900', color: C.text },
  miniLbl:      { fontSize: 10, color: C.muted, marginTop: 2 },
  muted:        { fontSize: 12, color: C.muted },
  guideBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, margin: 12, padding: 18, borderWidth: 1, borderColor: C.green + '55', gap: 14 },
  guideBtnTitle:{ fontSize: 16, fontWeight: '800', color: C.text },
  guideBtnSub:  { fontSize: 12, color: C.muted, marginTop: 2 },
  miniBarBg:    { height: 3, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  miniBarFill:  { height: '100%', backgroundColor: C.green, borderRadius: 2 },
  sessionRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
  phaseBar:     { paddingHorizontal: 16, paddingVertical: 12, paddingTop: 48 },
  phaseTag:     { fontSize: 13, fontWeight: '700' },
  stepCount:    { fontSize: 12, color: C.muted },
  phaseBarBg:   { height: 3, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  phaseBarFill: { height: '100%', borderRadius: 2 },
  stepCard:     { backgroundColor: C.card, borderRadius: 16, padding: 20, marginBottom: 12 },
  stepTitle:    { fontSize: 19, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  stepSimple:   { fontSize: 16, color: C.text, textAlign: 'center', fontWeight: '600', lineHeight: 25 },
  divider:      { height: 1, backgroundColor: C.border, marginVertical: 14 },
  stepDetail:   { fontSize: 14, color: '#94A3B8', lineHeight: 22 },
  tipBox:       { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderStyle: 'dashed' },
  stepsBox:     { backgroundColor: C.card2, borderRadius: 12, padding: 14, marginBottom: 12 },
  stepItem:     { fontSize: 14, color: C.text, paddingVertical: 3, lineHeight: 22 },
  linkBox:      { borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  inputWrap:    { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12 },
  textInput:    { backgroundColor: C.card2, borderRadius: 10, padding: 12, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border },
  authTabs:     { flexDirection: 'row', backgroundColor: C.card2, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 16, padding: 4 },
  authTabBtn:   { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  authTabActive:{ backgroundColor: C.bg },
  authTabText:  { color: C.muted, fontSize: 12, fontWeight: '800' },
  authTabTextActive: { color: C.green },
  authError:    { color: C.red, marginTop: 10, fontSize: 12, fontWeight: '600' },
  tzRow:        { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 8, marginBottom: 8 },
  choiceBtn:    { backgroundColor: C.card2, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  choiceTxt:    { fontSize: 15, fontWeight: '700' },
  checkRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4, gap: 10 },
  calcRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1 },
  outcomeRow:   { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 10, marginBottom: 10 },
  signalBox:    { borderRadius: 14, padding: 18, borderWidth: 2, alignItems: 'center' },
  promptRow:    { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, alignItems: 'flex-start' },
  promptNum:    { width: 22, height: 22, backgroundColor: C.card2, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  navBtns:      { flexDirection: 'row', gap: 10, paddingVertical: 8, paddingHorizontal: 14 },
  prevBtn:      { flex: 1, backgroundColor: C.card2, borderRadius: 12, padding: 16, alignItems: 'center' },
  nextBtn:      { flex: 2, borderRadius: 12, padding: 16, alignItems: 'center' },
  row:          { flexDirection: 'row', gap: 8, marginTop: 4 },
  dirBtn:       { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: C.card2, borderWidth: 1, borderColor: C.border },
  pairBtn:      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card2 },
  bottomNav:    { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8 },
  navItem:      { flex: 1, alignItems: 'center', paddingVertical: 4, position: 'relative' },
  navActive:    { borderTopWidth: 2, borderTopColor: C.green },
  navLabel:     { fontSize: 10, color: C.muted, marginTop: 2 },
  navBadge:     { position: 'absolute', top: 0, right: 14, backgroundColor: C.green, borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  navBadgeTxt:  { fontSize: 9, color: '#000', fontWeight: '900' },
});











