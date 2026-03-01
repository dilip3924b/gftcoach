import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '../lib/constants';

export default function OnboardingScreen({ onDone }) {
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState({ availability: 'flex', mt5Installed: false, startDate: new Date().toISOString() });

  return (
    <View style={styles.container}>
      {step === 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>🐐 Welcome to GFT Coach</Text>
          <Text style={styles.txt}>We handle analysis. You follow exact instructions.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => setStep(1)}><Text style={styles.btnTxt}>Let's Start</Text></TouchableOpacity>
        </View>
      )}
      {step === 1 && (
        <View style={styles.card}>
          <Text style={styles.title}>When are you usually free?</Text>
          {['6-8 PM','7-9 PM','8-10 PM','Flexible'].map((v) => (
            <TouchableOpacity key={v} style={styles.opt} onPress={() => { setPrefs((p)=>({ ...p, availability:v })); setStep(2); }}><Text style={styles.txt}>{v}</Text></TouchableOpacity>
          ))}
        </View>
      )}
      {step === 2 && (
        <View style={styles.card}>
          <Text style={styles.title}>Is MT5 installed?</Text>
          <TouchableOpacity style={styles.opt} onPress={() => { setPrefs((p)=>({ ...p, mt5Installed:true })); setStep(3); }}><Text style={styles.txt}>✅ Yes</Text></TouchableOpacity>
          <TouchableOpacity style={styles.opt} onPress={() => { setPrefs((p)=>({ ...p, mt5Installed:false })); setStep(3); }}><Text style={styles.txt}>📥 Not yet</Text></TouchableOpacity>
        </View>
      )}
      {step === 3 && (
        <View style={styles.card}>
          <Text style={styles.title}>Setup Complete</Text>
          <Text style={styles.txt}>You will get daily plans, danger warnings, and exact trade instructions.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => onDone?.(prefs)}><Text style={styles.btnTxt}>Start Trading</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 14 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16 },
  title: { color: C.text, fontSize: 18, fontWeight: '900' },
  txt: { color: C.text, marginTop: 8, fontSize: 13 },
  btn: { marginTop: 14, backgroundColor: C.green, borderRadius: 10, padding: 12, alignItems: 'center' },
  btnTxt: { color: '#000', fontWeight: '900' },
  opt: { marginTop: 8, backgroundColor: C.card2, borderRadius: 10, padding: 12 },
});
