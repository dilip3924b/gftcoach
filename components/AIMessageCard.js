import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '../lib/constants';

export default function AIMessageCard({ message, onLongPress }) {
  const isUser = message.role === 'user';
  return (
    <Pressable
      onLongPress={() => onLongPress?.(message)}
      style={[styles.wrap, isUser ? styles.wrapRight : styles.wrapLeft]}
    >
      {!isUser ? <Text style={styles.avatar}>🤖</Text> : null}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.text, isUser && styles.userText]}>{message.content}</Text>
        <Text style={styles.time}>{message.timeLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 8, marginBottom: 10, paddingHorizontal: 12 },
  wrapLeft: { justifyContent: 'flex-start' },
  wrapRight: { justifyContent: 'flex-end' },
  avatar: { fontSize: 18, marginTop: 4 },
  bubble: { maxWidth: '84%', borderRadius: 14, borderWidth: 1, padding: 10 },
  aiBubble: { backgroundColor: C.card2, borderColor: C.border },
  userBubble: { backgroundColor: '#1f3f6f', borderColor: C.blue },
  text: { color: C.text, fontSize: 14, lineHeight: 20 },
  userText: { color: '#EAF3FF' },
  time: { color: C.muted, fontSize: 10, marginTop: 6, textAlign: 'right' },
});
