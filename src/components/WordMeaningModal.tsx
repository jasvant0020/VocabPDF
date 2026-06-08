// src/components/WordMeaningModal.tsx
// Rich display of Oxford Dictionary entries:
//   - Word + pronunciation
//   - Part of speech badge
//   - All numbered definitions (per meaning block)
//   - Etymology
//   - Synonyms
//   - Example sentence
//   - Source badge (Oxford / Online / Cached / Offline)

import React, { useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ScrollView, Animated, Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { WordDefinition, MeaningBlock } from '../services/dictionaryService';
import { BorderRadius, FontSize, Spacing } from '../utils/theme';

interface Props {
  visible:   boolean;
  wordData:  WordDefinition | null;
  onClose:   () => void;
  onSave:    (w: WordDefinition) => void;
  isSaved?:  boolean;
  isLoading?: boolean;
}

const SOURCE_CFG = {
  oxford:  { label: '📖 Oxford Dictionary', short: 'Oxford'  },
  cache:   { label: '⚡ Cached Result',      short: 'Cached'  },
  online:  { label: '🌐 Online Lookup',      short: 'Online'  },
  offline: { label: '📚 Local Dictionary',   short: 'Local'   },
} as const;

const POS_COLORS: Record<string, string> = {
  noun:          '#6C63FF',
  verb:          '#FF6B6B',
  adjective:     '#43D9AD',
  adverb:        '#FFB347',
  preposition:   '#7EC8E3',
  pronoun:       '#E8A0BF',
  conjunction:   '#B5EAD7',
  interjection:  '#FFDAC1',
  abbreviation:  '#C7CEEA',
  prefix:        '#FF9AA2',
  suffix:        '#FF9AA2',
  colloquial:    '#E2D4F0',
  grammar:       '#D4F0E2',
  nautical:      '#D4E8F0',
  predicative:   '#F0E4D4',
};

export const WordMeaningModal: React.FC<Props> = ({
  visible, wordData, onClose, onSave, isSaved = false, isLoading = false,
}) => {
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 58, friction: 12, useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 0,   duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const src    = wordData?.source ?? 'offline';
  const srcCfg = SOURCE_CFG[src] ?? SOURCE_CFG.offline;
  const posColor = POS_COLORS[wordData?.partOfSpeech ?? ''] ?? colors.primary;

  const synonyms = wordData?.synonyms ?? [];

  // Collect all definitions across all meaning blocks
  const allMeanings: MeaningBlock[] = wordData?.allMeanings ?? [];
  const hasMeanings = allMeanings.length > 0;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={[s.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Animated.View
          style={[
            s.sheet,
            { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }], opacity: fadeAnim },
          ]}
        >
          <Pressable onPress={() => {}}>
            {/* Drag handle */}
            <View style={s.handleRow}>
              <View style={[s.handle, { backgroundColor: colors.border }]} />
            </View>

            {/* Top bar */}
            <View style={[s.topBar, { borderBottomColor: colors.border }]}>
              <View style={[s.srcBadge, { backgroundColor: posColor + '22' }]}>
                <Text style={[s.srcBadgeTxt, { color: posColor }]}>{srcCfg.label}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Body */}
            {isLoading ? (
              <View style={s.loadingBox}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[s.loadingTxt, { color: colors.textSecondary }]}>
                  Looking up definition…
                </Text>
              </View>
            ) : wordData ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.scroll}
                keyboardShouldPersistTaps="handled"
              >

                {/* ── Word + POS + Pronunciation ── */}
                <View style={s.wordHeader}>
                  <View style={s.wordRow}>
                    <Text style={[s.wordTxt, { color: colors.primary }]}>
                      {wordData.word}
                    </Text>
                    {!!wordData.partOfSpeech && (
                      <View style={[s.posBadge, { backgroundColor: posColor + '22' }]}>
                        <Text style={[s.posTxt, { color: posColor }]}>
                          {wordData.partOfSpeech}
                        </Text>
                      </View>
                    )}
                  </View>
                  {!!wordData.pronunciation && (
                    <Text style={[s.pronTxt, { color: colors.textMuted }]}>
                      / {wordData.pronunciation} /
                    </Text>
                  )}
                </View>

                {/* ── Etymology ── */}
                {!!wordData.etymology && (
                  <View style={[s.etymBox, { backgroundColor: colors.surfaceElevated, borderLeftColor: colors.primary }]}>
                    <Text style={[s.etymLabel, { color: colors.textMuted }]}>ORIGIN</Text>
                    <Text style={[s.etymTxt, { color: colors.textSecondary }]}>
                      {wordData.etymology}
                    </Text>
                  </View>
                )}

                {/* ── Definitions (rich allMeanings from Oxford/API) ── */}
                {hasMeanings ? (
                  allMeanings.map((block, bi) => (
                    <View key={bi} style={[s.block, { backgroundColor: colors.surfaceElevated }]}>
                      {/* Part-of-speech header for each block */}
                      {!!block.partOfSpeech && (
                        <View style={s.blockHeader}>
                          <View style={[s.posLine, { backgroundColor: posColor }]} />
                          <Text style={[s.blockPos, { color: posColor }]}>
                            {block.partOfSpeech}
                          </Text>
                        </View>
                      )}

                      {block.definitions.map((def, di) => (
                        <View key={di} style={di > 0 ? s.defRow : s.defRowFirst}>
                          {block.definitions.length > 1 && (
                            <Text style={[s.defNum, { color: colors.primary }]}>
                              {di + 1}.
                            </Text>
                          )}
                          <View style={s.defContent}>
                            <Text style={[s.defTxt, { color: colors.text }]}>
                              {def.definition}
                            </Text>
                            {!!def.example && (
                              <Text style={[s.defExample, { color: colors.textSecondary }]}>
                                ❝ {def.example} ❞
                              </Text>
                            )}
                            {def.synonyms && def.synonyms.length > 0 && (
                              <View style={s.inlineSynRow}>
                                {def.synonyms.slice(0, 4).map((syn, si) => (
                                  <View
                                    key={si}
                                    style={[s.synChip, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                                  >
                                    <Text style={[s.synChipTxt, { color: colors.primaryLight }]}>{syn}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  ))
                ) : (
                  /* Fallback: single definition */
                  <View style={[s.block, { backgroundColor: colors.surfaceElevated }]}>
                    <Text style={[s.defTxt, { color: colors.text }]}>
                      {wordData.meaning}
                    </Text>
                  </View>
                )}

                {/* ── All synonyms (from online API) ── */}
                {synonyms.length > 0 && (
                  <View style={s.section}>
                    <Text style={[s.sectionLabel, { color: colors.textMuted }]}>SYNONYMS</Text>
                    <View style={s.chipsWrap}>
                      {synonyms.map((syn, i) => (
                        <View
                          key={i}
                          style={[
                            s.synChip,
                            { backgroundColor: colors.accentGreen + '18', borderColor: colors.accentGreen + '44' },
                          ]}
                        >
                          <Text style={[s.synChipTxt, { color: colors.accentGreen }]}>{syn}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* ── Best example (if not already shown in allMeanings) ── */}
                {!!wordData.example && !hasMeanings && (
                  <View style={[s.section, { backgroundColor: colors.accentGreen + '10', borderRadius: BorderRadius.md, padding: Spacing.md }]}>
                    <Text style={[s.sectionLabel, { color: colors.textMuted }]}>EXAMPLE</Text>
                    <Text style={[s.exampleTxt, { color: colors.text }]}>
                      ❝ {wordData.example} ❞
                    </Text>
                  </View>
                )}

                {/* ── Source note ── */}
                <Text style={[s.sourceNote, { color: colors.textMuted }]}>
                  Source: {srcCfg.label}
                </Text>

                {/* ── Save button ── */}
                <TouchableOpacity
                  style={[
                    s.saveBtn,
                    {
                      backgroundColor: isSaved ? colors.accentGreen + '20' : colors.primary,
                      borderWidth:  isSaved ? 1.5 : 0,
                      borderColor:  isSaved ? colors.accentGreen : 'transparent',
                    },
                  ]}
                  onPress={() => !isSaved && onSave(wordData)}
                  disabled={isSaved}
                  activeOpacity={0.82}
                >
                  <Ionicons
                    name={isSaved ? 'checkmark-circle' : 'bookmark-outline'}
                    size={18}
                    color={isSaved ? colors.accentGreen : '#fff'}
                  />
                  <Text style={[s.saveTxt, { color: isSaved ? colors.accentGreen : '#fff' }]}>
                    {isSaved ? 'Saved to Vocabulary' : 'Save to Vocabulary'}
                  </Text>
                </TouchableOpacity>

                <View style={{ height: 28 }} />
              </ScrollView>
            ) : null}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'flex-end' },
  sheet:     { borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '88%' },
  handleRow: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:    { width: 36, height: 4, borderRadius: 2 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, borderBottomWidth: 1,
  },
  srcBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  srcBadgeTxt: { fontSize: FontSize.xs, fontWeight: '700' },
  loadingBox:  { padding: 56, alignItems: 'center', gap: 14 },
  loadingTxt:  { fontSize: FontSize.md },
  scroll:      { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },

  // Word header
  wordHeader: { marginBottom: Spacing.sm },
  wordRow:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  wordTxt:    { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  posBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  posTxt:     { fontSize: FontSize.sm, fontWeight: '700' },
  pronTxt:    { fontSize: FontSize.md, letterSpacing: 0.5, marginTop: 2 },

  // Etymology
  etymBox: {
    borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 8,
    borderRadius: 4, marginBottom: Spacing.sm,
  },
  etymLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 3 },
  etymTxt:   { fontSize: FontSize.sm, lineHeight: 18, fontStyle: 'italic' },

  // Definition blocks
  block:   { borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  posLine: { width: 3, height: 16, borderRadius: 2 },
  blockPos: { fontSize: FontSize.sm, fontWeight: '800', letterSpacing: 0.5 },
  defRowFirst: { flexDirection: 'row', gap: 6 },
  defRow:  { flexDirection: 'row', gap: 6, marginTop: Spacing.md },
  defNum:  { fontSize: FontSize.md, fontWeight: '800', minWidth: 20, marginTop: 1 },
  defContent: { flex: 1 },
  defTxt:     { fontSize: FontSize.md, lineHeight: 24, fontWeight: '400' },
  defExample: {
    fontSize: FontSize.sm, fontStyle: 'italic',
    lineHeight: 18, marginTop: 6, opacity: 0.8,
  },
  inlineSynRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },

  // Synonyms section
  section:      { marginBottom: Spacing.sm },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  chipsWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  synChip:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full, borderWidth: 1 },
  synChipTxt:   { fontSize: FontSize.xs, fontWeight: '500' },

  // Example
  exampleTxt: { fontSize: FontSize.md, fontStyle: 'italic', lineHeight: 22 },

  // Source note
  sourceNote: { fontSize: FontSize.xs, textAlign: 'center', marginVertical: Spacing.sm },

  // Save
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: Spacing.md, borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
  },
  saveTxt: { fontSize: FontSize.md, fontWeight: '700' },
});
