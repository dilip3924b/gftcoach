import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { C } from '../lib/constants';

export default function AITypingIndicator() {
  const a1 = useRef(new Animated.Value(0.3)).current;
  const a2 = useRef(new Animated.Value(0.3)).current;
  const a3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a1, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(a2, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(a3, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(a1, { toValue: 0.3, duration: 220, useNativeDriver: true }),
        Animated.timing(a2, { toValue: 0.3, duration: 220, useNativeDriver: true }),
        Animated.timing(a3, { toValue: 0.3, duration: 220, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [a1, a2, a3]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.avatar}>🤖</Text>
      <View style={styles.bubble}>
        <Text style={styles.label}>AI is thinking</Text>
        <View style={styles.row}>
          <Animated.Text style={[styles.dot, { opacity: a1 }]}>•</Animated.Text>
          <Animated.Text style={[styles.dot, { opacity: a2 }]}>•</Animated.Text>
          <Animated.Text style={[styles.dot, { opacity: a3 }]}>•</Animated.Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 10 },
  avatar: { fontSize: 18, marginTop: 4 },
  bubble: {
    backgroundColor: C.card2,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  label: { color: C.muted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { color: C.green, fontSize: 18, lineHeight: 18 },
});
