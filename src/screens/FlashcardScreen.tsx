// src/screens/FlashcardScreen.tsx
//
// Combines BOTH saved_words + custom_vocab into one shuffled deck.
// Each card shows word on front, meaning + example on back.
//
// Controls:
//   ← / →   navigate cards
//   TAP card flip
//   🔀      reshuffle
//   ✓ / ✗   mark known / unknown (session only — not persisted)

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '../utils/theme';
import { getMergedVocabForStudy, StudyCard } from '../services/vocabMergeService';

const { width } = Dimensions.get('window');

interface Props { navigation: any; }

// ─── CARD FLIP ────────────────────────────────────────────────────────────────

const useFlipAnim = () => {
  const anim      = useRef(new Animated.Value(0)).current;
  const flippedRef = useRef(false);
  const [isFlipped, setIsFlipped] = useState(false);

  const flip = () => {
    const toValue = flippedRef.current ? 0 : 180;
    flippedRef.current = !flippedRef.current;
    setIsFlipped(flippedRef.current);
    Animated.spring(anim, { toValue, friction: 8, tension: 40, useNativeDriver: true }).start();
  };

  const reset = () => {
    flippedRef.current = false;
    setIsFlipped(false);
    anim.setValue(0);
  };

  const frontRotate = anim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] });
  const backRotate  = anim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] });

  return { flip, reset, isFlipped, frontRotate, backRotate };
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export const FlashcardScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const { flip, reset, isFlipped, frontRotate, backRotate } = useFlipAnim();

  const [cards, setCards]       = useState<StudyCard[]>([]);
  const [index, setIndex]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [known, setKnown]       = useState<Set<string>>(new Set());
  const [unknown, setUnknown]   = useState<Set<string>>(new Set());

  // Slide animation between cards
  const slideAnim = useRef(new Animated.Value(0)).current;

  const loadCards = useCallback(async () => {
    setLoading(true);
    const deck = await getMergedVocabForStudy();
    setCards(deck);
    setIndex(0);
    setKnown(new Set());
    setUnknown(new Set());
    reset();
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadCards(); }, [loadCards]));

  const current = cards[index] ?? null;

  // Navigate to next / prev card with slide animation
  const goTo = (dir: 'next' | 'prev') => {
    const dx = dir === 'next' ? -width : width;
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: dx, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -dx, duration: 0, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
    reset();
    setIndex(i => dir === 'next'
      ? Math.min(i + 1, cards.length - 1)
      : Math.max(i - 1, 0)
    );
  };

  const markKnown = () => {
    if (!current) return;
    setKnown(s => new Set([...s, current.key]));
    setUnknown(s => { const n = new Set(s); n.delete(current.key); return n; });
    if (index < cards.length - 1) goTo('next');
  };

  const markUnknown = () => {
    if (!current) return;
    setUnknown(s => new Set([...s, current.key]));
    setKnown(s => { const n = new Set(s); n.delete(current.key); return n; });
    if (index < cards.length - 1) goTo('next');
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingTxt, { color: colors.textMuted }]}>Loading flashcards…</Text>
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="layers-outline" size={64} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No vocabulary yet</Text>
        <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
          Save words from PDF reading or add custom vocab in Notes.
        </Text>
        <TouchableOpacity
          style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.emptyBtnTxt}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCurrentKnown   = current ? known.has(current.key)   : false;
  const isCurrentUnknown = current ? unknown.has(current.key) : false;

  const knownPct   = cards.length > 0 ? Math.round((known.size   / cards.length) * 100) : 0;
  const unknownPct = cards.length > 0 ? Math.round((unknown.size / cards.length) * 100) : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Flashcards</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>
            {index + 1} of {cards.length} · {known.size} known · {unknown.size} learning
          </Text>
        </View>
        <TouchableOpacity onPress={loadCards} style={styles.shuffleBtn}>
          <Ionicons name="shuffle-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Source indicator */}
      <View style={[styles.sourceBar, { backgroundColor: colors.surface }]}>
        <View style={styles.sourceItem}>
          <View style={[styles.sourceDot, { backgroundColor: colors.accentGreen }]} />
          <Text style={[styles.sourceTxt, { color: colors.textMuted }]}>
            Dictionary ({cards.filter(c => c.source === 'saved').length})
          </Text>
        </View>
        <View style={styles.sourceItem}>
          <View style={[styles.sourceDot, { backgroundColor: colors.accentAmber }]} />
          <Text style={[styles.sourceTxt, { color: colors.textMuted }]}>
            Custom ({cards.filter(c => c.source === 'custom').length})
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
        <View style={[styles.progressKnown,   { width: `${knownPct}%`   as any, backgroundColor: colors.accentGreen }]} />
        <View style={[styles.progressUnknown, { width: `${unknownPct}%` as any, backgroundColor: colors.error + '88' }]} />
      </View>

      {/* Card */}
      <Animated.View style={[styles.cardArea, { transform: [{ translateX: slideAnim }] }]}>
        <TouchableOpacity onPress={flip} activeOpacity={0.95} style={styles.cardTouch}>
          {/* Front face */}
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: isCurrentKnown
                  ? colors.accentGreen
                  : isCurrentUnknown
                  ? colors.error
                  : colors.border,
                backfaceVisibility: 'hidden',
                transform: [{ rotateY: frontRotate }],
              },
            ]}
          >
            {/* Source badge */}
            <View style={[
              styles.badge,
              { backgroundColor: current?.source === 'custom' ? colors.accentAmber + '22' : colors.accentGreen + '22' },
            ]}>
              <Text style={[
                styles.badgeTxt,
                { color: current?.source === 'custom' ? colors.accentAmber : colors.accentGreen },
              ]}>
                {current?.source === 'custom' ? 'CUSTOM' : 'DICTIONARY'}
              </Text>
            </View>

            <Text style={[styles.frontWord, { color: colors.text }]}>
              {current?.word ?? ''}
            </Text>
            {current?.partOfSpeech ? (
              <Text style={[styles.pos, { color: colors.textMuted }]}>{current.partOfSpeech}</Text>
            ) : null}
            <Text style={[styles.tapHint, { color: colors.textMuted }]}>tap to reveal →</Text>
          </Animated.View>

          {/* Back face */}
          <Animated.View
            style={[
              styles.card,
              styles.cardBack,
              {
                backgroundColor: colors.surfaceElevated ?? colors.surface,
                borderColor: isCurrentKnown
                  ? colors.accentGreen
                  : isCurrentUnknown
                  ? colors.error
                  : colors.border,
                backfaceVisibility: 'hidden',
                transform: [{ rotateY: backRotate }],
              },
            ]}
          >
            <Text style={[styles.backWord, { color: colors.primary }]}>{current?.word ?? ''}</Text>
            <View style={[styles.backDivider, { backgroundColor: colors.border }]} />
            <Text style={[styles.backMeaning, { color: colors.text }]}>{current?.meaning ?? ''}</Text>
            {current?.example ? (
              <Text style={[styles.backExample, { color: colors.textSecondary }]}>
                "{current.example}"
              </Text>
            ) : null}
            {current?.synonyms?.length > 0 ? (
              <Text style={[styles.backSynonyms, { color: colors.textMuted }]}>
                Synonyms: {current.synonyms.slice(0, 3).join(', ')}
              </Text>
            ) : null}
            {current?.pdfSource ? (
              <Text style={[styles.backSource, { color: colors.textMuted }]}>
                📄 {current.pdfSource.replace('.pdf', '')}
              </Text>
            ) : null}
            <Text style={[styles.tapHint, { color: colors.textMuted }]}>← tap to flip back</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {/* Navigation + mark buttons */}
      <View style={styles.controls}>
        {/* Prev */}
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: index === 0 ? 0.3 : 1 }]}
          onPress={() => goTo('prev')}
          disabled={index === 0}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>

        {/* Mark unknown */}
        <TouchableOpacity
          style={[styles.markBtn, { backgroundColor: (colors.error ?? '#f44') + '22', borderColor: (colors.error ?? '#f44') + '66' }]}
          onPress={markUnknown}
        >
          <Ionicons name="close" size={22} color={colors.error ?? '#f44'} />
          <Text style={[styles.markTxt, { color: colors.error ?? '#f44' }]}>Again</Text>
        </TouchableOpacity>

        {/* Mark known */}
        <TouchableOpacity
          style={[styles.markBtn, { backgroundColor: colors.accentGreen + '22', borderColor: colors.accentGreen + '66' }]}
          onPress={markKnown}
        >
          <Ionicons name="checkmark" size={22} color={colors.accentGreen} />
          <Text style={[styles.markTxt, { color: colors.accentGreen }]}>Got it</Text>
        </TouchableOpacity>

        {/* Next */}
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: index === cards.length - 1 ? 0.3 : 1 }]}
          onPress={() => goTo('next')}
          disabled={index === cards.length - 1}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const CARD_H = 320;

const styles = StyleSheet.create({
  container: { flex: 1 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: Spacing.md },
  loadingTxt:  { fontSize: FontSize.sm, marginTop: Spacing.sm },
  emptyTitle:  { fontSize: FontSize.xl, fontWeight: '700' },
  emptyBody:   { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  emptyBtn:    { paddingVertical: 12, paddingHorizontal: 28, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  emptyBtnTxt: { color: 'white', fontWeight: '700', fontSize: FontSize.md },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingTop:        Platform.OS === 'android' ? 52 : 56,
    paddingHorizontal: Spacing.md,
    paddingBottom:     Spacing.sm,
    borderBottomWidth: 1,
    gap:               Spacing.sm,
  },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  headerSub:   { fontSize: FontSize.xs },
  shuffleBtn:  { padding: 4 },

  sourceBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingVertical: 8,
  },
  sourceItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sourceDot:  { width: 8, height: 8, borderRadius: 4 },
  sourceTxt:  { fontSize: FontSize.xs, fontWeight: '500' },

  progressBg: {
    height: 4,
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  progressKnown:   { height: '100%' },
  progressUnknown: { height: '100%' },

  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  cardTouch: { width: '100%', height: CARD_H },
  card: {
    position:       'absolute',
    width:          '100%',
    height:         CARD_H,
    borderRadius:   BorderRadius.xl,
    borderWidth:    2,
    padding:        Spacing.lg,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing.sm,
    elevation:      8,
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 6 },
    shadowOpacity:  0.2,
    shadowRadius:   12,
  },
  cardBack: { justifyContent: 'flex-start', paddingTop: Spacing.lg },
  badge: {
    position: 'absolute', top: Spacing.md, right: Spacing.md,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeTxt:     { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  frontWord:    { fontSize: 36, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  pos:          { fontSize: FontSize.sm, fontStyle: 'italic' },
  tapHint:      { fontSize: FontSize.xs, position: 'absolute', bottom: Spacing.md },
  backWord:     { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  backDivider:  { width: '80%', height: 1, marginVertical: Spacing.xs },
  backMeaning:  { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  backExample:  { fontSize: FontSize.sm, fontStyle: 'italic', textAlign: 'center', lineHeight: 20 },
  backSynonyms: { fontSize: FontSize.xs, textAlign: 'center' },
  backSource:   { fontSize: FontSize.xs, marginTop: Spacing.sm },

  controls: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.lg,
    paddingBottom:     Platform.OS === 'android' ? Spacing.lg : 32,
  },
  navBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  markBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            5,
    paddingVertical: 12,
    borderRadius:   BorderRadius.lg,
    borderWidth:    1.5,
  },
  markTxt: { fontSize: FontSize.sm, fontWeight: '700' },
});
