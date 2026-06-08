// src/services/backupService.ts
//
// PURPOSE
// -------
// Implements backup (export) and restore (import) for custom_vocab and
// custom_sentences.  Export writes the two auto-maintained TXT files to the
// share sheet so the user can save them anywhere.  Import reads user-selected
// files via DocumentPicker (SAF), validates the format, merges entries into
// SQLite without overwriting existing data by default, and triggers a TXT
// re-sync so the auto-exported files stay up to date.
//
// FILE FORMAT (must match autoExportService.ts exactly)
// -------------------------------------------------------
//   vocabulary.txt
//     # ... comment lines ignored
//     Word: <word>
//     Meaning: <meaning>
//     Source: <optional>
//     <blank line>
//     ---
//     <blank line>
//
//   sentences.txt
//     # ... comment lines ignored
//     Sentence:
//     <sentence text, may be multi-line up to blank line>
//
//     Meaning:
//     <meaning text, may be multi-line up to blank line>
//     Source: <optional>
//     <blank line>
//     ---
//     <blank line>
//
// NOTE: Both old format (no ---) and new format (with ---) are supported
// on import for backwards compatibility.

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem      from 'expo-file-system/legacy';
import * as Sharing         from 'expo-sharing';

import {
  importCustomVocabBatch,
  importCustomSentencesBatch,
  CustomVocabEntry,
  CustomSentenceEntry,
} from '../database/database';

import {
  syncVocabTxt,
  syncSentencesTxt,
  getExportPaths,
} from './autoExportService';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface ImportSummary {
  imported: number;
  skipped:  number;
  invalid:  number;
  total:    number;
}

export type ImportTarget = 'vocab' | 'sentences' | 'all';

// ─── EXPORT (share) ──────────────────────────────────────────────────────────

/** Share vocabulary.txt via the system share sheet. */
export const shareVocabFile = async (): Promise<boolean> => {
  try {
    // Always sync first to ensure the file is up-to-date with ALL entries
    await syncVocabTxt();

    const { vocab } = getExportPaths();
    const info = await FileSystem.getInfoAsync(vocab);
    if (!info.exists) return false;

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(vocab, {
      mimeType:    'text/plain',
      dialogTitle: 'Share Vocabulary Notes',
    });
    return true;
  } catch (err) {
    console.error('[Backup] shareVocabFile:', err);
    return false;
  }
};

/** Share sentences.txt via the system share sheet. */
export const shareSentencesFile = async (): Promise<boolean> => {
  try {
    // Always sync first to ensure the file is up-to-date with ALL entries
    await syncSentencesTxt();

    const { sentences } = getExportPaths();
    const info = await FileSystem.getInfoAsync(sentences);
    if (!info.exists) return false;

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(sentences, {
      mimeType:    'text/plain',
      dialogTitle: 'Share Sentence Notes',
    });
    return true;
  } catch (err) {
    console.error('[Backup] shareSentencesFile:', err);
    return false;
  }
};

/** Share both files in sequence. */
export const shareAllFiles = async (): Promise<void> => {
  await shareVocabFile();
  await shareSentencesFile();
};

// ─── IMPORT ──────────────────────────────────────────────────────────────────

/** Open the Android/iOS file picker (SAF) and return the file content. */
const pickAndReadFile = async (): Promise<string | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type:       'text/plain',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const uri     = result.assets[0].uri;
  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return content;
};

// ─── VOCABULARY PARSER ───────────────────────────────────────────────────────

/**
 * Parse vocabulary.txt content into CustomVocabEntry[].
 * Supports both old format (blank-line separated) and new format (--- separated).
 * Skips comment lines (#) and any malformed entry blocks.
 * Returns { entries, invalid } so the caller can display a summary.
 */
export const parseVocabTxt = (
  content: string
): { entries: CustomVocabEntry[]; invalid: number } => {
  const entries: CustomVocabEntry[] = [];
  let invalid = 0;

  // Normalize: treat --- as a block separator by replacing with double newline
  // This makes old and new format behave identically.
  const normalized = content.replace(/^---\s*$/gm, '\n');

  // Split into blocks separated by blank lines
  const blocks = normalized
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean);

  const now = new Date().toISOString();

  for (const block of blocks) {
    // Skip comment-only blocks
    const lines = block.split('\n').filter(l => !l.trim().startsWith('#'));
    if (lines.length === 0) continue;

    let word    = '';
    let meaning = '';
    let source  = '';

    for (const line of lines) {
      if (line.startsWith('Word:'))    word    = line.slice(5).trim();
      if (line.startsWith('Meaning:')) meaning = line.slice(8).trim();
      if (line.startsWith('Source:'))  source  = line.slice(7).trim();
    }

    if (!word || !meaning) { invalid++; continue; }

    entries.push({
      word,
      meaning,
      createdAt: now,
      updatedAt: now,
      pdfSource: source,
    });
  }

  return { entries, invalid };
};

// ─── SENTENCES PARSER ─────────────────────────────────────────────────────────

/**
 * Parse sentences.txt content.
 * Supports both old format (blank-line separated) and new format (--- separated).
 * Each block has:
 *   Sentence:
 *   <text>
 *
 *   Meaning:
 *   <text>
 *
 * Both "Sentence:" and "Meaning:" may span multiple lines.
 */
export const parseSentencesTxt = (
  content: string
): { entries: CustomSentenceEntry[]; invalid: number } => {
  const entries: CustomSentenceEntry[] = [];
  let invalid = 0;

  // Normalize: treat --- as a block separator
  const normalized = content.replace(/^---\s*$/gm, '\n');

  // Split into blocks by double newlines
  const blocks = normalized
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean);

  const now = new Date().toISOString();

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => !l.trim().startsWith('#') && l.trim() !== '');
    if (lines.length === 0) continue;

    // State machine: collect sentence lines then meaning lines
    let mode: 'none' | 'sentence' | 'meaning' = 'none';
    const sentenceLines: string[] = [];
    const meaningLines: string[]  = [];
    let source = '';

    for (const line of lines) {
      if (line === 'Sentence:') { mode = 'sentence'; continue; }
      if (line === 'Meaning:')  { mode = 'meaning';  continue; }
      if (line.startsWith('Source:')) { source = line.slice(7).trim(); continue; }

      if (mode === 'sentence') sentenceLines.push(line);
      if (mode === 'meaning')  meaningLines.push(line);
    }

    const sentence = sentenceLines.join(' ').trim();
    const meaning  = meaningLines.join(' ').trim();

    if (!sentence || !meaning) { invalid++; continue; }

    entries.push({
      sentence,
      meaning,
      createdAt: now,
      updatedAt: now,
      pdfSource: source,
    });
  }

  return { entries, invalid };
};

// ─── PUBLIC IMPORT FUNCTIONS ──────────────────────────────────────────────────

/**
 * Let the user pick a vocabulary.txt file, parse it, and merge into DB.
 * Returns ImportSummary or null if the user cancelled.
 */
export const importVocabFromFile = async (
  overwrite = false
): Promise<ImportSummary | null> => {
  const content = await pickAndReadFile();
  if (content === null) return null;

  const { entries, invalid } = parseVocabTxt(content);

  if (entries.length === 0) {
    return { imported: 0, skipped: 0, invalid, total: invalid };
  }

  const { imported, skipped } = await importCustomVocabBatch(entries, overwrite);

  // Keep the auto-export TXT in sync after importing
  await syncVocabTxt();

  return { imported, skipped, invalid, total: entries.length + invalid };
};

/**
 * Let the user pick a sentences.txt file, parse it, and merge into DB.
 */
export const importSentencesFromFile = async (
  overwrite = false
): Promise<ImportSummary | null> => {
  const content = await pickAndReadFile();
  if (content === null) return null;

  const { entries, invalid } = parseSentencesTxt(content);

  if (entries.length === 0) {
    return { imported: 0, skipped: 0, invalid, total: invalid };
  }

  const { imported, skipped } = await importCustomSentencesBatch(entries, overwrite);
  await syncSentencesTxt();

  return { imported, skipped, invalid, total: entries.length + invalid };
};

/**
 * Import both files (two separate picker sessions).
 */
export const importAllFromFiles = async (
  overwrite = false
): Promise<{ vocab: ImportSummary | null; sentences: ImportSummary | null }> => {
  const vocab     = await importVocabFromFile(overwrite);
  const sentences = await importSentencesFromFile(overwrite);
  return { vocab, sentences };
};
