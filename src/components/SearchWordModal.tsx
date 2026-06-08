// src/components/SearchWordModal.tsx
// Online-first lookup with loading state and error handling

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { lookupWord, WordDefinition } from '../services/dictionaryService';
import { BorderRadius, FontSize, Spacing } from '../utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onWordFound: (wordData: WordDefinition) => void;
}

export const SearchWordModal: React.FC<Props> = ({ visible, onClose, onWordFound }) => {
  const { colors } = useTheme();
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');

    try {
      const result = await lookupWord(trimmed);
      setLoading(false);
      setQuery('');
      onClose();
      onWordFound(result);
    } catch {
      setLoading(false);
      setError('Something went wrong. Please try again.');
    }
  };

  const handleClose = () => {
    setQuery('');
    setError('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        onPress={handleClose}
      >
        <Pressable
          style={[styles.container, { backgroundColor: colors.surface }]}
          onPress={() => {}}
        >
          <Text style={[styles.title, { color: colors.text }]}>Search Word</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Online lookup with offline fallback
          </Text>

          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: query ? colors.primary : colors.border,
              },
            ]}
          >
            <Ionicons name="search-outline" size={20} color={colors.textMuted} />
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: colors.text }]}
              placeholder="Enter a word…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={t => { setQuery(t); setError(''); }}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {!!error && (
            <Text style={[styles.errorTxt, { color: colors.error }]}>{error}</Text>
          )}

          <View style={styles.btns}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={handleClose}
            >
              <Text style={[styles.cancelTxt, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.lookupBtn,
                { backgroundColor: query.trim() && !loading ? colors.primary : colors.primary + '55' },
              ]}
              onPress={handleSearch}
              disabled={!query.trim() || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="search" size={16} color="#fff" />
                    <Text style={styles.lookupTxt}>Look Up</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  container: {
    width: '100%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  title: { fontSize: FontSize.xl, fontWeight: '800', marginBottom: 2 },
  subtitle: { fontSize: FontSize.sm, marginBottom: Spacing.md },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: 10,
    marginBottom: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '500',
    padding: 0,
  },
  errorTxt: { fontSize: FontSize.sm, marginBottom: Spacing.sm },
  btns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelTxt: { fontSize: FontSize.md, fontWeight: '600' },
  lookupBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
  },
  lookupTxt: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});
