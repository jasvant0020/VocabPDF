// src/screens/SavedWordsScreen.tsx
//
// CHANGED:
//   - Long-press a word card to enter SELECTION MODE
//     · Selected cards get a highlight + checkmark
//     · Selection toolbar shows count + Bulk Delete + Export Selected (TXT / HTML)
//     · Tap again to deselect; tap "✕" or press back to cancel selection
//   - Export Dictionary Words card moved here from NotesScreen

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  StatusBar,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../utils/ThemeContext";
import {
  getAllWords,
  searchWords,
  deleteWord,
  SavedWord,
} from "../database/database";
import { exportAsTxt, exportAsHtml } from "../services/exportService";
import { BorderRadius, FontSize, Spacing } from "../utils/theme";

export const SavedWordsScreen: React.FC<{ navigation: any }> = ({
  navigation,
}) => {
  const { colors, isDark } = useTheme();

  const [words, setWords] = useState<SavedWord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // ── Selection state ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // ── Export spinner ──────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState<"txt" | "html" | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadWords();
    }, []),
  );

  const loadWords = async () => {
    const data = await getAllWords();
    setWords(data);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length > 0) {
      setIsSearching(true);
      const results = await searchWords(query);
      setWords(results);
      setIsSearching(false);
    } else {
      loadWords();
    }
  };

  // ── Single delete ───────────────────────────────────────────────────────────
  const handleDelete = (word: SavedWord) => {
    Alert.alert("Delete Word", `Remove "${word.word}" from your vocabulary?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (word.id) {
            await deleteWord(word.id);
            await loadWords();
            if (expandedId === word.id) setExpandedId(null);
            // Remove from selection if selected
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(word.id!);
              return next;
            });
          }
        },
      },
    ]);
  };

  // ── Selection mode ──────────────────────────────────────────────────────────
  const enterSelectionMode = (id: number) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
    setExpandedId(null); // collapse any expanded card
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) {
          // Auto-exit if nothing left selected
          setSelectionMode(false);
        }
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(words.map((w) => w.id!).filter(Boolean)));
  };

  // ── Bulk delete ─────────────────────────────────────────────────────────────
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "Delete Selected",
      `Remove ${selectedIds.size} word${selectedIds.size > 1 ? "s" : ""} from your vocabulary?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            for (const id of selectedIds) {
              await deleteWord(id);
            }
            exitSelectionMode();
            await loadWords();
          },
        },
      ],
    );
  };

  // ── Export all dictionary words ─────────────────────────────────────────────
  const handleExportTxt = async () => {
    if (words.length === 0) {
      Alert.alert("No Words", "Save some words from dictionary lookup first.");
      return;
    }
    setExporting("txt");
    const ok = await exportAsTxt(words);
    setExporting(null);
    if (!ok)
      Alert.alert("Export Failed", "Could not export. Please try again.");
  };

  const handleExportHtml = async () => {
    if (words.length === 0) {
      Alert.alert("No Words", "Save some words from dictionary lookup first.");
      return;
    }
    setExporting("html");
    const ok = await exportAsHtml(words);
    setExporting(null);
    if (!ok)
      Alert.alert("Export Failed", "Could not export. Please try again.");
  };

  // ── Export selected words ───────────────────────────────────────────────────
  const handleExportSelectedTxt = async () => {
    const selected = words.filter((w) => w.id && selectedIds.has(w.id));
    if (selected.length === 0) return;
    setExporting("txt");
    const ok = await exportAsTxt(selected);
    setExporting(null);
    if (!ok) Alert.alert("Export Failed", "Could not export selection.");
  };

  const handleExportSelectedHtml = async () => {
    const selected = words.filter((w) => w.id && selectedIds.has(w.id));
    if (selected.length === 0) return;
    setExporting("html");
    const ok = await exportAsHtml(selected);
    setExporting(null);
    if (!ok) Alert.alert("Export Failed", "Could not export selection.");
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const parseSynonyms = (synonymsJson: string): string[] => {
    try {
      const parsed = JSON.parse(synonymsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  // ── Word card ────────────────────────────────────────────────────────────────
  const renderWordCard = ({ item }: { item: SavedWord }) => {
    const synonyms = parseSynonyms(item.synonyms);
    const isExpanded = !selectionMode && expandedId === item.id;
    const isSelected = item.id !== undefined && selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: isSelected
              ? colors.primary + "18"
              : colors.surface,
            borderColor: isSelected ? colors.primary : colors.border,
          },
        ]}
        onPress={() => {
          if (selectionMode) {
            toggleSelect(item.id!);
          } else {
            setExpandedId(isExpanded ? null : (item.id ?? null));
          }
        }}
        onLongPress={() => {
          if (!selectionMode && item.id !== undefined) {
            enterSelectionMode(item.id);
          }
        }}
        delayLongPress={350}
        activeOpacity={0.8}
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.wordRow}>
            {selectionMode && (
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: isSelected
                      ? colors.primary
                      : "transparent",
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                {isSelected && (
                  <Ionicons name="checkmark" size={12} color="white" />
                )}
              </View>
            )}
            <Text style={[styles.wordText, { color: colors.primary }]}>
              {item.word}
            </Text>
            {item.partOfSpeech && item.partOfSpeech !== "unknown" && (
              <Text
                style={[
                  styles.posTag,
                  { color: colors.textMuted, borderColor: colors.border },
                ]}
              >
                {item.partOfSpeech}
              </Text>
            )}
          </View>

          {/* Actions — only show in normal mode */}
          {!selectionMode && (
            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => handleDelete(item)}
                style={[
                  styles.deleteBtn,
                  { backgroundColor: colors.error + "15" },
                ]}
              >
                <Ionicons name="trash-outline" size={15} color={colors.error} />
              </TouchableOpacity>
              <Ionicons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.textMuted}
              />
            </View>
          )}
        </View>

        {/* Meaning preview */}
        <Text
          style={[styles.meaningText, { color: colors.textSecondary }]}
          numberOfLines={isExpanded ? undefined : 2}
        >
          {item.meaning}
        </Text>

        {/* Expanded content */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {synonyms.length > 0 && (
              <View style={styles.synonymsSection}>
                <Text
                  style={[styles.sectionLabel, { color: colors.textMuted }]}
                >
                  SYNONYMS
                </Text>
                <View style={styles.chipsRow}>
                  {synonyms.map((syn, i) => (
                    <View
                      key={i}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: colors.primary + "18",
                          borderColor: colors.primary + "35",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: colors.primaryLight },
                        ]}
                      >
                        {syn}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {item.example ? (
              <View
                style={[
                  styles.exampleBox,
                  { backgroundColor: colors.accentGreen + "12" },
                ]}
              >
                <Text
                  style={[styles.sectionLabel, { color: colors.textMuted }]}
                >
                  EXAMPLE
                </Text>
                <Text style={[styles.exampleText, { color: colors.text }]}>
                  "{item.example}"
                </Text>
              </View>
            ) : null}

            <View style={styles.metaRow}>
              {item.pdfSource ? (
                <View style={styles.metaItem}>
                  <Ionicons
                    name="document-text-outline"
                    size={12}
                    color={colors.textMuted}
                  />
                  <Text
                    style={[styles.metaText, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {item.pdfSource.replace(".pdf", "")}
                  </Text>
                </View>
              ) : null}
              <View style={styles.metaItem}>
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={colors.textMuted}
                />
                <Text style={[styles.metaText, { color: colors.textMuted }]}>
                  {formatDate(item.savedDate)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      {/* ── Header — normal / selection mode ──────────────────────────────── */}
      {selectionMode ? (
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={exitSelectionMode} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {selectedIds.size} selected
            </Text>
            <TouchableOpacity onPress={selectAll}>
              <Text style={[styles.subtitle, { color: colors.primary }]}>
                Select all ({words.length})
              </Text>
            </TouchableOpacity>
          </View>
          {/* Bulk actions */}
          <TouchableOpacity
            style={[
              styles.selectionActionBtn,
              { backgroundColor: colors.primary + "18" },
            ]}
            onPress={handleExportSelectedTxt}
            disabled={selectedIds.size === 0 || !!exporting}
          >
            {exporting === "txt" ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons
                name="document-text-outline"
                size={18}
                color={colors.primary}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.selectionActionBtn,
              { backgroundColor: colors.accentGreen + "18" },
            ]}
            onPress={handleExportSelectedHtml}
            disabled={selectedIds.size === 0 || !!exporting}
          >
            {exporting === "html" ? (
              <ActivityIndicator color={colors.accentGreen} size="small" />
            ) : (
              <Ionicons
                name="globe-outline"
                size={18}
                color={colors.accentGreen}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.selectionActionBtn,
              { backgroundColor: colors.error + "18" },
            ]}
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              Saved Words
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {words.length} word{words.length !== 1 ? "s" : ""} · long-press to
              select
            </Text>
          </View>
        </View>
      )}

      {/* ── Search (hidden in selection mode) ─────────────────────────────── */}
      {!selectionMode && (
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search vocabulary..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch("")}>
              <Ionicons
                name="close-circle"
                size={16}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Word list ──────────────────────────────────────────────────────── */}
      {words.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="bookmark-outline"
            size={64}
            color={colors.textMuted}
          />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            {searchQuery ? "No words found" : "No saved words yet"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            {searchQuery
              ? "Try a different search term"
              : "Open a PDF and look up words to save them here"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={words}
          keyExtractor={(item) => item.id?.toString() ?? item.word}
          renderItem={renderWordCard}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          extraData={[selectedIds, selectionMode, expandedId]}
        />
      )}

      {/* ── Export Dictionary Words card (at bottom, visible in normal mode) ─ */}
      {!selectionMode && words.length > 0 && (
        <View
          style={[
            styles.exportCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.exportTitle, { color: colors.text }]}>
            📚 Export All ({words.length})
          </Text>
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: colors.primary }]}
              onPress={handleExportTxt}
              disabled={!!exporting}
            >
              {exporting === "txt" ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color="white"
                />
              )}
              <Text style={styles.exportBtnText}>TXT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.exportBtn,
                { backgroundColor: colors.accentGreen },
              ]}
              onPress={handleExportHtml}
              disabled={!!exporting}
            >
              {exporting === "html" ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Ionicons name="globe-outline" size={16} color="white" />
              )}
              <Text style={styles.exportBtnText}>HTML</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  backBtn: { padding: 4 },
  title: { fontSize: FontSize.xl, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: FontSize.xs },

  // Selection toolbar buttons
  selectionActionBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, padding: 0 },

  // Empty
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: "600" },
  emptySubtitle: { fontSize: FontSize.sm, textAlign: "center", lineHeight: 20 },

  // Card
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  wordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  wordText: { fontSize: FontSize.xl, fontWeight: "800", letterSpacing: -0.5 },
  posTag: {
    fontSize: FontSize.xs,
    fontStyle: "italic",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  cardActions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  meaningText: { fontSize: FontSize.sm, lineHeight: 20 },
  expandedContent: { marginTop: Spacing.sm, gap: Spacing.sm },
  synonymsSection: { gap: 6 },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: { fontSize: FontSize.xs, fontWeight: "500" },
  exampleBox: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    gap: 4,
  },
  exampleText: { fontSize: FontSize.sm, fontStyle: "italic", lineHeight: 18 },
  metaRow: { flexDirection: "row", gap: Spacing.md, paddingTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  metaText: { fontSize: FontSize.xs, flex: 1 },

  // Export card
  exportCard: {
    margin: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  exportTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  exportButtons: { flexDirection: "row", gap: Spacing.sm },
  exportBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  exportBtnText: { color: "white", fontSize: FontSize.sm, fontWeight: "700" },
});
