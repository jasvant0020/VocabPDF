// src/screens/HomeScreen.tsx
//
// CHANGE v1.2: Prevent duplicate PDF imports
//   • Before opening, checks if the picked URI already exists in recentPdfs
//   • If duplicate found → alert the user and navigate directly to that entry
//   • No other changes

import React, { useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Alert,
  Animated,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../utils/ThemeContext";
import { BorderRadius, FontSize, Spacing } from "../utils/theme";
import {
  getWordCount,
  getCustomVocabCount,
  getCustomSentenceCount,
  getRecentPdfs,
  saveRecentPdf,
  deleteRecentPdf,
} from "../database/database";

interface Props {
  navigation: any;
}

interface Counts {
  dictionary: number;
  customVocab: number;
  sentences: number;
}

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme();

  const [counts, setCounts] = useState<Counts>({
    dictionary: 0,
    customVocab: 0,
    sentences: 0,
  });
  const [recentPdfs, setRecentPdfs] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    const [dict, custom, sent, recents] = await Promise.all([
      getWordCount(),
      getCustomVocabCount(),
      getCustomSentenceCount(),
      getRecentPdfs(),
    ]);
    setCounts({ dictionary: dict, customVocab: custom, sentences: sent });
    setRecentPdfs(recents.slice(0, 5));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // ── Pick PDF ───────────────────────────────────────────────────────────────
  const handleOpenPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const name = asset.name ?? uri.split("/").pop() ?? "document.pdf";

      // ── Duplicate check ────────────────────────────────────────────────
      // Compare by file name (case-insensitive) so the same PDF picked from
      // a different cache path is still caught.
      const existing = recentPdfs.find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      );

      if (existing) {
        Alert.alert(
          "Already in your library",
          `"${name.replace(".pdf", "")}" is already in your recent list. Opening it now.`,
          [
            {
              text: "Open",
              onPress: () =>
                navigation.navigate("Reader", {
                  uri: existing.uri,
                  name: existing.name,
                  lastPage: existing.last_page,
                }),
            },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }

      // New PDF — save and open
      await saveRecentPdf(name, uri, 1);
      navigation.navigate("Reader", { uri, name, lastPage: 1 });
    } catch {
      Alert.alert("Error", "Could not open the PDF. Please try again.");
    }
  };

  // ── Delete a recent PDF entry ──────────────────────────────────────────────
  const handleDeletePdf = useCallback((pdf: any) => {
    Alert.alert(
      "Remove from recent?",
      `"${pdf.name.replace(".pdf", "")}" will be removed from your reading history. The file itself is not deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRecentPdf(pdf.id);
              setRecentPdfs((prev) => prev.filter((p) => p.id !== pdf.id));
            } catch {
              Alert.alert(
                "Error",
                "Could not remove the entry. Please try again.",
              );
            }
          },
        },
      ],
    );
  }, []);

  const totalVocab = counts.dictionary + counts.customVocab;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.appName, { color: colors.textMuted }]}>
              PDF VOCAB
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>
              Your Library
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.settingsBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={() => navigation.navigate("Settings")}
          >
            <Ionicons
              name="settings-outline"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* ── Stats Row ───────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatPill
            value={totalVocab}
            label="Total Words"
            color={colors.primary}
            colors={colors}
            onPress={() => navigation.navigate("SavedWords")}
          />
          <StatPill
            value={counts.dictionary}
            label="Dictionary"
            color={colors.accentGreen}
            colors={colors}
            onPress={() => navigation.navigate("SavedWords")}
          />
          <StatPill
            value={counts.customVocab}
            label="Custom"
            color={colors.accentAmber}
            colors={colors}
            onPress={() => navigation.navigate("Notes")}
          />
          <StatPill
            value={counts.sentences}
            label="Notes"
            color={colors.primary}
            colors={colors}
            onPress={() => navigation.navigate("Notes")}
          />
        </View>

        {/* ── Quick Actions ────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          QUICK ACTIONS
        </Text>
        <View style={styles.actionsRow}>
          <ActionTile
            icon="document-outline"
            label="Open PDF"
            color={colors.primary}
            colors={colors}
            onPress={handleOpenPdf}
          />
          <ActionTile
            icon="layers-outline"
            label="Flashcards"
            color={colors.accentGreen}
            colors={colors}
            onPress={() => navigation.navigate("Flashcard")}
          />
          <ActionTile
            icon="help-circle-outline"
            label="Quiz"
            color={colors.accentAmber}
            colors={colors}
            onPress={() => navigation.navigate("Quiz")}
          />
          <ActionTile
            icon="newspaper-outline"
            label="Notes"
            color={colors.primary}
            colors={colors}
            onPress={() => navigation.navigate("Notes")}
          />
        </View>

        {/* ── Recent PDFs ──────────────────────────────────────────────────── */}
        {recentPdfs.length > 0 && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text
                style={[
                  styles.sectionLabel,
                  { color: colors.textMuted, marginBottom: 0 },
                ]}
              >
                CONTINUE READING
              </Text>
              <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                Hold to remove
              </Text>
            </View>

            <View
              style={[
                styles.recentList,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {recentPdfs.map((pdf, index) => (
                <RecentRow
                  key={pdf.id}
                  pdf={pdf}
                  isLast={index === recentPdfs.length - 1}
                  colors={colors}
                  onPress={() =>
                    navigation.navigate("Reader", {
                      uri: pdf.uri,
                      name: pdf.name,
                      lastPage: pdf.last_page,
                    })
                  }
                  onLongPress={() => handleDeletePdf(pdf)}
                />
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

// ─── Recent Row ───────────────────────────────────────────────────────────────

interface RecentRowProps {
  pdf: any;
  isLast: boolean;
  colors: any;
  onPress: () => void;
  onLongPress: () => void;
}

const RecentRow: React.FC<RecentRowProps> = ({
  pdf,
  isLast,
  colors,
  onPress,
  onLongPress,
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 30,
    }).start();
  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
    }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          styles.recentRow,
          !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        delayLongPress={400}
        activeOpacity={0.85}
      >
        <View
          style={[styles.pdfDot, { backgroundColor: colors.primary + "22" }]}
        >
          <Ionicons
            name="document-text-outline"
            size={15}
            color={colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.pdfName, { color: colors.text }]}
            numberOfLines={1}
          >
            {pdf.name.replace(".pdf", "")}
          </Text>
          <Text style={[styles.pdfMeta, { color: colors.textMuted }]}>
            Page {pdf.last_page}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Stat Pill ────────────────────────────────────────────────────────────────

interface StatPillProps {
  value: number;
  label: string;
  color: string;
  colors: any;
  onPress: () => void;
}
const StatPill: React.FC<StatPillProps> = ({
  value,
  label,
  color,
  colors,
  onPress,
}) => (
  <TouchableOpacity
    style={[
      styles.statPill,
      { backgroundColor: colors.surface, borderColor: colors.border },
    ]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
  </TouchableOpacity>
);

// ─── Action Tile ──────────────────────────────────────────────────────────────

interface ActionTileProps {
  icon: string;
  label: string;
  color: string;
  colors: any;
  onPress: () => void;
}
const ActionTile: React.FC<ActionTileProps> = ({
  icon,
  label,
  color,
  colors,
  onPress,
}) => (
  <TouchableOpacity
    style={[
      styles.actionTile,
      { backgroundColor: colors.surface, borderColor: colors.border },
    ]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <View style={[styles.actionIcon, { backgroundColor: color + "1A" }]}>
      <Ionicons name={icon as any} size={20} color={color} />
    </View>
    <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingTop: Platform.OS === "android" ? 52 : 56,
    paddingHorizontal: Spacing.md,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  appName: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  statsRow: { flexDirection: "row", gap: Spacing.xs, marginBottom: Spacing.lg },
  statPill: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 2,
  },
  statValue: { fontSize: 20, fontWeight: "800", lineHeight: 24 },
  statLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
    textAlign: "center",
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionHint: { fontSize: 9, fontWeight: "500", opacity: 0.6 },

  actionsRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  actionTile: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 6,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textAlign: "center",
  },

  recentList: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
  },
  pdfDot: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  pdfName: { fontSize: FontSize.sm, fontWeight: "600", marginBottom: 1 },
  pdfMeta: { fontSize: FontSize.xs },
});
