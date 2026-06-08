// src/screens/NotesScreen.tsx
// v2.1.0
//
// CHANGED FROM v2.0:
//   - Removed "Export Dictionary Words" card from the Vocabulary tab
//     (moved to SavedWordsScreen where it belongs)
//
// PRESERVED:
//   - Two tabs: Vocabulary / Sentences (custom entries)
//   - Full CRUD: add, edit, delete
//   - Share vocab.txt / sentences.txt
//   - FAB for new entries
//   - handleExportTxt / handleExportHtml kept (still used by SavedWordsScreen
//     via import, but the UI card is no longer rendered here)

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../utils/ThemeContext";
import {
  getAllCustomVocab,
  getAllCustomSentences,
  deleteCustomVocab,
  deleteCustomSentence,
  CustomVocabEntry,
  CustomSentenceEntry,
} from "../database/database";
import { shareVocabFile, shareSentencesFile } from "../services/backupService";
import { CustomEntryModal, EntryMode } from "../components/CustomEntryModal";
import { syncVocabTxt, syncSentencesTxt } from "../services/autoExportService";
import { BorderRadius, FontSize, Spacing } from "../utils/theme";

type Tab = "vocab" | "sentences";

export const NotesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>("vocab");
  const [customVocab, setCustomVocab] = useState<CustomVocabEntry[]>([]);
  const [customSentences, setCustomSentences] = useState<CustomSentenceEntry[]>(
    [],
  );

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editMode, setEditMode] = useState<EntryMode>("vocab");
  const [editEntry, setEditEntry] = useState<
    CustomVocabEntry | CustomSentenceEntry | null
  >(null);

  // ── Load data ───────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, []),
  );

  const loadAll = async () => {
    const [vocab, sentences] = await Promise.all([
      getAllCustomVocab(),
      getAllCustomSentences(),
    ]);
    setCustomVocab(vocab);
    setCustomSentences(sentences);
  };

  // ── FAB ─────────────────────────────────────────────────────────────────────
  const handleFabPress = () => {
    setEditEntry(null);
    setEditMode(activeTab === "vocab" ? "vocab" : "sentence");
    setEditModalVisible(true);
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const confirmDeleteVocab = (entry: CustomVocabEntry) => {
    Alert.alert(
      "Delete Entry",
      `Remove "${entry.word}" from your custom vocabulary?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (entry.id) {
              await deleteCustomVocab(entry.id);
              await syncVocabTxt();
              loadAll();
            }
          },
        },
      ],
    );
  };

  const confirmDeleteSentence = (entry: CustomSentenceEntry) => {
    Alert.alert("Delete Entry", "Remove this sentence note?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (entry.id) {
            await deleteCustomSentence(entry.id);
            await syncSentencesTxt();
            loadAll();
          }
        },
      },
    ]);
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  const openEditVocab = (entry: CustomVocabEntry) => {
    setEditMode("vocab");
    setEditEntry(entry);
    setEditModalVisible(true);
  };

  const openEditSentence = (entry: CustomSentenceEntry) => {
    setEditMode("sentence");
    setEditEntry(entry);
    setEditModalVisible(true);
  };

  // ── Share ────────────────────────────────────────────────────────────────────
  const handleShareVocabTxt = async () => {
    if (customVocab.length === 0) {
      Alert.alert("No Entries", "Add some custom vocabulary entries first.");
      return;
    }
    const ok = await shareVocabFile();
    if (!ok) Alert.alert("Share Failed", "Could not share vocabulary file.");
  };

  const handleShareSentencesTxt = async () => {
    if (customSentences.length === 0) {
      Alert.alert("No Entries", "Add some sentence notes first.");
      return;
    }
    const ok = await shareSentencesFile();
    if (!ok) Alert.alert("Share Failed", "Could not share sentences file.");
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const renderVocabItem = ({ item }: { item: CustomVocabEntry }) => (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardWord, { color: colors.primary }]}>
          {item.word}
        </Text>
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={() => openEditVocab(item)}
            style={[
              styles.actionBtn,
              { backgroundColor: colors.primary + "18" },
            ]}
          >
            <Ionicons name="pencil-outline" size={14} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => confirmDeleteVocab(item)}
            style={[styles.actionBtn, { backgroundColor: colors.error + "18" }]}
          >
            <Ionicons name="trash-outline" size={14} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.cardMeaning, { color: colors.textSecondary }]}>
        {item.meaning}
      </Text>
      {!!item.pdfSource && (
        <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
          📄 {item.pdfSource.replace(".pdf", "")}
        </Text>
      )}
    </View>
  );

  const renderSentenceItem = ({ item }: { item: CustomSentenceEntry }) => (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardSentenceLabel, { color: colors.textMuted }]}>
          SENTENCE
        </Text>
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={() => openEditSentence(item)}
            style={[
              styles.actionBtn,
              { backgroundColor: colors.accentAmber + "18" },
            ]}
          >
            <Ionicons
              name="pencil-outline"
              size={14}
              color={colors.accentAmber}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => confirmDeleteSentence(item)}
            style={[styles.actionBtn, { backgroundColor: colors.error + "18" }]}
          >
            <Ionicons name="trash-outline" size={14} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
      <Text
        style={[styles.cardSentence, { color: colors.text }]}
        numberOfLines={3}
      >
        {item.sentence}
      </Text>
      <View
        style={[styles.meaningDivider, { backgroundColor: colors.border }]}
      />
      <Text style={[styles.cardMeaningLabel, { color: colors.textMuted }]}>
        MEANING
      </Text>
      <Text style={[styles.cardMeaning, { color: colors.textSecondary }]}>
        {item.meaning}
      </Text>
      {!!item.pdfSource && (
        <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
          📄 {item.pdfSource.replace(".pdf", "")}
        </Text>
      )}
    </View>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Notes</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {customVocab.length} custom words · {customSentences.length}{" "}
            sentences
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {(["vocab", "sentences"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2.5,
              },
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Ionicons
              name={tab === "vocab" ? "book-outline" : "chatbubble-outline"}
              size={16}
              color={activeTab === tab ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                {
                  color: activeTab === tab ? colors.primary : colors.textMuted,
                },
              ]}
            >
              {tab === "vocab"
                ? `Vocabulary (${customVocab.length})`
                : `Sentences (${customSentences.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── VOCAB TAB ────────────────────────────────────────────────────── */}
      {activeTab === "vocab" && (
        <>
          <TouchableOpacity
            style={[
              styles.shareRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={handleShareVocabTxt}
          >
            <Ionicons name="share-outline" size={18} color={colors.primary} />
            <Text style={[styles.shareLabel, { color: colors.primary }]}>
              Share vocabulary.txt
            </Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={colors.textMuted}
            />
          </TouchableOpacity>

          {customVocab.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="book-outline"
                size={56}
                color={colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No custom vocabulary yet
              </Text>
              <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
                Long-press on a word in any PDF and tap "Add Meaning"
              </Text>
            </View>
          ) : (
            <FlatList
              data={customVocab}
              keyExtractor={(item) => item.id?.toString() ?? item.word}
              renderItem={renderVocabItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* ── SENTENCES TAB ────────────────────────────────────────────────── */}
      {activeTab === "sentences" && (
        <>
          <TouchableOpacity
            style={[
              styles.shareRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={handleShareSentencesTxt}
          >
            <Ionicons
              name="share-outline"
              size={18}
              color={colors.accentAmber}
            />
            <Text style={[styles.shareLabel, { color: colors.accentAmber }]}>
              Share sentences.txt
            </Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={colors.textMuted}
            />
          </TouchableOpacity>

          {customSentences.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="chatbubble-outline"
                size={56}
                color={colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No sentence notes yet
              </Text>
              <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
                Long-press on text in any PDF and tap "Add Sentence Note"
              </Text>
            </View>
          ) : (
            <FlatList
              data={customSentences}
              keyExtractor={(item) =>
                item.id?.toString() ?? item.sentence.slice(0, 20)
              }
              renderItem={renderSentenceItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor:
              activeTab === "vocab" ? colors.primary : colors.accentAmber,
          },
        ]}
        onPress={handleFabPress}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color="white" />
      </TouchableOpacity>

      {/* Edit modal */}
      <CustomEntryModal
        mode={editMode}
        visible={editModalVisible}
        editEntry={editEntry}
        pdfSource={editEntry?.pdfSource ?? ""}
        onSaved={loadAll}
        onClose={() => {
          setEditModalVisible(false);
          setEditEntry(null);
        }}
      />
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
    gap: Spacing.md,
  },
  backBtn: { padding: 4 },
  title: { fontSize: FontSize.xl, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: FontSize.xs },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: FontSize.sm, fontWeight: "600" },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  shareLabel: { flex: 1, fontSize: FontSize.sm, fontWeight: "600" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  emptyText: { fontSize: FontSize.lg, fontWeight: "600" },
  emptySubText: { fontSize: FontSize.sm, textAlign: "center", lineHeight: 20 },
  listContent: { paddingHorizontal: Spacing.md, paddingBottom: 140 },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  cardWord: { fontSize: FontSize.xl, fontWeight: "800", flex: 1 },
  cardSentenceLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  cardSentence: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: 8,
    fontStyle: "italic",
  },
  cardMeaningLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 3,
  },
  cardMeaning: { fontSize: FontSize.sm, lineHeight: 18 },
  cardMeta: { fontSize: FontSize.xs, marginTop: 6, fontStyle: "italic" },
  cardActions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  meaningDivider: { height: 1, marginVertical: 6 },
  fab: {
    position: "absolute",
    bottom: 28,
    right: Spacing.lg ?? 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
});
