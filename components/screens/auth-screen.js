import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const C = {
  bg: '#080D1A',
  card: '#0F1826',
  card2: '#162033',
  green: '#00FFB0',
  red: '#FF3B5C',
  text: '#F8FAFC',
  muted: '#475569',
  border: '#1E293B',
};

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordInputRef = useRef(null);

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await onAuth({ mode, email, password });
    } catch (err) {
      setError(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.card}>
          <Text style={s.title}>🐐 GFT Coach</Text>
          <Text style={s.subtitle}>Secure cloud sync for your trading progress</Text>

          <View style={s.authTabs}>
            <TouchableOpacity
              style={[s.authTabBtn, mode === 'login' && s.authTabActive]}
              onPress={() => {
                setMode('login');
                setError('');
              }}
            >
              <Text style={[s.authTabText, mode === 'login' && s.authTabTextActive]}>LOGIN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.authTabBtn, mode === 'signup' && s.authTabActive]}
              onPress={() => {
                setMode('signup');
                setError('');
              }}
            >
              <Text style={[s.authTabText, mode === 'signup' && s.authTabTextActive]}>SIGN UP</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[s.textInput, { marginTop: 14 }]}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            placeholder="Email"
            placeholderTextColor={C.muted}
          />
          <TextInput
            ref={passwordInputRef}
            style={[s.textInput, { marginTop: 10 }]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={submit}
            placeholder="Password"
            placeholderTextColor={C.muted}
          />

          {error ? <Text style={s.authError}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.cta, { opacity: loading ? 0.7 : 1 }]}
            onPress={submit}
            disabled={loading}
          >
            <Text style={s.ctaText}>
              {loading ? 'Please wait...' : mode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', paddingHorizontal: 18 },
  content: { flexGrow: 1, justifyContent: 'center' },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  title: { fontSize: 30, fontWeight: '900', color: C.text },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 6 },
  authTabs: { flexDirection: 'row', backgroundColor: C.card2, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 16, padding: 4 },
  authTabBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  authTabActive: { backgroundColor: C.bg },
  authTabText: { color: C.muted, fontSize: 12, fontWeight: '800' },
  authTabTextActive: { color: C.green },
  textInput: {
    backgroundColor: C.card2,
    borderRadius: 10,
    padding: 12,
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
  },
  authError: { color: C.red, marginTop: 10, fontSize: 12, fontWeight: '600' },
  cta: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: C.green,
  },
  ctaText: { color: '#000', fontWeight: '900', fontSize: 15 },
});
