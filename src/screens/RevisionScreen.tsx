// src/screens/RevisionScreen.tsx
// Revision mode with Flashcard and MCQ Quiz modes
// Uses saved vocabulary from SQLite database

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { getAllWords, SavedWord } from '../database/database';
import { BorderRadius, FontSize, Spacing } from '../utils/theme';

const { width } = Dimensions.get('window');

type RevisionMode = 'select' | 'flashcard' | 'quiz';

export const RevisionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [mode, setMode] = useState<RevisionMode>('select');
  const [words, setWords] = useState<SavedWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      loadAndShuffle();
      setMode('select');
    }, [])
  );

  const loadAndShuffle = async () => {
    const data = await getAllWords();
    // Shuffle for variety
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    setWords(shuffled);
  };

  const startFlashcard = () => {
    if (words.length === 0) {
      Alert.alert('No Words', 'Save some vocabulary words first!');
      return;
    }
    setCurrentIndex(0);
    setShowAnswer(false);
    flipAnim.setValue(0);
    setMode('flashcard');
  };

  const startQuiz = () => {
    if (words.length < 4) {
      Alert.alert('Need more words', 'Save at least 4 words to start the quiz!');
      return;
    }
    setCurrentIndex(0);
    setScore(0);
    setQuizComplete(false);
    setSelectedOption(null);
    generateOptions(0, words);
    setMode('quiz');
  };

  const generateOptions = (index: number, wordList: SavedWord[]) => {
    const correct = wordList[index];
    const others = wordList.filter((_, i) => i !== index);
    const shuffledOthers = others.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correct, ...shuffledOthers]
      .sort(() => Math.random() - 0.5)
      .map(w => w.meaning.substring(0, 80) + (w.meaning.length > 80 ? '...' : ''));
    setQuizOptions(options);
  };

  // Flashcard flip animation
  const flipCard = () => {
    if (!showAnswer) {
      Animated.spring(flipAnim, {
        toValue: 1,
        tension: 70,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(flipAnim, {
        toValue: 0,
        tension: 70,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
    setShowAnswer(!showAnswer);
  };

  const nextCard = () => {
    const next = (currentIndex + 1) % words.length;
    setCurrentIndex(next);
    setShowAnswer(false);
    flipAnim.setValue(0);
  };

  const prevCard = () => {
    const prev = (currentIndex - 1 + words.length) % words.length;
    setCurrentIndex(prev);
    setShowAnswer(false);
    flipAnim.setValue(0);
  };

  const handleQuizAnswer = (option: string) => {
    if (selectedOption) return; // Already answered
    setSelectedOption(option);

    const correct = words[currentIndex].meaning.substring(0, 80) +
      (words[currentIndex].meaning.length > 80 ? '...' : '');
    const isCorrect = option === correct;
    if (isCorrect) setScore(s => s + 1);

    // Auto advance after 1.5 seconds
    setTimeout(() => {
      const nextIndex = currentIndex + 1;
      if (nextIndex >= words.length) {
        setQuizComplete(true);
      } else {
        setCurrentIndex(nextIndex);
        setSelectedOption(null);
        generateOptions(nextIndex, words);
      }
    }, 1500);
  };

  // Flashcard interpolations
  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const parseSynonyms = (str: string) => {
    try { return JSON.parse(str) || []; } catch { return []; }
  };

  // === SELECT MODE ===
  if (mode === 'select') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Revision Mode</Text>
        </View>

        <View style={styles.modeSelectContainer}>
          <Text style={[styles.selectSubtitle, { color: colors.textSecondary }]}>
            {words.length} words in your vocabulary
          </Text>

          <TouchableOpacity
            style={[styles.modeCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}
            onPress={startFlashcard}
          >
            <View style={[styles.modeIcon, { backgroundColor: colors.primary + '25' }]}>
              <Ionicons name="albums-outline" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.modeTitle, { color: colors.text }]}>Flashcards</Text>
            <Text style={[styles.modeDesc, { color: colors.textSecondary }]}>
              Flip through cards to review words and meanings
            </Text>
            <View style={[styles.modeStart, { backgroundColor: colors.primary }]}>
              <Text style={styles.modeStartText}>Start</Text>
              <Ionicons name="arrow-forward" size={14} color="white" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeCard, { backgroundColor: colors.accentAmber + '15', borderColor: colors.accentAmber + '40' }]}
            onPress={startQuiz}
          >
            <View style={[styles.modeIcon, { backgroundColor: colors.accentAmber + '25' }]}>
              <Ionicons name="help-circle-outline" size={36} color={colors.accentAmber} />
            </View>
            <Text style={[styles.modeTitle, { color: colors.text }]}>Quiz Mode</Text>
            <Text style={[styles.modeDesc, { color: colors.textSecondary }]}>
              Test yourself with multiple choice questions
            </Text>
            <View style={[styles.modeStart, { backgroundColor: colors.accentAmber }]}>
              <Text style={styles.modeStartText}>Start</Text>
              <Ionicons name="arrow-forward" size={14} color="white" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // === FLASHCARD MODE ===
  if (mode === 'flashcard') {
    const current = words[currentIndex];
    const synonyms = parseSynonyms(current.synonyms);

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('select')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Flashcards</Text>
          <Text style={[styles.progressText, { color: colors.textMuted }]}>
            {currentIndex + 1}/{words.length}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.primary, width: `${((currentIndex + 1) / words.length) * 100}%` },
            ]}
          />
        </View>

        {/* Flashcard */}
        <TouchableOpacity style={styles.flashcardContainer} onPress={flipCard} activeOpacity={0.95}>
          {/* Front - Word */}
          <Animated.View
            style={[
              styles.flashcard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              { transform: [{ rotateY: frontRotate }], backfaceVisibility: 'hidden' },
            ]}
          >
            <Text style={[styles.tapHint, { color: colors.textMuted }]}>TAP TO REVEAL MEANING</Text>
            <Text style={[styles.flashcardWord, { color: colors.primary }]}>{current.word}</Text>
            {current.partOfSpeech && current.partOfSpeech !== 'unknown' && (
              <Text style={[styles.flashcardPos, { color: colors.textMuted }]}>
                {current.partOfSpeech}
              </Text>
            )}
            <Ionicons name="eye-outline" size={32} color={colors.textMuted} style={{ marginTop: 20 }} />
          </Animated.View>

          {/* Back - Meaning */}
          <Animated.View
            style={[
              styles.flashcard,
              styles.flashcardBack,
              { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' },
              { transform: [{ rotateY: backRotate }], backfaceVisibility: 'hidden' },
            ]}
          >
            <Text style={[styles.tapHint, { color: colors.textMuted }]}>MEANING</Text>
            <Text style={[styles.flashcardMeaning, { color: colors.text }]}>{current.meaning}</Text>
            {synonyms.length > 0 && (
              <Text style={[styles.flashcardSynonyms, { color: colors.primaryLight }]}>
                ~ {synonyms.slice(0, 3).join(', ')}
              </Text>
            )}
            {current.example ? (
              <Text style={[styles.flashcardExample, { color: colors.textSecondary }]}>
                "{current.example}"
              </Text>
            ) : null}
          </Animated.View>
        </TouchableOpacity>

        {/* Navigation */}
        <View style={styles.navButtons}>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={prevCard}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.flipHintBtn, { backgroundColor: colors.primary + '20' }]}
            onPress={flipCard}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.primary} />
            <Text style={[styles.flipHintText, { color: colors.primary }]}>Flip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={nextCard}
          >
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // === QUIZ MODE ===
  if (mode === 'quiz') {
    if (quizComplete) {
      const percentage = Math.round((score / words.length) * 100);
      return (
        <View style={[styles.container, styles.quizCompleteContainer, { backgroundColor: colors.background }]}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
          <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 56 }}>
              {percentage >= 80 ? '🏆' : percentage >= 60 ? '🎉' : '💪'}
            </Text>
            <Text style={[styles.resultTitle, { color: colors.text }]}>Quiz Complete!</Text>
            <Text style={[styles.resultScore, { color: colors.primary }]}>
              {score}/{words.length}
            </Text>
            <Text style={[styles.resultPercent, { color: colors.textSecondary }]}>
              {percentage}% Correct
            </Text>
            <Text style={[styles.resultMessage, { color: colors.textMuted }]}>
              {percentage >= 80
                ? 'Excellent! You have a strong vocabulary.'
                : percentage >= 60
                ? 'Good job! Keep reviewing to improve.'
                : 'Keep practicing — consistency is key!'}
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setScore(0); startQuiz(); }}
            >
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exitBtn, { borderColor: colors.border }]}
              onPress={() => setMode('select')}
            >
              <Text style={[styles.exitBtnText, { color: colors.textSecondary }]}>Back to Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const current = words[currentIndex];
    const correctMeaning = current.meaning.substring(0, 80) +
      (current.meaning.length > 80 ? '...' : '');

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('select')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Quiz</Text>
          <Text style={[styles.scoreText, { color: colors.accentGreen }]}>
            {score} pts
          </Text>
        </View>

        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accentAmber, width: `${((currentIndex + 1) / words.length) * 100}%` },
            ]}
          />
        </View>

        <View style={styles.quizContainer}>
          <Text style={[styles.questionNum, { color: colors.textMuted }]}>
            Question {currentIndex + 1} of {words.length}
          </Text>
          <Text style={[styles.quizQuestion, { color: colors.text }]}>
            What does <Text style={{ color: colors.primary, fontStyle: 'normal' }}>
              "{current.word}"
            </Text> mean?
          </Text>

          {quizOptions.map((option, i) => {
            let bgColor = colors.surface;
            let borderColor = colors.border;
            let textColor = colors.text;

            if (selectedOption !== null) {
              if (option === correctMeaning) {
                bgColor = colors.success + '25';
                borderColor = colors.success;
                textColor = colors.success;
              } else if (option === selectedOption && option !== correctMeaning) {
                bgColor = colors.error + '20';
                borderColor = colors.error;
                textColor = colors.error;
              }
            }

            return (
              <TouchableOpacity
                key={i}
                style={[styles.quizOption, { backgroundColor: bgColor, borderColor }]}
                onPress={() => handleQuizAnswer(option)}
                disabled={!!selectedOption}
              >
                <View style={[styles.optionLetter, { backgroundColor: borderColor + '30' }]}>
                  <Text style={[styles.optionLetterText, { color: borderColor || colors.textMuted }]}>
                    {String.fromCharCode(65 + i)}
                  </Text>
                </View>
                <Text style={[styles.optionText, { color: textColor }]}>{option}</Text>
                {selectedOption && option === correctMeaning && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                )}
                {selectedOption === option && option !== correctMeaning && (
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: { padding: 4 },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    flex: 1,
    letterSpacing: -0.5,
  },
  progressText: { fontSize: FontSize.sm },
  scoreText: { fontSize: FontSize.lg, fontWeight: '700' },
  progressBar: {
    height: 3,
    marginHorizontal: Spacing.md,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  progressFill: { height: '100%', borderRadius: 2 },

  // Mode Select
  modeSelectContainer: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  selectSubtitle: {
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  modeCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  modeIcon: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modeTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  modeDesc: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  modeStart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    marginTop: 4,
  },
  modeStartText: { color: 'white', fontWeight: '700', fontSize: FontSize.sm },

  // Flashcard
  flashcardContainer: {
    flex: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  flashcard: {
    position: 'absolute',
    width: '100%',
    height: 320,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  flashcardBack: {
    position: 'absolute',
    width: '100%',
    height: 320,
  },
  tapHint: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  flashcardWord: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
  },
  flashcardPos: {
    fontSize: FontSize.md,
    fontStyle: 'italic',
  },
  flashcardMeaning: {
    fontSize: FontSize.lg,
    textAlign: 'center',
    lineHeight: 26,
  },
  flashcardSynonyms: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  flashcardExample: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },
  navButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
    paddingBottom: 40,
    marginTop: 340,
  },
  navBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipHintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
  },
  flipHintText: { fontWeight: '600', fontSize: FontSize.sm },

  // Quiz
  quizContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  questionNum: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  quizQuestion: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    fontStyle: 'italic',
    lineHeight: 30,
    marginBottom: Spacing.sm,
  },
  quizOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  optionLetter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLetterText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  optionText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },

  // Quiz Complete
  quizCompleteContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  resultCard: {
    width: '100%',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  resultTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  resultScore: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  resultPercent: {
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  resultMessage: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    marginVertical: Spacing.sm,
  },
  retryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  retryBtnText: { color: 'white', fontSize: FontSize.lg, fontWeight: '700' },
  exitBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  exitBtnText: { fontSize: FontSize.md, fontWeight: '600' },
});
