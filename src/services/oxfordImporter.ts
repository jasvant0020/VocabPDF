// src/services/oxfordImporter.ts
// Parses the bundled Oxford English Dictionary txt file on first launch
// and imports all 34,000+ entries into SQLite for fast offline lookup.
// Subsequent launches skip the import (flag stored in app_meta).

import * as FileSystem from "expo-file-system/legacy";
import { Asset }       from 'expo-asset';
import { importOxfordBatch, getMeta, setMeta, getOxfordCount } from '../database/database';

// Metro bundler resolves this require() at build time
const OXFORD_ASSET = require('../assets/oxford.txt');

// ─── entry shape returned by the parser ──────────────────────────────────────
interface ParsedEntry {
  word:        string;
  pos:         string;
  definition:  string;
  definitions: string[];
  etymology:   string;
}

// ─── POS detection table ─────────────────────────────────────────────────────
const POS_MAP: [string, string][] = [
  ['n.',       'noun'],
  ['v.',       'verb'],
  ['adj.',     'adjective'],
  ['adv.',     'adverb'],
  ['prep.',    'preposition'],
  ['conj.',    'conjunction'],
  ['int.',     'interjection'],
  ['pron.',    'pronoun'],
  ['abbr.',    'abbreviation'],
  ['prefix',   'prefix'],
  ['suffix',   'suffix'],
  ['predic.',  'predicative'],
  ['colloq.',  'colloquial'],
  ['gram.',    'grammar'],
  ['naut.',    'nautical'],
  ['symb.',    'symbol'],
];

const ETYM_RE   = /\[([^\]]+)\]/g;
const NUM_RE    = /\s+[2-9]\s+[A-Z]/g;

function detectPos(raw: string): string {
  const slice = raw.substring(0, 100);
  for (const [tag, label] of POS_MAP) {
    if (slice.includes(tag)) return label;
  }
  return '';
}

function extractEtymology(raw: string): string {
  const matches = [...raw.matchAll(ETYM_RE)];
  return matches.length ? matches[matches.length - 1][1].trim() : '';
}

function cleanDefinition(raw: string): string {
  // remove all [etymology] blocks
  let text = raw.replace(/\[([^\]]+)\]/g, '');
  // strip —v. —adj. —n. —adv. markers
  text = text.replace(/—[a-z]+\./g, '');
  // strip trailing derivatives like "  abandonment n."
  text = text.replace(/\s{2,}[A-Za-z-]+\w*\s+(n|v|adj|adv|abbr)\.\s*(\([^)]*\))?\s*$/, '');
  // strip leading pos tag "n. " "adj. "
  text = text.replace(/^(n|v|adj|adv|prep|conj|int|pron|abbr|predic|colloq|naut|symb|gram)\.\s*/i, '');
  text = text.replace(/^\(pl\.[^)]*\)\s*/, '');
  return text.replace(/\s+/g, ' ').replace(/\x7f/g, '').trim();
}

function splitNumbered(text: string): string[] {
  // Split on "2 Capital", "3 Capital" etc.
  const parts = text.split(/\s+(?=[2-9]\s+[A-Z])/);
  return parts
    .map(p => p.replace(/^[1-9]\s+/, '').trim())
    .filter(p => p.length > 4);
}

// ─── line-by-line parser ──────────────────────────────────────────────────────

function parseOxfordText(text: string): ParsedEntry[] {
  const lines   = text.split(/\r?\n/);
  const entries: ParsedEntry[] = [];

  let currentWord  = '';
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentWord || !currentLines.length) return;
    const raw = currentLines.join(' ').replace(/\s+/g, ' ').trim();
    if (raw.length < 8) return;

    const pos        = detectPos(raw);
    const etymology  = extractEtymology(raw);
    const cleaned    = cleanDefinition(raw);
    const defs       = splitNumbered(cleaned);
    const primary    = defs[0] ?? cleaned;

    if (primary.length < 4) return;

    entries.push({
      word:        currentWord.toLowerCase().trim().replace(/[0-9]+$/, ''),
      pos,
      definition:  primary,
      definitions: defs.length > 1 ? defs : [],
      etymology,
    });
  };

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    // New headword: line starts with capital, not indented
    if (!line[0] || line[0] === ' ' || line[0] === '\t') {
      if (currentWord && stripped) currentLines.push(stripped);
      continue;
    }

    // Match "Word  definition text" (two+ spaces between headword and rest)
    const m = stripped.match(/^([A-Z][^\s].*?)\s{2,}(.+)/);
    if (m) {
      flush();
      currentWord  = m[1];
      currentLines = [m[2]];
    } else if (/^[A-Z]/.test(stripped)) {
      flush();
      currentWord  = stripped;
      currentLines = [];
    } else {
      if (currentWord) currentLines.push(stripped);
    }
  }
  flush();

  return entries;
}

// ─── public API ──────────────────────────────────────────────────────────────

export type ImportProgress = (loaded: number, total: number) => void;

/**
 * Called once from App.tsx after DB init.
 * Skips if already imported (checks app_meta flag + oxdict row count).
 */
export const ensureOxfordImported = async (
  onProgress?: ImportProgress
): Promise<{ imported: boolean; count: number }> => {
  // Check if already done
  const flag = await getMeta('oxford_imported_v1');
  if (flag === '1') {
    const count = await getOxfordCount();
    if (count > 1000) return { imported: false, count };
  }

  console.log('[Oxford] Starting import…');

  // Resolve the bundled asset to a local URI
  const [asset] = await Asset.loadAsync(OXFORD_ASSET);
  const localUri = asset.localUri ?? asset.uri;
  if (!localUri) throw new Error('Oxford asset URI not available');

  // Read the file
  const text = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  // Parse
  const entries = parseOxfordText(text);
  console.log(`[Oxford] Parsed ${entries.length} entries`);

  // Batch insert — chunks of 500 to keep transaction size reasonable
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    await importOxfordBatch(chunk);
    onProgress?.(Math.min(i + CHUNK, entries.length), entries.length);
  }

  await setMeta('oxford_imported_v1', '1');
  const count = await getOxfordCount();
  console.log(`[Oxford] Import complete. ${count} entries in DB.`);
  return { imported: true, count };
};
