import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '../lib/constants';

const url = 'https://www.tradingview.com/widgetembed/?symbol=FX%3AEURUSD&interval=60&theme=dark&style=1&timezone=Asia%2FCalcutta';

export default function ChartScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>📊 EUR/USD Chart</Text></View>
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
  title: { color: C.text, fontSize: 18, fontWeight: '900' },
  web: { flex: 1, backgroundColor: C.bg },
});
