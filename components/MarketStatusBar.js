import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../lib/constants';
import { isCurrentlyDangerZone } from '../lib/api';
import { getNextMarketOpen, isMarketOpen } from '../engine/marketHours';

const alpha = (hex, opacityHex) => `${hex}${opacityHex}`;

export default function MarketStatusBar({ onPress }) {
  const insets = useSafeAreaInsets();
  const [danger, setDanger] = useState({ isDanger: false, event: null, minutesUntilSafe: 0 });
  const [market, setMarket] = useState(isMarketOpen());

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      const [nextDanger] = await Promise.all([
        isCurrentlyDangerZone().catch(() => ({ isDanger: false, event: null, minutesUntilSafe: 0 })),
      ]);
      if (!mounted) return;
      setDanger(nextDanger);
      setMarket(isMarketOpen());
    };

    tick();
    const interval = setInterval(tick, 60000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const model = useMemo(() => {
    if (danger.isDanger) {
      return {
        bg: alpha(C.orange, '24'),
        border: C.orange,
        text: C.orange,
        label: `⚠️ DANGER  ${danger.event || 'High-impact news'} · safe in ${danger.minutesUntilSafe}m`,
      };
    }

    if (market.isOpen) {
      const isBest = market.currentSession === 'overlap';
      return {
        bg: alpha(isBest ? C.green : C.yellow, isBest ? '20' : '1F'),
        border: isBest ? C.green : C.yellow,
        text: isBest ? C.green : C.yellow,
        label: `${isBest ? '🔥' : '🟡'} LIVE  ${market.sessionLabel} · ${market.minutesUntilChange}m left`,
      };
    }

    const nextOpen = getNextMarketOpen();
    return {
      bg: alpha(C.red, '1A'),
      border: C.red,
      text: C.red,
      label: `🔴 CLOSED  Opens ${nextOpen.opensAtIST} (${nextOpen.countdown})`,
    };
  }, [danger, market]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.wrap,
        { backgroundColor: model.bg, borderColor: model.border, marginTop: Math.max(insets.top + 6, 10) },
      ]}
    >
      <Text numberOfLines={1} style={[styles.txt, { color: model.text }]}>{model.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  txt: {
    fontSize: 12,
    fontWeight: '800',
  },
});
