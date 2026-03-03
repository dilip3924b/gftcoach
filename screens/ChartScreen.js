import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '../lib/constants';

const CHART_OPTIONS = [
  { label: 'EUR/USD', tv: 'FX:EURUSD' },
  { label: 'XAU/USD', tv: 'OANDA:XAUUSD' },
  { label: 'BTC/USD', tv: 'BINANCE:BTCUSDT' },
];

const buildTvUrl = (tvSymbol) => (
  `https://www.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tvSymbol)}&interval=60&theme=dark&style=1&timezone=Asia%2FCalcutta`
);

export default function ChartScreen() {
  const [selected, setSelected] = useState(CHART_OPTIONS[0]);
  const [open, setOpen] = useState(false);
  const url = useMemo(() => buildTvUrl(selected.tv), [selected.tv]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.row}>
          <Text style={styles.title}>📊 {selected.label} Chart</Text>
          <TouchableOpacity style={styles.dropdownBtn} onPress={() => setOpen((v) => !v)}>
            <Text style={styles.dropdownTxt}>{selected.label} ▾</Text>
          </TouchableOpacity>
        </View>
        {open && (
          <View style={styles.dropdownMenu}>
            {CHART_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.tv}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelected(opt);
                  setOpen(false);
                }}
              >
                <Text style={[styles.dropdownItemTxt, opt.tv === selected.tv && styles.dropdownItemTxtActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <WebView
        source={{ uri: url }}
        style={styles.web}
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={{ marginTop: 30 }} color={C.green} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: 48, paddingHorizontal: 14, paddingBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.text, fontSize: 18, fontWeight: '900' },
  dropdownBtn: {
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  dropdownTxt: { color: C.text, fontSize: 12, fontWeight: '700' },
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemTxt: { color: C.text, fontSize: 13, fontWeight: '600' },
  dropdownItemTxtActive: { color: C.green, fontWeight: '800' },
  web: { flex: 1, backgroundColor: C.bg },
});
