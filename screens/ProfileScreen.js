import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { C } from '../lib/constants';

export default function ProfileScreen({ user, profile, onSaveProfile, onLogout }) {
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile?.display_name || '');
    setTimezone(profile?.timezone || 'Asia/Kolkata');
  }, [profile?.display_name, profile?.timezone]);

  const save = async () => {
    setSaving(true);
    const result = await onSaveProfile?.({ display_name: name.trim(), timezone });
    setSaving(false);
    if (result?.error) {
      Alert.alert('Profile update failed', result.error?.message || 'Please try again.');
      return;
    }
    Alert.alert('Saved', 'Profile updated successfully.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 110 }}>
      <View style={styles.header}>
        <Text style={styles.title}>👤 Profile</Text>
        <Text style={styles.sub}>Manage your account settings</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput style={[styles.input, styles.disabled]} value={user?.email || ''} editable={false} />

        <Text style={styles.label}>Display Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.muted} />

        <Text style={styles.label}>Timezone</Text>
        <TextInput style={styles.input} value={timezone} onChangeText={setTimezone} placeholder="Asia/Kolkata" placeholderTextColor={C.muted} />

        <TouchableOpacity style={[styles.btn, { opacity: saving ? 0.6 : 1 }]} onPress={save} disabled={saving}>
          <Text style={styles.btnTxt}>{saving ? 'Saving...' : 'Save Profile'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.ruleTitle}>Account</Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: C.red }]}
          onPress={() => Alert.alert('Logout', 'Do you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: onLogout },
          ])}
        >
          <Text style={[styles.btnTxt, { color: '#fff' }]}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { padding: 20, paddingTop: 50 },
  title: { color: C.text, fontSize: 26, fontWeight: '900' },
  sub: { color: C.muted, marginTop: 2, fontSize: 13 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginHorizontal: 12, marginBottom: 10 },
  label: { color: C.text, fontWeight: '700', fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    color: C.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  disabled: { opacity: 0.7 },
  btn: { marginTop: 14, backgroundColor: C.green, borderRadius: 10, padding: 12, alignItems: 'center' },
  btnTxt: { color: '#000', fontWeight: '900' },
  ruleTitle: { color: C.text, fontSize: 14, fontWeight: '900' },
});
