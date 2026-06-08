// src/components/CustomEntryModal.tsx
//
// PURPOSE
// -------
// A bottom-sheet modal that lets the user add or edit a custom vocabulary word
// or a custom sentence during PDF reading.
//
// Props
//   mode:         'vocab' | 'sentence'
//   visible:      show/hide
//   initialText:  pre-fill the word/sentence field (from long-press)
//   editEntry:    if set, we are editing an existing entry (shows id)
//   pdfSource:    name of the current PDF file
//   onSaved:      called after a successful save (triggers TXT re-sync)
//   onClose:      dismiss the modal without saving
//
// UI: two TextInputs (word/sentence + meaning), Save / Cancel buttons.
// Keyboard-aware: uses padding so the inputs stay above the software keyboard.

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '../utils/theme';
import {
  saveCustomVocab,
  saveCustomSentence,
  CustomVocabEntry,
  CustomSentenceEntry,
} from '../database/database';
import { syncVocabTxt, syncSentencesTxt } from '../services/autoExportService';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type EntryMode = 'vocab' | 'sentence';

interface Props {
  mode:          EntryMode;
  visible:       boolean;
  initialText?:  string;
  editEntry?:    CustomVocabEntry | CustomSentenceEntry | null;
  pdfSource?:    string;
  onSaved:       () => void;
  onClose:       () => void;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export const CustomEntryModal: React.FC<Props> = ({
  mode, visible, initialText = '', editEntry = null, pdfSource = '', onSaved, onClose,
}) => {
  const { colors } = useTheme();

  // Animation
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  // Form state
  const [primaryText, setPrimaryText]   = useState(''); // word or sentence
  const [meaningText, setMeaningText]   = useState('');
  const [isSaving, setIsSaving]         = useState(false);

  // Populate fields when modal opens
  useEffect(() => {
    if (visible) {
      if (editEntry) {
        // Editing an existing entry
        if (mode === 'vocab') {
          const e = editEntry as CustomVocabEntry;
          setPrimaryText(e.word);
          setMeaningText(e.meaning);
        } else {
          const e = editEntry as CustomSentenceEntry;
          setPrimaryText(e.sentence);
          setMeaningText(e.meaning);
        }
      } else {
        // New entry — pre-fill from long-press selection
        setPrimaryText(initialText);
        setMeaningText('');
      }

      // Slide in
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
  }, [visible, initialText, editEntry]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const pText = primaryText.trim();
    const mText = meaningText.trim();

    if (!pText) {
      Alert.alert('Empty field', mode === 'vocab' ? 'Please enter a word.' : 'Please enter a sentence.');
      return;
    }
    if (!mText) {
      Alert.alert('Empty field', 'Please enter a meaning or explanation.');
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();

    if (mode === 'vocab') {
      const entry: CustomVocabEntry = {
        word:      pText,
        meaning:   mText,
        createdAt: (editEntry as CustomVocabEntry)?.createdAt ?? now,
        updatedAt: now,
        pdfSource,
      };
      const ok = await saveCustomVocab(entry);
      if (ok) {
        await syncVocabTxt(); // real-time file sync
        onSaved();
        onClose();
      } else {
        Alert.alert('Error', 'Could not save. Please try again.');
      }
    } else {
      const entry: CustomSentenceEntry = {
        sentence:  pText,
        meaning:   mText,
        createdAt: (editEntry as CustomSentenceEntry)?.createdAt ?? now,
        updatedAt: now,
        pdfSource,
      };
      const ok = await saveCustomSentence(entry);
      if (ok) {
        await syncSentencesTxt(); // real-time file sync
        onSaved();
        onClose();
      } else {
        Alert.alert('Error', 'Could not save. Please try again.');
      }
    }

    setIsSaving(false);
  };

  // ── Labels ────────────────────────────────────────────────────────────────

  const isVocab      = mode === 'vocab';
  const title        = editEntry
    ? (isVocab ? 'Edit Vocabulary' : 'Edit Sentence')
    : (isVocab ? 'Add Vocabulary' : 'Add Sentence Note');
  const primaryLabel = isVocab ? 'WORD' : 'SENTENCE';
  const primaryHint  = isVocab ? 'e.g. Robust' : 'Paste or type the sentence…';
  const meaningLabel = isVocab ? 'MEANING' : 'EXPLANATION / MEANING';
  const meaningHint  = isVocab
    ? 'e.g. Strong and successful'
    : 'e.g. The company earned very good profits this quarter.';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Dim backdrop */}
        <Pressable
          style={[s.overlay, { backgroundColor: colors.overlay }]}
          onPress={onClose}
        />

        {/* Sheet */}
        <Animated.View
          style={[
            s.sheet,
            { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Pressable onPress={() => {}}>
            {/* Handle */}
            <View style={s.handleRow}>
              <View style={[s.handle, { backgroundColor: colors.border }]} />
            </View>

            {/* Header */}
            <View style={[s.header, { borderBottomColor: colors.border }]}>
              <View style={[s.iconBadge, { backgroundColor: isVocab ? colors.primary + '22' : colors.accentAmber + '22' }]}>
                <Ionicons
                  name={isVocab ? 'book-outline' : 'chatbubble-outline'}
                  size={18}
                  color={isVocab ? colors.primary : colors.accentAmber}
                />
              </View>
              <Text style={[s.title, { color: colors.text }]}>{title}</Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={s.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Primary field */}
              <Text style={[s.label, { color: colors.textMuted }]}>{primaryLabel}</Text>
              <TextInput
                style={[
                  s.input,
                  isVocab ? s.inputSingle : s.inputMulti,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
                ]}
                value={primaryText}
                onChangeText={setPrimaryText}
                placeholder={primaryHint}
                placeholderTextColor={colors.textMuted}
                autoCapitalize={isVocab ? 'none' : 'sentences'}
                autoCorrect={isVocab ? false : true}
                multiline={!isVocab}
                numberOfLines={isVocab ? 1 : 4}
                returnKeyType={isVocab ? 'next' : 'default'}
              />

              {/* Meaning field */}
              <Text style={[s.label, { color: colors.textMuted, marginTop: Spacing.sm }]}>
                {meaningLabel}
              </Text>
              <TextInput
                style={[
                  s.input,
                  s.inputMulti,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
                ]}
                value={meaningText}
                onChangeText={setMeaningText}
                placeholder={meaningHint}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="sentences"
                multiline
                numberOfLines={4}
              />

              {/* Example hint */}
              <View style={[s.exampleBox, { backgroundColor: colors.primary + '10' }]}>
                <Text style={[s.exampleLabel, { color: colors.textMuted }]}>EXAMPLE</Text>
                {isVocab ? (
                  <>
                    <Text style={[s.exampleLine, { color: colors.textSecondary }]}>Word: Robust</Text>
                    <Text style={[s.exampleLine, { color: colors.textSecondary }]}>Meaning: Strong and successful</Text>
                  </>
                ) : (
                  <>
                    <Text style={[s.exampleLine, { color: colors.textSecondary }]}>
                      Sentence: The company reported robust quarterly earnings.
                    </Text>
                    <Text style={[s.exampleLine, { color: colors.textSecondary }]}>
                      Meaning: The company earned very good profits this quarter.
                    </Text>
                  </>
                )}
              </View>

              {/* Action buttons */}
              <View style={s.btnRow}>
                <TouchableOpacity
                  style={[s.cancelBtn, { borderColor: colors.border }]}
                  onPress={onClose}
                  disabled={isSaving}
                >
                  <Text style={[s.cancelTxt, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    s.saveBtn,
                    { backgroundColor: isVocab ? colors.primary : colors.accentAmber },
                    isSaving && s.saveBtnDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="white" />
                      <Text style={s.saveTxt}>
                        {editEntry ? 'Update' : 'Save'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ height: 32 }} />
            </ScrollView>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  kav:     { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius:  26,
    borderTopRightRadius: 26,
    maxHeight: '90%',
    // Shadow for depth
    elevation:     20,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius:  12,
  },
  handleRow: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:    { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  iconBadge: {
    width: 34, height: 34,
    borderRadius: BorderRadius.sm,
    alignItems:   'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: FontSize.lg, fontWeight: '700' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  label:  { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  input: {
    borderWidth:       1.5,
    borderRadius:      BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    fontSize:          FontSize.md,
    textAlignVertical: 'top',
  },
  inputSingle: { height: 44, textAlignVertical: 'center' },
  inputMulti:  { minHeight: 90 },
  exampleBox: {
    borderRadius: BorderRadius.md,
    padding:      Spacing.sm,
    marginTop:    Spacing.md,
    gap:          3,
  },
  exampleLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginBottom: 4 },
  exampleLine:  { fontSize: FontSize.xs, lineHeight: 18, fontStyle: 'italic' },
  btnRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
    marginTop:     Spacing.md,
  },
  cancelBtn: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius:   BorderRadius.md,
    borderWidth:    1.5,
  },
  cancelTxt: { fontSize: FontSize.md, fontWeight: '600' },
  saveBtn: {
    flex:           2,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 12,
    borderRadius:   BorderRadius.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveTxt: { color: 'white', fontSize: FontSize.md, fontWeight: '700' },
});
