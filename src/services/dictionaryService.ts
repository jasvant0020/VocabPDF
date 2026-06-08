// src/services/dictionaryService.ts
// Lookup order:
//   1. SQLite word_cache  (previous online results — instant)
//   2. oxdict table       (34,000+ Oxford entries — instant, offline)
//   3. dictionaryapi.dev  (free REST API — rich data, online only)
//   4. local dictionary.json fallback (150 curated words)

import { lookupOxford, cacheWordDefinition, getCachedWordDefinition } from '../database/database';
import dictionaryData from '../assets/dictionary.json';

export interface WordDefinition {
  word:         string;
  meaning:      string;
  synonyms:     string[];
  example:      string;
  partOfSpeech: string;
  pronunciation?: string;
  etymology?:   string;
  allMeanings?: MeaningBlock[];
  source:       'oxford' | 'cache' | 'online' | 'offline';
}

export interface MeaningBlock {
  partOfSpeech: string;
  definitions:  { definition: string; example?: string; synonyms: string[] }[];
}

interface LocalEntry {
  meaning: string; synonyms: string[]; example: string; partOfSpeech: string;
}
const localDict = dictionaryData as Record<string, LocalEntry>;

// ─── 1. OXFORD DB LOOKUP ─────────────────────────────────────────────────────

const fromOxford = async (word: string): Promise<WordDefinition | null> => {
  const entry = await lookupOxford(word);
  if (!entry || !entry.definition) return null;

  // Build allMeanings from the numbered definitions list
  const allDefs = entry.definitions.length > 0 ? entry.definitions : [entry.definition];
  const allMeanings: MeaningBlock[] = [{
    partOfSpeech: entry.pos,
    definitions:  allDefs.map(d => ({ definition: d, synonyms: [] })),
  }];

  return {
    word:         entry.word,
    meaning:      entry.definition,
    synonyms:     [],
    example:      '',
    partOfSpeech: entry.pos,
    etymology:    entry.etymology || undefined,
    allMeanings,
    source:       'oxford',
  };
};

// ─── 2. ONLINE LOOKUP — dictionaryapi.dev ────────────────────────────────────

export const lookupWordOnline = async (word: string): Promise<WordDefinition | null> => {
  const key = word.toLowerCase().trim();

  // Check cache first
  try {
    const cached = await getCachedWordDefinition(key);
    if (cached) {
      const parsed: WordDefinition = JSON.parse(cached);
      return { ...parsed, source: 'cache' };
    }
  } catch { /* ignore */ }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const resp = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!resp.ok) return null;

    const data: any[] = await resp.json();
    if (!Array.isArray(data) || !data.length) return null;

    const entry     = data[0];
    const phonetics = (entry.phonetics ?? []) as any[];
    const pronunciation = phonetics.find((p: any) => p.text)?.text ?? entry.phonetic ?? '';

    const rawMeanings = (entry.meanings ?? []) as any[];

    const allMeanings: MeaningBlock[] = rawMeanings.map((m: any) => ({
      partOfSpeech: m.partOfSpeech ?? '',
      definitions:  (m.definitions ?? []).slice(0, 4).map((d: any) => ({
        definition: d.definition ?? '',
        example:    d.example    ?? '',
        synonyms:   [...(m.synonyms ?? []), ...(d.synonyms ?? [])].slice(0, 6),
      })),
    }));

    const firstBlock = allMeanings[0];
    const firstDef   = firstBlock?.definitions?.[0];
    if (!firstDef) return null;

    let example = firstDef.example ?? '';
    if (!example) {
      outer: for (const m of rawMeanings) {
        for (const d of m.definitions ?? []) {
          if (d.example) { example = d.example; break outer; }
        }
      }
    }

    const synSet = new Set<string>();
    rawMeanings.forEach((m: any) => {
      (m.synonyms ?? []).forEach((s: string) => synSet.add(s));
      (m.definitions ?? []).forEach((d: any) =>
        (d.synonyms ?? []).forEach((s: string) => synSet.add(s))
      );
    });

    const result: WordDefinition = {
      word:         key,
      meaning:      firstDef.definition,
      synonyms:     [...synSet].slice(0, 12),
      example,
      partOfSpeech: firstBlock?.partOfSpeech ?? '',
      pronunciation,
      allMeanings,
      source:       'online',
    };

    cacheWordDefinition(key, JSON.stringify(result)).catch(() => {});
    return result;
  } catch { return null; }
};

// ─── 3. LOCAL JSON FALLBACK ───────────────────────────────────────────────────

const fromLocal = (word: string): WordDefinition | null => {
  const entry = localDict[word.toLowerCase().trim()];
  if (!entry) return null;
  return {
    word:         word.toLowerCase(),
    meaning:      entry.meaning,
    synonyms:     entry.synonyms ?? [],
    example:      entry.example  ?? '',
    partOfSpeech: entry.partOfSpeech ?? '',
    source:       'offline',
  };
};

// ─── MAIN LOOKUP ─────────────────────────────────────────────────────────────

export const lookupWord = async (
  word: string,
  forceOffline = false,
): Promise<WordDefinition> => {
  const trimmed = word.trim();

  // 1. Oxford DB (offline, instant)
  const oxford = await fromOxford(trimmed);
  if (oxford) {
    // Still try to enrich with online synonyms/examples in the background
    if (!forceOffline) {
      lookupWordOnline(trimmed)
        .then(online => {
          if (online) cacheWordDefinition(trimmed.toLowerCase(), JSON.stringify(online)).catch(() => {});
        })
        .catch(() => {});
    }
    return oxford;
  }

  // 2. Online API (if connected)
  if (!forceOffline) {
    const online = await lookupWordOnline(trimmed);
    if (online) return online;
  }

  // 3. Local JSON
  const local = fromLocal(trimmed);
  if (local) return local;

  // 4. Nothing found
  return {
    word:         trimmed.toLowerCase(),
    meaning:      'Definition not found. The word may be a proper noun, abbreviation, or spelling variant.',
    synonyms:     [],
    example:      '',
    partOfSpeech: '',
    source:       'offline',
  };
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export const getRandomWords = (count: number): WordDefinition[] =>
  Object.keys(localDict)
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map(k => ({
      word: k,
      meaning:      localDict[k].meaning,
      synonyms:     localDict[k].synonyms ?? [],
      example:      localDict[k].example  ?? '',
      partOfSpeech: localDict[k].partOfSpeech ?? '',
      source:       'offline' as const,
    }));

export const getOfflineDictionarySize = (): number => Object.keys(localDict).length;
export { fromLocal as lookupWordOffline };
