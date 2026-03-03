import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const C = { bg: '#080D1A', card: '#0F1826', green: '#00FFB0', yellow: '#FFD60A', orange: '#F97316', red: '#FF3B5C', text: '#FFF', sub: '#94A3B8', border: '#1E293B' };

const verdictColor = (v) => {
  const s = String(v || '').toUpperCase();
  if (s.includes('BUY') || s.includes('BULLISH')) return C.green;
  if (s.includes('SELL') || s.includes('BEARISH')) return C.red;
  if (s.includes('RISK')) return C.orange;
  return C.yellow;
};

const Row = ({ label, value }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap' }}>
    <Text style={{ color: C.sub, fontSize: 13, textTransform: 'capitalize' }}>{label}</Text>
    <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', maxWidth: '60%', textAlign: 'right' }}>{String(value ?? 'N/A')}</Text>
  </View>
);

export default function AIThinkingScreen({ signal, onBack }) {
  const report = signal?.thinkingReport || signal?.thinking_report;

  if (!report) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: C.sub, fontSize: 16, textAlign: 'center', padding: 32 }}>
          No thinking report available for this signal.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={onBack}>
          <Text style={styles.btnText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.pageTitle}>🤖 How AI Decided</Text>
      <Text style={styles.sub}>{signal?.symbol || 'EURUSD'} {signal?.signal || 'WAIT'} · Score: {report?.scoreBreakdown?.totalScore || signal?.technicalScore || '?'}/100</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📊 SECTION 1: DATA I COLLECTED</Text>
        {Object.entries(report?.dataCollected || report?.dataGathered || {}).map(([k, v]) => (
          <Row key={k} label={k.replace(/([A-Z])/g, ' $1')} value={typeof v === 'object' ? JSON.stringify(v) : v} />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>🔍 SECTION 2: WHAT I COMPARED</Text>
        {(report?.comparisons || []).map((c, i) => (
          <View key={`${c.factor}_${i}`} style={[styles.factorCard, { borderLeftColor: verdictColor(c.verdict) }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.factorTitle, { flex: 1 }]}>{i + 1}. {c.factor}</Text>
              <Text style={[styles.points, { color: Number(c.weight) > 0 ? C.green : C.red }]}>{Number(c.weight) > 0 ? '+' : ''}{c.weight}pts</Text>
            </View>
            <Text style={[styles.verdict, { color: verdictColor(c.verdict) }]}>{c.verdict}</Text>
            <Text style={styles.whatAISaw}>Saw: {c.what_ai_saw || c.finding || 'N/A'}</Text>
            {!!c.simpleExplanation && <Text style={styles.analogy}>💡 Like: {c.simpleExplanation}</Text>}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>🎯 SECTION 3: THE SCORE</Text>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, {
            width: `${report?.scoreBreakdown?.totalScore || 0}%`,
            backgroundColor: (report?.scoreBreakdown?.totalScore || 0) >= 70 ? C.green : (report?.scoreBreakdown?.totalScore || 0) >= 50 ? C.yellow : C.red,
          }]} />
        </View>
        <Text style={[styles.bigScore, { color: (report?.scoreBreakdown?.totalScore || 0) >= 70 ? C.green : (report?.scoreBreakdown?.totalScore || 0) >= 50 ? C.yellow : C.red }]}>
          {report?.scoreBreakdown?.totalScore || signal?.technicalScore || '?'}/100
        </Text>
        {!!report?.scoreBreakdown?.whyThisScore && <Text style={[styles.body, { textAlign: 'center' }]}>{report.scoreBreakdown.whyThisScore}</Text>}
      </View>

      {!!report?.simpleExplanation && (
        <View style={[styles.card, { backgroundColor: '#0A1628' }]}>
          <Text style={styles.sectionTitle}>💡 SECTION 4: IN SIMPLE WORDS</Text>
          {!!report.simpleExplanation.oneLiner && <Text style={[styles.h3, { color: signal?.signal === 'BUY' ? C.green : C.red, marginBottom: 10 }]}>{report.simpleExplanation.oneLiner}</Text>}
          {!!report.simpleExplanation.analogy && <Text style={[styles.body, { fontStyle: 'italic' }]}>{report.simpleExplanation.analogy}</Text>}
        </View>
      )}

      {!!(report?.risks || []).length && (
        <View style={[styles.card, { borderColor: C.orange, borderWidth: 1 }]}>
          <Text style={styles.sectionTitle}>⚠️ SECTION 5: WHAT COULD GO WRONG</Text>
          {(report.risks || []).map((risk, i) => (
            <View key={i} style={{ marginTop: 10 }}>
              <Text style={[styles.body, { fontWeight: '700', color: C.orange }]}>Risk {i + 1}: {risk.scenario}</Text>
              {!!risk.probability && <Text style={[styles.body, { color: C.sub }]}>Probability: {risk.probability}</Text>}
              <Text style={[styles.body, { color: C.green }]}>Protection: {risk.howProtected || risk.protection || 'SL / risk control'}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={[styles.btn, { marginBottom: 40 }]} onPress={onBack}>
        <Text style={styles.btnText}>← Back to Signal</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 4, marginTop: 8 },
  sub: { fontSize: 13, color: C.sub, marginBottom: 16 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.sub, letterSpacing: 1, marginBottom: 12 },
  factorCard: { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 14 },
  factorTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  points: { fontSize: 15, fontWeight: '700' },
  verdict: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  whatAISaw: { fontSize: 13, color: '#CBD5E1', marginTop: 4, fontStyle: 'italic' },
  analogy: { fontSize: 13, color: C.sub, marginTop: 4 },
  h3: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 14, color: '#CBD5E1', lineHeight: 22 },
  bigScore: { fontSize: 48, fontWeight: '900', textAlign: 'center', marginVertical: 8 },
  progressBg: { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: 8, borderRadius: 4 },
  btn: { backgroundColor: C.green, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#080D1A', fontWeight: '700', fontSize: 15 },
});
