// src/screens/SettingsScreen.tsx
// v2.0.0 — Added Backup & Restore section.
//
// NEW:
//   - "BACKUP & RESTORE" card with Import / Export rows
//   - importVocabFromFile, importSentencesFromFile, importAllFromFiles via SAF picker
//   - shareVocabFile, shareSentencesFile for export
//   - ImportResultModal shows import summary after each import
//
// PRESERVED:
//   - All existing APPEARANCE, DICTIONARY, READER, ABOUT rows unchanged

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, Switch, ScrollView, Modal,
  Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeMode } from '../utils/ThemeContext';
import { getOfflineDictionarySize } from '../services/dictionaryService';
import { getOxfordCount } from '../database/database';
import { BorderRadius, FontSize, Spacing } from '../utils/theme';
import {
  importVocabFromFile,
  importSentencesFromFile,
  importAllFromFiles,
  shareVocabFile,
  shareSentencesFile,
  ImportSummary,
} from '../services/backupService';

// ─── IMPORT RESULT MODAL ──────────────────────────────────────────────────────

interface ResultModalProps {
  visible:  boolean;
  title:    string;
  summary:  ImportSummary | null;
  onClose:  () => void;
  colors:   any;
}

const ImportResultModal: React.FC<ResultModalProps> = ({
  visible, title, summary, onClose, colors,
}) => {
  if (!visible || !summary) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[rm.overlay, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      >
        <Pressable style={[rm.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <Text style={[rm.title, { color: colors.text }]}>{title}</Text>

          <View style={rm.rows}>
            <SummaryRow label="Total in file" value={summary.total}  color={colors.textSecondary} />
            <SummaryRow label="Imported"      value={summary.imported} color={colors.accentGreen} />
            <SummaryRow label="Skipped (duplicates)" value={summary.skipped} color={colors.accentAmber} />
            <SummaryRow label="Invalid / malformed"  value={summary.invalid} color={colors.error} />
          </View>

          <Text style={[rm.note, { color: colors.textMuted }]}>
            {summary.skipped > 0
              ? 'Existing entries were not overwritten. Enable "Overwrite" if needed.'
              : 'All new entries have been merged into your database.'}
          </Text>

          <TouchableOpacity
            style={[rm.doneBtn, { backgroundColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={rm.doneTxt}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const SummaryRow = ({
  label, value, color,
}: { label: string; value: number; color: string }) => (
  <View style={rm.summaryRow}>
    <Text style={[rm.summaryLabel, { color }]}>{label}</Text>
    <Text style={[rm.summaryValue, { color }]}>{value}</Text>
  </View>
);

const rm = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl,
  },
  card: {
    width: '100%', borderRadius: BorderRadius.xl, padding: Spacing.lg,
    elevation: 20, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  title:   { fontSize: FontSize.xl, fontWeight: '800', marginBottom: Spacing.md },
  rows:    { gap: 8, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: FontSize.sm },
  summaryValue: { fontSize: FontSize.md, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  note:    { fontSize: FontSize.xs, lineHeight: 16, marginBottom: Spacing.md, fontStyle: 'italic' },
  doneBtn: {
    alignItems: 'center', paddingVertical: 12, borderRadius: BorderRadius.md,
  },
  doneTxt: { color: 'white', fontSize: FontSize.md, fontWeight: '700' },
});

// ─── SETTINGS SCREEN ──────────────────────────────────────────────────────────

export const SettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const localSize = getOfflineDictionarySize();
  const [oxfordCount, setOxfordCount] = useState(0);

  // Import state
  const [importing, setImporting]           = useState<'vocab' | 'sentences' | 'all' | null>(null);
  const [resultVisible, setResultVisible]   = useState(false);
  const [resultTitle, setResultTitle]       = useState('');
  const [resultSummary, setResultSummary]   = useState<ImportSummary | null>(null);

  useEffect(() => {
    getOxfordCount().then(setOxfordCount);
  }, []);

  // ── Import handlers ───────────────────────────────────────────────────────

  const handleImportVocab = async () => {
    setImporting('vocab');
    try {
      const summary = await importVocabFromFile(false);
      if (summary === null) { setImporting(null); return; } // user cancelled
      setResultTitle('Vocabulary Import Complete');
      setResultSummary(summary);
      setResultVisible(true);
    } catch (err) {
      Alert.alert('Import Error', 'Could not import the file. Please check the format.');
    }
    setImporting(null);
  };

  const handleImportSentences = async () => {
    setImporting('sentences');
    try {
      const summary = await importSentencesFromFile(false);
      if (summary === null) { setImporting(null); return; }
      setResultTitle('Sentences Import Complete');
      setResultSummary(summary);
      setResultVisible(true);
    } catch (err) {
      Alert.alert('Import Error', 'Could not import the file. Please check the format.');
    }
    setImporting(null);
  };

  const handleImportAll = async () => {
    setImporting('all');
    try {
      const { vocab, sentences } = await importAllFromFiles(false);
      // Show combined summary for vocab (sentences shows separately)
      if (vocab === null && sentences === null) { setImporting(null); return; }
      const combined: ImportSummary = {
        imported: (vocab?.imported ?? 0) + (sentences?.imported ?? 0),
        skipped:  (vocab?.skipped  ?? 0) + (sentences?.skipped  ?? 0),
        invalid:  (vocab?.invalid  ?? 0) + (sentences?.invalid  ?? 0),
        total:    (vocab?.total    ?? 0) + (sentences?.total    ?? 0),
      };
      setResultTitle('Full Import Complete');
      setResultSummary(combined);
      setResultVisible(true);
    } catch (err) {
      Alert.alert('Import Error', 'An error occurred during import.');
    }
    setImporting(null);
  };

  // ── Row component (reusable) ──────────────────────────────────────────────

  const Row = ({
    icon, label, value, right, tint, onPress,
  }: {
    icon: string; label: string; value?: string;
    right?: React.ReactNode; tint?: string; onPress?: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.65 : 1}
      disabled={!onPress && !right}
    >
      <View style={[styles.rowIcon, { backgroundColor: (tint ?? colors.primary) + '22' }]}>
        <Ionicons name={icon as any} size={18} color={tint ?? colors.primary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {!!value && <Text style={[styles.rowValue, { color: colors.textMuted }]}>{value}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null)}
    </TouchableOpacity>
  );

  // ── Import row with loading indicator ─────────────────────────────────────

  const ImportRow = ({
    icon, label, value, tint, importKey, onPress,
  }: {
    icon: string; label: string; value: string; tint: string;
    importKey: 'vocab' | 'sentences' | 'all'; onPress: () => void;
  }) => {
    const isLoading = importing === importKey;
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={onPress}
        disabled={!!importing}
        activeOpacity={0.65}
      >
        <View style={[styles.rowIcon, { backgroundColor: tint + '22' }]}>
          <Ionicons name={icon as any} size={18} color={tint} />
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.rowValue, { color: colors.textMuted }]}>{value}</Text>
        </View>
        {isLoading
          ? <ActivityIndicator size="small" color={tint} />
          : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* APPEARANCE */}
        <Text style={[styles.section, { color: colors.textMuted }]}>
          APPEARANCE
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Row
            icon="moon-outline"
            label="Dark Mode"
            tint={colors.primary}
            right={
              <Switch
                value={isDark}
                onValueChange={(v) => setThemeMode(v ? "dark" : "light")}
                trackColor={{
                  false: colors.border,
                  true: colors.primary + "80",
                }}
                thumbColor={isDark ? colors.primary : colors.textMuted}
              />
            }
          />
          <Row
            icon="phone-portrait-outline"
            label="Follow System Theme"
            tint={colors.accentGreen}
            right={
              <Switch
                value={themeMode === "system"}
                onValueChange={(v) =>
                  setThemeMode(v ? "system" : isDark ? "dark" : "light")
                }
                trackColor={{
                  false: colors.border,
                  true: colors.accentGreen + "80",
                }}
                thumbColor={
                  themeMode === "system" ? colors.accentGreen : colors.textMuted
                }
              />
            }
          />
        </View>

        {/* DICTIONARY */}
        <Text style={[styles.section, { color: colors.textMuted }]}>
          DICTIONARY
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Row
            icon="book-outline"
            label="Oxford English Dictionary"
            value={
              oxfordCount > 0
                ? `${oxfordCount.toLocaleString()} entries — fully offline`
                : "Loading…"
            }
            tint={colors.primary}
          />
          <Row
            icon="library-outline"
            label="Curated Local Dictionary"
            value={`${localSize} words with examples & synonyms`}
            tint={colors.accentGreen}
          />
          <Row
            icon="globe-outline"
            label="Online API"
            value="dictionaryapi.dev — free, no key, auto-enriches results"
            tint={colors.accentAmber}
          />
          <Row
            icon="flash-outline"
            label="Result Cache"
            value="Online lookups saved to SQLite for instant reuse"
            tint={colors.primary}
          />
        </View>

        {/* READER */}
        <Text style={[styles.section, { color: colors.textMuted }]}>
          READER
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Row
            icon="expand-outline"
            label="Pinch to Zoom"
            value="Two-finger pinch  (0.5× – 6×)"
            tint={colors.primary}
          />
          <Row
            icon="hand-left-outline"
            label="Long-Press Menu"
            value="Hold on PDF: look up / save vocab / add sentence"
            tint={colors.accentAmber}
          />
          <Row
            icon="copy-outline"
            label="Copy Text"
            value="Long-press → edit text → Copy in bubble"
            tint={colors.accentGreen}
          />
          <Row
            icon="eye-off-outline"
            label="Immersive Mode"
            value="Single tap to hide/show toolbars"
            tint={colors.primary}
          />
          <Row
            icon="search-outline"
            label="Manual Search"
            value="Tap 'Search Word' for any word"
            tint={colors.accentGreen}
          />
          <Row
            icon="albums-outline"
            label="Continuous Scroll"
            value="Swipe up/down through all pages"
            tint={colors.primary}
          />
        </View>

        {/* BACKUP & RESTORE */}
        <Text style={[styles.section, { color: colors.textMuted }]}>
          BACKUP & RESTORE
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {/* Export */}
          <Row
            icon="share-outline"
            label="Export Vocabulary"
            value="Share vocabulary.txt with your custom words"
            tint={colors.primary}
            onPress={async () => {
              const ok = await shareVocabFile();
              if (!ok)
                Alert.alert(
                  "No file",
                  "Add some custom vocabulary entries first.",
                );
            }}
          />
          <Row
            icon="share-social-outline"
            label="Export Sentences"
            value="Share sentences.txt with your sentence notes"
            tint={colors.accentAmber}
            onPress={async () => {
              const ok = await shareSentencesFile();
              if (!ok) Alert.alert("No file", "Add some sentence notes first.");
            }}
          />

          {/* Import */}
          <ImportRow
            icon="download-outline"
            label="Import Vocabulary"
            value="Pick a vocabulary.txt to restore words"
            tint={colors.accentGreen}
            importKey="vocab"
            onPress={handleImportVocab}
          />
          <ImportRow
            icon="chatbubble-ellipses-outline"
            label="Import Sentences"
            value="Pick a sentences.txt to restore notes"
            tint={colors.accentAmber}
            importKey="sentences"
            onPress={handleImportSentences}
          />
          <ImportRow
            icon="refresh-circle-outline"
            label="Import All Notes"
            value="Pick both files to restore full backup"
            tint={colors.primary}
            importKey="all"
            onPress={handleImportAll}
          />
        </View>

        {/* Info block */}
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: colors.primary + "10",
              borderColor: colors.primary + "30",
            },
          ]}
        >
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.infoTxt, { color: colors.textSecondary }]}>
            Auto-export: your notes are saved to{" "}
            <Text style={{ fontWeight: "700" }}>VocabPDF/vocabulary.txt</Text>{" "}
            and{" "}
            <Text style={{ fontWeight: "700" }}>VocabPDF/sentences.txt</Text> in
            app storage, updated in real-time. Copy these files to restore on a
            new device.
          </Text>
        </View>

        {/* ABOUT */}
        <Text style={[styles.section, { color: colors.textMuted }]}>ABOUT</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Row
            icon="information-circle-outline"
            label="Version"
            value="2.0.0"
          />
          <Row
            icon="code-slash-outline"
            label="Stack"
            value="React Native · Expo · SQLite"
          />
          <Row
            icon="shield-checkmark-outline"
            label="Privacy"
            value="All data stays on your device"
            tint={colors.accentGreen}
          />
          <Row
            icon="heart-outline"
            label="github"
            value="https://github.com/Jasvant0020"
          />
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Import result modal */}
      <ImportResultModal
        visible={resultVisible}
        title={resultTitle}
        summary={resultSummary}
        onClose={() => {
          setResultVisible(false);
          setResultSummary(null);
        }}
        colors={colors}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.md,
  },
  backBtn: { padding: 4 },
  title:   { fontSize: FontSize.xl, fontWeight: '800', letterSpacing: -0.5 },
  section: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xs,
  },
  card: {
    marginHorizontal: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 1, overflow: 'hidden', marginBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm,
  },
  rowIcon:    { width: 34, height: 34, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  rowContent: { flex: 1 },
  rowLabel:   { fontSize: FontSize.md, fontWeight: '500' },
  rowValue:   { fontSize: FontSize.xs, marginTop: 1, lineHeight: 16 },
  infoBox: {
    flexDirection:     'row',
    gap:               8,
    marginHorizontal:  Spacing.md,
    marginTop:         Spacing.xs,
    marginBottom:      Spacing.xs,
    padding:           Spacing.md,
    borderRadius:      BorderRadius.md,
    borderWidth:       1,
    alignItems:        'flex-start',
  },
  infoTxt: { flex: 1, fontSize: FontSize.xs, lineHeight: 17 },
});
