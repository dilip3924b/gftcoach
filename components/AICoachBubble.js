import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { C } from '../lib/constants';

export default function AICoachBubble({ onPress }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} activeOpacity={0.9}>
      <Text style={styles.emoji}>🤖</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    right: 16,
    bottom: 92,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: '#5DFFD3',
    shadowColor: C.green,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 20,
  },
  emoji: { fontSize: 28 },
});
