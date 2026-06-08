// src/database/database.ts
// Singleton DB with promise gate — zero race conditions.
// Tables:
//   saved_words      — user's vocabulary (from dictionary lookup)
//   recent_pdfs      — recently opened PDFs
//   word_cache       — cached online API results
//   oxdict           — Oxford Dictionary imported from bundled txt (FTS-ready)
//   app_meta         — key/value store for flags (e.g. oxford_imported)
//   custom_vocab     — NEW: user's custom word + meaning entries (added during PDF reading)
//   custom_sentences — NEW: user's custom sentence + explanation entries

import * as SQLite from 'expo-sqlite';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface SavedWord {
  id?: number;
  word: string;
  meaning: string;
  synonyms: string;
  example: string;
  partOfSpeech?: string;
  savedDate: string;
  pdfSource?: string;
}

export interface OxfordEntry {
  word: string;
  pos: string;
  definition: string;
  definitions: string[];  // all numbered defs
  etymology: string;
}

/** A user-created vocabulary entry with a custom meaning. */
export interface CustomVocabEntry {
  id?: number;
  word: string;
  meaning: string;
  createdAt: string;   // ISO string
  updatedAt: string;   // ISO string
  pdfSource?: string;  // which PDF this was saved from (optional context)
}

/** A user-created sentence entry with a custom explanation/translation. */
export interface CustomSentenceEntry {
  id?: number;
  sentence: string;
  meaning: string;     // explanation / translation
  createdAt: string;   // ISO string
  updatedAt: string;   // ISO string
  pdfSource?: string;
}

// ─── SINGLETON ────────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;
let _dbReady: Promise<SQLite.SQLiteDatabase> | null = null;

export const getDb = (): Promise<SQLite.SQLiteDatabase> => {
  if (_dbReady) return _dbReady;

  _dbReady = (async () => {
    try {
      _db = await SQLite.openDatabaseAsync('vocabulary_v3.db');
      await _db.execAsync('PRAGMA journal_mode = WAL;');
      await _db.execAsync('PRAGMA foreign_keys = ON;');

      // Original tables — unchanged
      await _db.execAsync(`
        CREATE TABLE IF NOT EXISTS saved_words (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          word           TEXT NOT NULL UNIQUE COLLATE NOCASE,
          meaning        TEXT NOT NULL DEFAULT '',
          synonyms       TEXT NOT NULL DEFAULT '[]',
          example        TEXT NOT NULL DEFAULT '',
          part_of_speech TEXT NOT NULL DEFAULT '',
          saved_date     TEXT NOT NULL,
          pdf_source     TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS recent_pdfs (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT NOT NULL,
          uri         TEXT NOT NULL UNIQUE,
          last_opened TEXT NOT NULL,
          last_page   INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS word_cache (
          word      TEXT PRIMARY KEY COLLATE NOCASE,
          json_data TEXT NOT NULL,
          cached_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS oxdict (
          word        TEXT PRIMARY KEY COLLATE NOCASE,
          pos         TEXT NOT NULL DEFAULT '',
          definition  TEXT NOT NULL DEFAULT '',
          definitions TEXT NOT NULL DEFAULT '[]',
          etymology   TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS app_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      // New tables for custom entries
      await _db.execAsync(`
        CREATE TABLE IF NOT EXISTS custom_vocab (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          word       TEXT NOT NULL UNIQUE COLLATE NOCASE,
          meaning    TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          pdf_source TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS custom_sentences (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          sentence   TEXT NOT NULL UNIQUE,
          meaning    TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          pdf_source TEXT NOT NULL DEFAULT ''
        );
      `);

      return _db;
    } catch (err) {
      _dbReady = null;
      _db = null;
      throw err;
    }
  })();

  return _dbReady;
};

export const initDatabase = async (): Promise<void> => {
  await getDb();
};

// ─── APP META ─────────────────────────────────────────────────────────────────

export const getMeta = async (key: string): Promise<string | null> => {
  try {
    const db  = await getDb();
    const row = await db.getFirstAsync(
      'SELECT value FROM app_meta WHERE key = ?', [key]
    ) as any;
    return row?.value ?? null;
  } catch { return null; }
};

export const setMeta = async (key: string, value: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO app_meta (key,value) VALUES (?,?)', [key, value]
    );
  } catch (err) { console.error('[DB] setMeta:', err); }
};

// ─── OXFORD DICTIONARY ────────────────────────────────────────────────────────

/** Batch insert during first-launch import. Uses a transaction for speed. */
export const importOxfordBatch = async (
  entries: { word: string; pos: string; definition: string; definitions: string[]; etymology: string }[]
): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const e of entries) {
      await db.runAsync(
        `INSERT OR IGNORE INTO oxdict (word, pos, definition, definitions, etymology)
         VALUES (?, ?, ?, ?, ?)`,
        [
          e.word.toLowerCase().trim(),
          e.pos,
          e.definition,
          JSON.stringify(e.definitions),
          e.etymology,
        ]
      );
    }
  });
};

export const lookupOxford = async (word: string): Promise<OxfordEntry | null> => {
  try {
    const db  = await getDb();
    const row = await db.getFirstAsync(
      'SELECT * FROM oxdict WHERE word = ? COLLATE NOCASE',
      [word.toLowerCase().trim()]
    ) as any;
    if (!row) return null;
    return rowToOxford(row);
  } catch (err) {
    console.error('[DB] lookupOxford:', err);
    return null;
  }
};

/** Prefix/fuzzy search for autocomplete */
export const searchOxford = async (query: string, limit = 8): Promise<OxfordEntry[]> => {
  try {
    const db   = await getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM oxdict WHERE word LIKE ? ORDER BY word LIMIT ?',
      [`${query.toLowerCase().trim()}%`, limit]
    ) as any[];
    return rows.map(rowToOxford);
  } catch (err) {
    console.error('[DB] searchOxford:', err);
    return [];
  }
};

export const getOxfordCount = async (): Promise<number> => {
  try {
    const db  = await getDb();
    const row = await db.getFirstAsync('SELECT COUNT(*) AS cnt FROM oxdict') as any;
    return row?.cnt ?? 0;
  } catch { return 0; }
};

const rowToOxford = (row: any): OxfordEntry => ({
  word:        row.word        ?? '',
  pos:         row.pos         ?? '',
  definition:  row.definition  ?? '',
  definitions: (() => { try { return JSON.parse(row.definitions) || []; } catch { return []; } })(),
  etymology:   row.etymology   ?? '',
});

// ─── SAVED WORDS ──────────────────────────────────────────────────────────────

export const saveWord = async (word: SavedWord): Promise<boolean> => {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO saved_words
         (word,meaning,synonyms,example,part_of_speech,saved_date,pdf_source)
       VALUES (?,?,?,?,?,?,?)`,
      [
        word.word.toLowerCase().trim(),
        word.meaning      ?? '',
        word.synonyms     ?? '[]',
        word.example      ?? '',
        word.partOfSpeech ?? '',
        word.savedDate,
        word.pdfSource    ?? '',
      ]
    );
    return true;
  } catch (err) { console.error('[DB] saveWord:', err); return false; }
};

export const getAllWords = async (): Promise<SavedWord[]> => {
  try {
    const db   = await getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM saved_words ORDER BY saved_date DESC'
    ) as any[];
    return rows.map(rowToWord);
  } catch (err) { console.error('[DB] getAllWords:', err); return []; }
};

export const searchWords = async (query: string): Promise<SavedWord[]> => {
  try {
    const db   = await getDb();
    const like = `%${query.trim()}%`;
    const rows = await db.getAllAsync(
      'SELECT * FROM saved_words WHERE word LIKE ? OR meaning LIKE ? ORDER BY saved_date DESC',
      [like, like]
    ) as any[];
    return rows.map(rowToWord);
  } catch (err) { console.error('[DB] searchWords:', err); return []; }
};

export const deleteWord = async (id: number): Promise<boolean> => {
  try {
    const db = await getDb();
    await db.runAsync('DELETE FROM saved_words WHERE id = ?', [id]);
    return true;
  } catch (err) { console.error('[DB] deleteWord:', err); return false; }
};

export const isWordSaved = async (word: string): Promise<boolean> => {
  try {
    const db  = await getDb();
    const row = await db.getFirstAsync(
      'SELECT id FROM saved_words WHERE word = ? COLLATE NOCASE',
      [word.toLowerCase().trim()]
    ) as any;
    return !!row;
  } catch { return false; }
};

export const getWordCount = async (): Promise<number> => {
  try {
    const db  = await getDb();
    const row = await db.getFirstAsync('SELECT COUNT(*) AS cnt FROM saved_words') as any;
    return row?.cnt ?? 0;
  } catch { return 0; }
};

// ─── RECENT PDFS ─────────────────────────────────────────────────────────────

export const saveRecentPdf = async (name: string, uri: string, lastPage = 1): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO recent_pdfs (name,uri,last_opened,last_page) VALUES (?,?,?,?)',
      [name, uri, new Date().toISOString(), lastPage]
    );
  } catch (err) { console.error('[DB] saveRecentPdf:', err); }
};

export const updatePdfLastPage = async (uri: string, page: number): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(
      'UPDATE recent_pdfs SET last_page=?,last_opened=? WHERE uri=?',
      [page, new Date().toISOString(), uri]
    );
  } catch (err) { console.error('[DB] updatePdfLastPage:', err); }
};

export const getRecentPdfs = async (): Promise<any[]> => {
  try {
    const db = await getDb();
    return await db.getAllAsync(
      'SELECT * FROM recent_pdfs ORDER BY last_opened DESC LIMIT 30'
    ) as any[];
  } catch (err) { console.error('[DB] getRecentPdfs:', err); return []; }
};

export const deleteRecentPdf = async (id: number): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync('DELETE FROM recent_pdfs WHERE id = ?', [id]);
  } catch (err) { console.error('[DB] deleteRecentPdf:', err); }
};

// ─── WORD CACHE ───────────────────────────────────────────────────────────────

export const cacheWordDefinition = async (word: string, jsonData: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO word_cache (word,json_data,cached_at) VALUES (?,?,?)',
      [word.toLowerCase().trim(), jsonData, new Date().toISOString()]
    );
  } catch (err) { console.error('[DB] cacheWordDef:', err); }
};

export const getCachedWordDefinition = async (word: string): Promise<string | null> => {
  try {
    const db  = await getDb();
    const row = await db.getFirstAsync(
      'SELECT json_data FROM word_cache WHERE word = ? COLLATE NOCASE',
      [word.toLowerCase().trim()]
    ) as any;
    return row?.json_data ?? null;
  } catch { return null; }
};

// ─── CUSTOM VOCABULARY ────────────────────────────────────────────────────────

/**
 * Save or overwrite a custom vocabulary entry.
 * Uses INSERT OR REPLACE so editing a word works by re-submitting the same word.
 */
export const saveCustomVocab = async (entry: CustomVocabEntry): Promise<boolean> => {
  try {
    const db  = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO custom_vocab (word, meaning, created_at, updated_at, pdf_source)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(word) DO UPDATE SET
         meaning    = excluded.meaning,
         updated_at = excluded.updated_at,
         pdf_source = excluded.pdf_source`,
      [
        entry.word.trim(),
        entry.meaning.trim(),
        entry.createdAt || now,
        now,
        entry.pdfSource ?? '',
      ]
    );
    return true;
  } catch (err) { console.error('[DB] saveCustomVocab:', err); return false; }
};

export const getAllCustomVocab = async (): Promise<CustomVocabEntry[]> => {
  try {
    const db   = await getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM custom_vocab ORDER BY updated_at DESC'
    ) as any[];
    return rows.map(rowToCustomVocab);
  } catch (err) { console.error('[DB] getAllCustomVocab:', err); return []; }
};

export const deleteCustomVocab = async (id: number): Promise<boolean> => {
  try {
    const db = await getDb();
    await db.runAsync('DELETE FROM custom_vocab WHERE id = ?', [id]);
    return true;
  } catch (err) { console.error('[DB] deleteCustomVocab:', err); return false; }
};

export const getCustomVocabCount = async (): Promise<number> => {
  try {
    const db  = await getDb();
    const row = await db.getFirstAsync('SELECT COUNT(*) AS cnt FROM custom_vocab') as any;
    return row?.cnt ?? 0;
  } catch { return 0; }
};

/**
 * Bulk-import for backup/restore — inserts entries, skipping duplicates by default.
 * Returns { imported, skipped } counts.
 */
export const importCustomVocabBatch = async (
  entries: CustomVocabEntry[],
  overwrite = false,
): Promise<{ imported: number; skipped: number }> => {
  const db = await getDb();
  let imported = 0;
  let skipped  = 0;

  await db.withTransactionAsync(async () => {
    for (const e of entries) {
      try {
        if (overwrite) {
          await db.runAsync(
            `INSERT INTO custom_vocab (word, meaning, created_at, updated_at, pdf_source)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(word) DO UPDATE SET
               meaning    = excluded.meaning,
               updated_at = excluded.updated_at`,
            [e.word.trim(), e.meaning.trim(), e.createdAt, e.updatedAt, e.pdfSource ?? '']
          );
          imported++;
        } else {
          const existing = await db.getFirstAsync(
            'SELECT id FROM custom_vocab WHERE word = ? COLLATE NOCASE', [e.word.trim()]
          );
          if (existing) { skipped++; continue; }
          await db.runAsync(
            `INSERT INTO custom_vocab (word, meaning, created_at, updated_at, pdf_source)
             VALUES (?, ?, ?, ?, ?)`,
            [e.word.trim(), e.meaning.trim(), e.createdAt, e.updatedAt, e.pdfSource ?? '']
          );
          imported++;
        }
      } catch { skipped++; }
    }
  });

  return { imported, skipped };
};

// ─── CUSTOM SENTENCES ─────────────────────────────────────────────────────────

export const saveCustomSentence = async (entry: CustomSentenceEntry): Promise<boolean> => {
  try {
    const db  = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO custom_sentences (sentence, meaning, created_at, updated_at, pdf_source)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(sentence) DO UPDATE SET
         meaning    = excluded.meaning,
         updated_at = excluded.updated_at,
         pdf_source = excluded.pdf_source`,
      [
        entry.sentence.trim(),
        entry.meaning.trim(),
        entry.createdAt || now,
        now,
        entry.pdfSource ?? '',
      ]
    );
    return true;
  } catch (err) { console.error('[DB] saveCustomSentence:', err); return false; }
};

export const getAllCustomSentences = async (): Promise<CustomSentenceEntry[]> => {
  try {
    const db   = await getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM custom_sentences ORDER BY updated_at DESC'
    ) as any[];
    return rows.map(rowToCustomSentence);
  } catch (err) { console.error('[DB] getAllCustomSentences:', err); return []; }
};

export const deleteCustomSentence = async (id: number): Promise<boolean> => {
  try {
    const db = await getDb();
    await db.runAsync('DELETE FROM custom_sentences WHERE id = ?', [id]);
    return true;
  } catch (err) { console.error('[DB] deleteCustomSentence:', err); return false; }
};

export const getCustomSentenceCount = async (): Promise<number> => {
  try {
    const db  = await getDb();
    const row = await db.getFirstAsync('SELECT COUNT(*) AS cnt FROM custom_sentences') as any;
    return row?.cnt ?? 0;
  } catch { return 0; }
};

/**
 * Bulk-import for backup/restore.
 */
export const importCustomSentencesBatch = async (
  entries: CustomSentenceEntry[],
  overwrite = false,
): Promise<{ imported: number; skipped: number }> => {
  const db = await getDb();
  let imported = 0;
  let skipped  = 0;

  await db.withTransactionAsync(async () => {
    for (const e of entries) {
      try {
        if (overwrite) {
          await db.runAsync(
            `INSERT INTO custom_sentences (sentence, meaning, created_at, updated_at, pdf_source)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(sentence) DO UPDATE SET
               meaning    = excluded.meaning,
               updated_at = excluded.updated_at`,
            [e.sentence.trim(), e.meaning.trim(), e.createdAt, e.updatedAt, e.pdfSource ?? '']
          );
          imported++;
        } else {
          const existing = await db.getFirstAsync(
            'SELECT id FROM custom_sentences WHERE sentence = ?', [e.sentence.trim()]
          );
          if (existing) { skipped++; continue; }
          await db.runAsync(
            `INSERT INTO custom_sentences (sentence, meaning, created_at, updated_at, pdf_source)
             VALUES (?, ?, ?, ?, ?)`,
            [e.sentence.trim(), e.meaning.trim(), e.createdAt, e.updatedAt, e.pdfSource ?? '']
          );
          imported++;
        }
      } catch { skipped++; }
    }
  });

  return { imported, skipped };
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const rowToWord = (row: any): SavedWord => ({
  id:           row.id,
  word:         row.word          ?? '',
  meaning:      row.meaning       ?? '',
  synonyms:     row.synonyms      ?? '[]',
  example:      row.example       ?? '',
  partOfSpeech: row.part_of_speech ?? '',
  savedDate:    row.saved_date    ?? '',
  pdfSource:    row.pdf_source    ?? '',
});

const rowToCustomVocab = (row: any): CustomVocabEntry => ({
  id:        row.id,
  word:      row.word       ?? '',
  meaning:   row.meaning    ?? '',
  createdAt: row.created_at ?? '',
  updatedAt: row.updated_at ?? '',
  pdfSource: row.pdf_source ?? '',
});

const rowToCustomSentence = (row: any): CustomSentenceEntry => ({
  id:        row.id,
  sentence:  row.sentence   ?? '',
  meaning:   row.meaning    ?? '',
  createdAt: row.created_at ?? '',
  updatedAt: row.updated_at ?? '',
  pdfSource: row.pdf_source ?? '',
});
