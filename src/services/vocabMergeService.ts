// src/services/vocabMergeService.ts
//
// Single source of truth for all vocabulary study features.
// Combines saved_words (dictionary lookups) + custom_vocab (user-created)
// into one deduplicated, shuffled StudyCard[].
//
// Used by:
//   FlashcardScreen → getMergedVocabForStudy()
//   QuizScreen      → getMergedVocabForQuiz()
//   HomeScreen      → getMergedVocabCount()

import {
  getAllWords,
  getAllCustomVocab,
  SavedWord,
  CustomVocabEntry,
} from '../database/database';

// ─── PUBLIC TYPE ──────────────────────────────────────────────────────────────

export interface StudyCard {
  /** Unique key — prefixed to avoid id collisions across tables */
  key:          string;
  word:         string;
  meaning:      string;
  example:      string;
  synonyms:     string[];
  partOfSpeech?: string;
  pdfSource?:   string;
  /** 'saved' = from dictionary lookup; 'custom' = user-created */
  source:       'saved' | 'custom';
}

// ─── CONVERTERS ───────────────────────────────────────────────────────────────

const savedWordToCard = (w: SavedWord): StudyCard => ({
  key:         `saved_${w.id}`,
  word:        w.word,
  meaning:     w.meaning,
  example:     w.example         ?? '',
  synonyms:    (() => { try { return JSON.parse(w.synonyms) || []; } catch { return []; } })(),
  partOfSpeech: w.partOfSpeech   ?? undefined,
  pdfSource:   w.pdfSource       ?? undefined,
  source:      'saved',
});

const customVocabToCard = (e: CustomVocabEntry): StudyCard => ({
  key:         `custom_${e.id}`,
  word:        e.word,
  meaning:     e.meaning,
  example:     '',
  synonyms:    [],
  partOfSpeech: undefined,
  pdfSource:   e.pdfSource ?? undefined,
  source:      'custom',
});

// ─── CORE MERGE ───────────────────────────────────────────────────────────────

/**
 * Fetch and merge both tables.
 * Deduplication: if a word appears in both tables, the saved_words entry wins
 * (it has richer data: example, synonyms, POS). Custom entry is skipped.
 * The result is shuffled with Fisher-Yates so every session differs.
 */
export const getMergedVocabForStudy = async (): Promise<StudyCard[]> => {
  const [savedWords, customVocab] = await Promise.all([
    getAllWords(),
    getAllCustomVocab(),
  ]);

  const savedWordSet = new Set(savedWords.map(w => w.word.toLowerCase()));

  const savedCards  = savedWords.map(savedWordToCard);
  const customCards = customVocab
    .filter(e => !savedWordSet.has(e.word.toLowerCase()))
    .map(customVocabToCard);

  const combined = [...savedCards, ...customCards];

  // Fisher-Yates shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined;
};

/**
 * Same as getMergedVocabForStudy but filters out cards with empty meanings
 * (safety guard) and optionally limits to `limit` cards.
 */
export const getMergedVocabForQuiz = async (limit = 0): Promise<StudyCard[]> => {
  const all = (await getMergedVocabForStudy()).filter(c => c.meaning.trim().length > 0);
  return limit > 0 ? all.slice(0, limit) : all;
};

/** Total unique study-ready vocabulary count (saved + custom, deduplicated). */
export const getMergedVocabCount = async (): Promise<number> => {
  return (await getMergedVocabForStudy()).length;
};
