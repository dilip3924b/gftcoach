import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GROQ_API_KEY, GROQ_MODEL, C } from '../lib/constants';

const extractJson = (content) => {
  try { return JSON.parse(content); } catch { return null; }
};

export const verifyMT5Screenshot = async (imageBase64, expectedSignal) => {
  if (!GROQ_API_KEY) throw new Error('Missing GROQ key');
  const prompt = `Read this MT5 screenshot. Extract symbol, type, volume, stopLoss, takeProfit as JSON.`;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.2-11b-vision-preview',
      max_tokens: 220,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  const data = await response.json();
  const parsed = extractJson(data?.choices?.[0]?.message?.content || '{}') || {};
  const tolerance = 0.0005;
  const pass = {
    symbol: (String(parsed.symbol || '').replace('/', '').toUpperCase() === 'EURUSD'),
    type: String(parsed.type || '').toUpperCase().includes(expectedSignal.signal),
    volume: Number(parsed.volume) === 0.01,
    stopLoss: Math.abs(Number(parsed.stopLoss) - Number(expectedSignal.stopLoss?.price || 0)) < tolerance,
    takeProfit: Math.abs(Number(parsed.takeProfit) - Number(expectedSignal.takeProfit?.price || 0)) < tolerance,
  };
  return { ...pass, allPassed: Object.values(pass).every(Boolean), found: parsed };
};

export default function VerifyScreen({ expectedSignal }) {
  const [img, setImg] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8 });
    if (!r.canceled) setImg(r.assets[0]);
  };

  const verify = async () => {
    if (!img?.base64 || !expectedSignal) return;
    setLoading(true);
    const res = await verifyMT5Screenshot(img.base64, expectedSignal).catch((e) => ({ error: e.message }));
    setResult(res);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📸 Verify MT5 Setup</Text>
      <TouchableOpacity style={styles.btn} onPress={pick}><Text style={styles.btnTxt}>🖼️ Upload Screenshot</Text></TouchableOpacity>
      {img?.uri ? <Image source={{ uri: img.uri }} style={styles.img} /> : null}
      <TouchableOpacity style={[styles.btn, { backgroundColor: C.green }]} onPress={verify} disabled={loading}><Text style={[styles.btnTxt, { color: '#000' }]}>{loading ? 'Verifying...' : '🔍 Verify My Setup'}</Text></TouchableOpacity>
      {result ? (
        <View style={styles.card}>
          <Text style={styles.result}>{result.allPassed ? '✅ Setup looks correct' : '❌ Setup mismatch found'}</Text>
          {result.error ? <Text style={styles.line}>Error: {result.error}</Text> : null}
          {!result.error ? Object.entries(result).filter(([k]) => ['symbol','type','volume','stopLoss','takeProfit'].includes(k)).map(([k,v]) => (
            <Text key={k} style={styles.line}>{v ? '✅' : '❌'} {k}</Text>
          )) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 50, paddingHorizontal: 14 },
  title: { color: C.text, fontSize: 18, fontWeight: '900' },
  btn: { marginTop: 10, backgroundColor: C.card2, borderRadius: 10, padding: 12, alignItems: 'center' },
  btnTxt: { color: C.text, fontWeight: '800' },
  img: { width: '100%', height: 220, borderRadius: 12, marginTop: 12 },
  card: { marginTop: 12, backgroundColor: C.card, borderRadius: 12, padding: 12 },
  result: { color: C.text, fontWeight: '900', marginBottom: 6 },
  line: { color: C.text, fontSize: 13, marginTop: 2 },
});
