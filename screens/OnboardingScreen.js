import React, { useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { dbHelpers } from '../lib/db';

const { width } = Dimensions.get('window');
const C = {
  bg: '#080D1A',
  card: '#0F1826',
  green: '#00FFB0',
  text: '#FFFFFF',
  sub: '#94A3B8',
  border: '#1E293B',
};

const WINDOWS = [
  { label: '6:00 PM - 8:00 PM', start: '18:00', end: '20:00' },
  { label: '7:00 PM - 9:00 PM', start: '19:00', end: '21:00' },
  { label: '8:00 PM - 10:30 PM', start: '20:00', end: '22:30' },
  { label: "I'm flexible - any time", start: '13:30', end: '22:30' },
];

export default function OnboardingScreen({ userId, onDone }) {
  const [slide, setSlide] = useState(0);
  const [startDate, setStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [window, setWindow] = useState(null);
  const [mt5Done, setMt5Done] = useState(false);
  const [saving, setSaving] = useState(false);
  const flatRef = useRef(null);

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event?.type === 'set' && selectedDate) {
        setStartDate(selectedDate);
      }
      return;
    }

    if (selectedDate) {
      setStartDate(selectedDate);
    }
  };

  const goNext = () => {
    const next = Math.min(4, slide + 1);
    setSlide(next);
    flatRef.current?.scrollToIndex({ index: next, animated: true });
  };

  const finish = async () => {
    setSaving(true);
    const startDateOnly = startDate.toISOString().split('T')[0];
    try {
      if (userId) {
        const prefsRes = await dbHelpers.upsertUserPreferences(userId, {
          onboarding_done: true,
          availability_start: window?.start || '18:00',
          availability_end: window?.end || '22:30',
          mt5_installed: mt5Done,
        });
        if (prefsRes?.error) throw prefsRes.error;

        const profileRes = await dbHelpers.updateAccountStartDate(userId, startDateOnly);
        if (profileRes?.error) throw profileRes.error;
      }

      setSaving(false);
      onDone?.({
        onboarding_done: true,
        account_start_date: startDateOnly,
        availability_start: window?.start || '18:00',
        availability_end: window?.end || '22:30',
        mt5_installed: mt5Done,
      });
    } catch (_e) {
      setSaving(false);
      Alert.alert('Save failed', 'Could not save onboarding. Please try again.');
    }
  };

  const slides = [
    <View style={styles.slide} key="welcome">
      <Text style={styles.bigEmoji}>🐐</Text>
      <Text style={styles.h1}>Welcome to GFT Coach</Text>
      <Text style={styles.sub}>We do the hard work.{"\n"}You follow the instructions.</Text>
      <TouchableOpacity style={styles.btn} onPress={goNext}>
        <Text style={styles.btnText}>Let us Start -&gt;</Text>
      </TouchableOpacity>
    </View>,

    <View style={styles.slide} key="date">
      <Text style={styles.emoji}>📅</Text>
      <Text style={styles.h2}>When did you activate your GFT account?</Text>
      <Text style={styles.hint}>This sets your 28-day countdown.</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="spinner"
          maximumDate={new Date()}
          onChange={handleDateChange}
          style={{ width: '100%' }}
        />
      ) : (
        <>
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateButtonLabel}>Select Date</Text>
            <Text style={styles.dateValue}>
              {startDate.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display="default"
              maximumDate={new Date()}
              onChange={handleDateChange}
            />
          )}
        </>
      )}
      <TouchableOpacity style={styles.btn} onPress={goNext}>
        <Text style={styles.btnText}>Next -&gt;</Text>
      </TouchableOpacity>
    </View>,

    <View style={styles.slide} key="avail">
      <Text style={styles.emoji}>⏰</Text>
      <Text style={styles.h2}>When are you free in evenings?</Text>
      {WINDOWS.map((w) => (
        <TouchableOpacity
          key={w.label}
          style={[styles.option, window?.label === w.label && styles.optionSelected]}
          onPress={() => setWindow(w)}
        >
          <Text style={[styles.optionText, window?.label === w.label && { color: C.green }]}>
            {window?.label === w.label ? '✅ ' : ''}
            {w.label}
          </Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={[styles.btn, !window && styles.btnDisabled]} disabled={!window} onPress={goNext}>
        <Text style={styles.btnText}>Next -&gt;</Text>
      </TouchableOpacity>
    </View>,

    <View style={styles.slide} key="mt5">
      <Text style={styles.emoji}>📱</Text>
      <Text style={styles.h2}>Is MetaTrader 5 installed?</Text>
      {!mt5Done ? (
        <>
          <TouchableOpacity style={styles.btn} onPress={() => setMt5Done(true)}>
            <Text style={styles.btnText}>✅ Yes, ready</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginTop: 12 }]}
            onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=net.metaquotes.metatrader5')}
          >
            <Text style={[styles.btnText, { color: C.text }]}>📥 Open Play Store</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[styles.sub, { color: C.green, fontSize: 18, marginVertical: 16 }]}>✅ Great! MT5 is ready.</Text>
          <TouchableOpacity style={styles.btn} onPress={goNext}>
            <Text style={styles.btnText}>Next -&gt;</Text>
          </TouchableOpacity>
        </>
      )}
    </View>,

    <View style={styles.slide} key="done">
      <Text style={styles.bigEmoji}>✅</Text>
      <Text style={styles.h1}>You are ready!</Text>
      <View style={styles.bulletCard}>
        {[
          '📅 9 AM: your trading plan',
          '🎯 Setup found: instant alert',
          '📋 Exact MT5 numbers to copy',
          '🏆 $100 goal tracked automatically',
        ].map((line) => (
          <Text key={line} style={styles.bullet}>{line}</Text>
        ))}
      </View>
      <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} disabled={saving} onPress={finish}>
        <Text style={styles.btnText}>{saving ? 'Setting up...' : 'Start Trading 🚀'}</Text>
      </TouchableOpacity>
    </View>,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        ref={flatRef}
        data={slides}
        renderItem={({ item }) => item}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      />
      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === slide && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { width, flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bigEmoji: { fontSize: 72, marginBottom: 16 },
  emoji: { fontSize: 48, marginBottom: 12 },
  h1: { fontSize: 28, fontWeight: '700', color: '#FFF', textAlign: 'center', marginBottom: 12 },
  h2: { fontSize: 22, fontWeight: '700', color: '#FFF', textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 16, color: '#94A3B8', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  hint: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8 },
  btn: { backgroundColor: '#00FFB0', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, marginTop: 20, width: '100%', alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#080D1A', fontWeight: '700', fontSize: 16 },
  option: { borderWidth: 1, borderColor: '#1E293B', borderRadius: 12, padding: 16, width: '100%', marginTop: 10 },
  optionSelected: { borderColor: '#00FFB0', backgroundColor: '#00FFB015' },
  optionText: { color: '#FFF', fontSize: 15 },
  dateButton: { width: '100%', backgroundColor: '#0F1826', borderColor: '#1E293B', borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginTop: 12 },
  dateButtonLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4, fontWeight: '600' },
  dateValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  bulletCard: { backgroundColor: '#0F1826', borderRadius: 14, padding: 20, width: '100%', marginBottom: 20 },
  bullet: { color: '#CBD5E1', fontSize: 15, marginVertical: 5 },
  dots: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1E293B', marginHorizontal: 4 },
  dotActive: { backgroundColor: '#00FFB0', width: 20 },
});
