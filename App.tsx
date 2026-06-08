// App.tsx
// v2.0.0
// 1. Opens SQLite DB
// 2. On first launch: imports Oxford Dictionary txt → SQLite (shows progress)
// 3. Syncs auto-export TXT files (VocabPDF/vocabulary.txt + sentences.txt)
// 4. Renders the main app

import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { ThemeProvider } from "./src/utils/ThemeContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { initDatabase } from "./src/database/database";
import { ensureOxfordImported } from "./src/services/oxfordImporter";
import { syncAllTxt } from "./src/services/autoExportService";

type Phase = "db" | "oxford" | "done";

export default function App() {
  const [phase, setPhase] = useState<Phase>("db");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    (async () => {
      // Step 1: open + schema (creates new tables if upgrading from v1)
      await initDatabase().catch(console.error);
      setPhase("oxford");

      // Step 2: import Oxford (skipped if already done)
      try {
        await ensureOxfordImported((loaded, tot) => {
          setProgress(loaded);
          setTotal(tot);
        });
      } catch (err) {
        console.warn("[App] Oxford import failed:", err);
      }

      // Step 3: sync auto-export TXT files in background
      // (non-blocking — failure is logged, not surfaced to user)
      syncAllTxt().catch(err => console.warn("[App] syncAllTxt:", err));

      setPhase("done");
    })();
  }, []);

  if (phase !== "done") {
    const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
    return (
      <View style={styles.splash}>
        <Text style={styles.splashTitle}>📚 PDF Vocab Reader</Text>
        {phase === "oxford" && total > 0 ? (
          <>
            <Text style={styles.splashSub}>Loading Oxford Dictionary…</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${pct}%` as any }]} />
            </View>
            <Text style={styles.splashPct}>
              {pct}% ({progress.toLocaleString()} / {total.toLocaleString()})
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator
              color="#6C63FF"
              size="large"
              style={{ marginTop: 24 }}
            />
            <Text style={styles.splashSub}>Initialising…</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: {
    flex: 1,
    backgroundColor: "#0F1117",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  splashTitle: {
    color: "#F0F0F8",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  splashSub: {
    color: "#9A9AB0",
    fontSize: 15,
    marginTop: 12,
    marginBottom: 20,
  },
  barBg: {
    width: "100%",
    height: 6,
    backgroundColor: "#22263A",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: "#6C63FF", borderRadius: 3 },
  splashPct: { color: "#5A5A7A", fontSize: 12, marginTop: 10 },
});
