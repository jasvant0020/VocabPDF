// src/screens/QuizScreen.tsx
//
// Multiple-choice quiz sourced from BOTH saved_words + custom_vocab.
// Each question: "What is the meaning of '<word>'?"
// 4 options (1 correct, 3 wrong distractors drawn from the deck).
// Session score tracked; results shown at end.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '../utils/theme';
import { getMergedVocabForQuiz, StudyCard } from '../services/vocabMergeService';

interface Props { navigation: any; }

type OptionState = 'idle' | 'correct' | 'wrong' | 'reveal';

interface Question {
  card:    StudyCard;
  options: string[];       // 4 meanings, shuffled
  correct: number;         // index of correct option
}

// ─── Build quiz questions ──────────────────────────────────────────────────────

const buildQuestions = (cards: StudyCard[]): Question[] => {
  // Need at least 4 cards for distractors
  if (cards.length < 2) return cards.map(card => ({
    card,
    options:  [card.meaning],
    correct:  0,
  }));

  return cards.map(card => {
    // Pick 3 distractors (different cards, different meanings)
    const pool = cards.filter(c => c.key !== card.key);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const distractors = shuffled
      .filter(c => c.meaning !== card.meaning)
      .slice(0, 3)
      .map(c => c.meaning);

    // Pad with generic distractors if not enough
    while (distractors.length < Math.min(3, cards.length - 1)) {
      distractors.push(`None of the above (${distractors.length})`);
    }

    const options = [card.meaning, ...distractors].sort(() => Math.random() - 0.5);
    const correct = options.indexOf(card.meaning);
    return { card, options, correct };
  });
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────

const QUESTIONS_PER_SESSION = 10;

export const QuizScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme();

  const [allCards, setAllCards]   = useState<StudyCard[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIndex, setQIndex]       = useState(0);
  const [score, setScore]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [finished, setFinished]   = useState(false);
  const [selected, setSelected]   = useState<number | null>(null);
  const [optState, setOptState]   = useState<OptionState[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<{ q: Question; picked: number }[]>([]);

  // Shake animation for wrong answer
  const shakeAnim = useRef(new Animated.Value(0)).current;
  // Fade-in for new question
  const fadeAnim  = useRef(new Animated.Value(1)).current;

  const loadQuiz = useCallback(async () => {
    setLoading(true);
    const cards = await getMergedVocabForQuiz();
    setAllCards(cards);
    const subset = cards.slice(0, QUESTIONS_PER_SESSION);
    setQuestions(buildQuestions(subset));
    setQIndex(0);
    setScore(0);
    setSelected(null);
    setOptState([]);
    setFinished(false);
    setWrongAnswers([]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadQuiz(); }, [loadQuiz]));

  const current = questions[qIndex] ?? null;

  const handleSelect = (optIdx: number) => {
    if (selected !== null) return; // already answered
    if (!current) return;

    setSelected(optIdx);
    const correct = current.correct;
    const isRight = optIdx === correct;

    const states: OptionState[] = current.options.map((_, i) => {
      if (i === correct) return 'correct';
      if (i === optIdx && !isRight) return 'wrong';
      return 'reveal';
    });
    setOptState(states);

    if (isRight) {
      setScore(s => s + 1);
    } else {
      setWrongAnswers(w => [...w, { q: current, picked: optIdx }]);
      // Shake wrong option
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6,   duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0,   duration: 50, useNativeDriver: true }),
      ]).start();
    }

    // Auto-advance after 1.2 s
    setTimeout(() => {
      const next = qIndex + 1;
      if (next >= questions.length) {
        setFinished(true);
      } else {
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        setQIndex(next);
        setSelected(null);
        setOptState([]);
      }
    }, 1200);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingTxt, { color: colors.textMuted }]}>Building quiz…</Text>
      </View>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="help-circle-outline" size={64} color={colors.textMuted} />
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

  // ── Results Screen ────────────────────────────────────────────────────────────
  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    const grade = pct >= 80 ? '🏆 Excellent!' : pct >= 60 ? '👍 Good job!' : '📖 Keep studying!';

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <ScrollView contentContainerStyle={styles.resultScroll}>
          {/* Score */}
          <View style={[styles.scoreCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.gradeText, { color: colors.text }]}>{grade}</Text>
            <Text style={[styles.scoreNum, { color: colors.primary }]}>{score}/{questions.length}</Text>
            <Text style={[styles.scorePct, { color: colors.textSecondary }]}>{pct}% correct</Text>

            <View style={[styles.scoreDivider, { backgroundColor: colors.border }]} />

            <View style={styles.scoreBreakdown}>
              <View style={styles.scoreItem}>
                <Ionicons name="checkmark-circle" size={20} color={colors.accentGreen} />
                <Text style={[styles.scoreItemTxt, { color: colors.accentGreen }]}>{score} correct</Text>
              </View>
              <View style={styles.scoreItem}>
                <Ionicons name="close-circle" size={20} color={colors.error ?? '#f44'} />
                <Text style={[styles.scoreItemTxt, { color: colors.error ?? '#f44' }]}>{questions.length - score} wrong</Text>
              </View>
            </View>
          </View>

          {/* Wrong answers review */}
          {wrongAnswers.length > 0 && (
            <>
              <Text style={[styles.reviewTitle, { color: colors.textMuted }]}>REVIEW MISSED WORDS</Text>
              {wrongAnswers.map(({ q, picked }, i) => (
                <View key={i} style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.reviewWord, { color: colors.text }]}>{q.card.word}</Text>
                  <Text style={[styles.reviewCorrect, { color: colors.accentGreen }]}>
                    ✓ {q.options[q.correct]}
                  </Text>
                  <Text style={[styles.reviewWrong, { color: colors.error ?? '#f44' }]}>
                    ✗ {q.options[picked]}
                  </Text>
                  <View style={[styles.reviewBadge, {
                    backgroundColor: q.card.source === 'custom' ? colors.accentAmber + '22' : colors.accentGreen + '22',
                  }]}>
                    <Text style={[styles.reviewBadgeTxt, {
                      color: q.card.source === 'custom' ? colors.accentAmber : colors.accentGreen,
                    }]}>
                      {q.card.source === 'custom' ? 'CUSTOM' : 'DICTIONARY'}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Actions */}
          <View style={styles.resultActions}>
            <TouchableOpacity
              style={[styles.resultBtn, { backgroundColor: colors.primary }]}
              onPress={loadQuiz}
            >
              <Ionicons name="refresh-outline" size={18} color="white" />
              <Text style={styles.resultBtnTxt}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.resultBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="home-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.resultBtnTxt, { color: colors.textSecondary }]}>Home</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  // ── Quiz Question ──────────────────────────────────────────────────────────────

  const progress = (qIndex + 1) / questions.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Quiz</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>
            Question {qIndex + 1} of {questions.length} · Score: {score}
          </Text>
        </View>
        {/* Source legend */}
        <View style={[
          styles.sourceBadge,
          { backgroundColor: current?.card.source === 'custom' ? colors.accentAmber + '22' : colors.accentGreen + '22' },
        ]}>
          <Text style={[
            styles.sourceBadgeTxt,
            { color: current?.card.source === 'custom' ? colors.accentAmber : colors.accentGreen },
          ]}>
            {current?.card.source === 'custom' ? 'CUSTOM' : 'DICT'}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
        <Animated.View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: colors.primary }]} />
      </View>

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={styles.questionArea}
        scrollEnabled={false}
      >
        {/* Question */}
        <View style={[styles.questionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.questionLabel, { color: colors.textMuted }]}>WHAT IS THE MEANING OF</Text>
          <Text style={[styles.questionWord, { color: colors.text }]}>{current?.card.word ?? ''}</Text>
          {current?.card.partOfSpeech ? (
            <Text style={[styles.questionPos, { color: colors.textMuted }]}>{current.card.partOfSpeech}</Text>
          ) : null}
        </View>

        {/* Options */}
        {current?.options.map((opt, i) => {
          const state = optState[i] ?? 'idle';
          const bgColor = state === 'correct'
            ? colors.accentGreen + '33'
            : state === 'wrong'
            ? (colors.error ?? '#f44') + '33'
            : state === 'reveal' && selected !== null
            ? colors.border + '55'
            : colors.surface;
          const borderColor = state === 'correct'
            ? colors.accentGreen
            : state === 'wrong'
            ? colors.error ?? '#f44'
            : colors.border;

          return (
            <Animated.View
              key={i}
              style={{ transform: [{ translateX: state === 'wrong' ? shakeAnim : new Animated.Value(0) }] }}
            >
              <TouchableOpacity
                style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]}
                onPress={() => handleSelect(i)}
                disabled={selected !== null}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIndex, {
                  backgroundColor: state === 'correct' ? colors.accentGreen : state === 'wrong' ? (colors.error ?? '#f44') : colors.primary + '22',
                }]}>
                  <Text style={[styles.optionIndexTxt, {
                    color: state === 'correct' || state === 'wrong' ? 'white' : colors.primary,
                  }]}>
                    {['A', 'B', 'C', 'D'][i]}
                  </Text>
                </View>
                <Text style={[styles.optionTxt, { color: colors.text, flex: 1 }]} numberOfLines={3}>
                  {opt}
                </Text>
                {state === 'correct' && <Ionicons name="checkmark-circle" size={20} color={colors.accentGreen} />}
                {state === 'wrong'   && <Ionicons name="close-circle"     size={20} color={colors.error ?? '#f44'} />}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
};

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
  backBtn:        { padding: 4 },
  headerTitle:    { fontSize: FontSize.lg, fontWeight: '800' },
  headerSub:      { fontSize: FontSize.xs },
  sourceBadge:    { borderRadius: BorderRadius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  sourceBadgeTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  progressBg:   { height: 4, marginHorizontal: Spacing.md, borderRadius: 2, overflow: 'hidden', marginBottom: Spacing.md },
  progressFill: { height: '100%', borderRadius: 2 },

  questionArea: { padding: Spacing.md, gap: Spacing.sm },
  questionCard: {
    borderRadius: BorderRadius.xl,
    borderWidth:  1,
    padding:      Spacing.lg,
    alignItems:   'center',
    gap:          Spacing.xs,
    marginBottom: Spacing.sm,
  },
  questionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  questionWord:  { fontSize: 30, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  questionPos:   { fontSize: FontSize.sm, fontStyle: 'italic' },

  optionBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.sm,
    borderRadius:   BorderRadius.lg,
    borderWidth:    1.5,
    padding:        Spacing.sm,
    marginBottom:   Spacing.xs,
  },
  optionIndex: {
    width: 32, height: 32,
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  optionIndexTxt: { fontSize: FontSize.sm, fontWeight: '800' },
  optionTxt:      { fontSize: FontSize.sm, lineHeight: 20 },

  // Results
  resultScroll:  { padding: Spacing.md },
  scoreCard: {
    borderRadius: BorderRadius.xl,
    borderWidth:  1,
    padding:      Spacing.xl,
    alignItems:   'center',
    gap:          Spacing.sm,
    marginBottom: Spacing.lg,
  },
  gradeText:    { fontSize: FontSize.xl, fontWeight: '800' },
  scoreNum:     { fontSize: 56, fontWeight: '900', lineHeight: 64 },
  scorePct:     { fontSize: FontSize.lg },
  scoreDivider: { width: '60%', height: 1, marginVertical: Spacing.sm },
  scoreBreakdown: { flexDirection: 'row', gap: Spacing.xl },
  scoreItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scoreItemTxt: { fontSize: FontSize.sm, fontWeight: '600' },

  reviewTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: Spacing.sm },
  reviewCard: {
    borderRadius: BorderRadius.lg,
    borderWidth:  1,
    padding:      Spacing.md,
    marginBottom: Spacing.sm,
    gap:          4,
  },
  reviewWord:     { fontSize: FontSize.lg, fontWeight: '800' },
  reviewCorrect:  { fontSize: FontSize.sm },
  reviewWrong:    { fontSize: FontSize.sm },
  reviewBadge:    { alignSelf: 'flex-start', borderRadius: BorderRadius.sm, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  reviewBadgeTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  resultActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  resultBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 14,
    borderRadius:   BorderRadius.lg,
  },
  resultBtnTxt: { color: 'white', fontSize: FontSize.md, fontWeight: '700' },
});
