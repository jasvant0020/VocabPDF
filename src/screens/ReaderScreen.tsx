// src/screens/ReaderScreen.tsx
// v2.2.0
//
// ARCHITECTURE — why the v2.0 gesture overlay didn't work
// ───────────────────────────────────────────────────────
// react-native-pdf renders via a SurfaceView (Android) / WKWebView (iOS) in a
// native layer.  A React-Native Animated.View placed *on top* of it with no
// pointerEvents setting intercepts ALL touch events before they reach the PDF,
// breaking scroll, zoom, and pinch.  Conversely, setting pointerEvents="none"
// makes it completely transparent and gesture handlers never fire.
//
// CORRECT APPROACH (implemented here)
// ────────────────────────────────────
// 1. react-native-pdf exposes onPress(x, y, page) — fires for taps on the PDF.
//    We use this for single-tap toolbar toggle.  It co-exists perfectly with
//    scroll and zoom because the native layer handles those first; a tap is only
//    a tap if the finger didn't move.
//
// 2. For long-press we use a <LongPressGestureHandler> wrapped only around the
//    PDF (not the whole screen).  RNGH handlers co-exist with the PDF's native
//    gesture recognizers via simultaneousHandlers — the key is wrapping the Pdf
//    component inside the handler rather than floating a separate overlay.
//
// 3. Toolbar (top + bottom) is rendered above the gesture layer with
//    pointerEvents="auto" only when visible.
//
// NET RESULT
//  ✓ Single tap anywhere on PDF → toggles header + bottom toolbar
//  ✓ Long press → shows action bubble with editable text
//  ✓ Scroll, pinch-zoom, pan all work as before
//  ✓ Bubble, modals, toolbar all coexist

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  StatusBar,
  Platform,
  Animated,
  TextInput,
  Modal,
  Pressable,
  Clipboard,
  ToastAndroid,
} from 'react-native';
import Pdf from 'react-native-pdf';
import {
  GestureHandlerRootView,
  LongPressGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { WordMeaningModal } from '../components/WordMeaningModal';
import { SearchWordModal } from '../components/SearchWordModal';
import { CustomEntryModal, EntryMode } from '../components/CustomEntryModal';
import { lookupWord, WordDefinition } from '../services/dictionaryService';
import { saveWord, updatePdfLastPage, isWordSaved } from '../database/database';
import { syncVocabTxt } from '../services/autoExportService';
import { BorderRadius, FontSize, Spacing } from '../utils/theme';

const { width, height } = Dimensions.get('window');

interface Props {
  navigation: any;
  route: any;
}

// ─── ACTION BUBBLE ────────────────────────────────────────────────────────────
// Shown after long-press. Floats above the PDF as a Modal so it cannot be
// blocked by anything, and dismisses on backdrop tap.

interface ActionBubbleProps {
  visible:       boolean;
  initialText:   string;
  position:      { x: number; y: number };
  onLookUp:      (text: string) => void;
  onAddMeaning:  (text: string) => void;
  onAddSentence: (text: string) => void;
  onDismiss:     () => void;
  colors:        any;
}

const ActionBubble: React.FC<ActionBubbleProps> = ({
  visible, initialText, position, onLookUp, onAddMeaning, onAddSentence, onDismiss, colors,
}) => {
  const [text, setText] = useState(initialText);
  useEffect(() => { setText(initialText); }, [initialText, visible]);

  if (!visible) return null;

  const statusH  = StatusBar.currentHeight ?? 24;
  const bubbleH  = 270;
  const bubbleW  = 240;
  const top  = Math.min(Math.max(position.y - bubbleH - 12, statusH + 8), height - bubbleH - 24);
  const left = Math.min(Math.max(position.x - bubbleW / 2, 10), width  - bubbleW - 10);

  const copy = () => {
    if (!text.trim()) return;
    Clipboard.setString(text.trim());
    if (Platform.OS === 'android') ToastAndroid.show('Copied', ToastAndroid.SHORT);
    onDismiss();
  };

};

const bubble = StyleSheet.create({
  container: {
    position:      'absolute',
    width:         240,
    borderRadius:  BorderRadius.lg,
    padding:       Spacing.md,
    elevation:     24,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius:  18,
  },
  sectionTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  input: {
    borderWidth:       1.5,
    borderRadius:      BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical:   6,
    fontSize:          FontSize.sm,
    marginBottom:      8,
    maxHeight:         72,
    textAlignVertical: 'top',
  },
  btn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            7,
    borderRadius:   BorderRadius.sm,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom:   6,
  },
  btnTxt:   { color: 'white', fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  row:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  copyBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  smallTxt: { fontSize: FontSize.sm, fontWeight: '500' },
});

// ─── READER SCREEN ────────────────────────────────────────────────────────────

export const ReaderScreen: React.FC<Props> = ({ navigation, route }) => {
  const { uri, name, lastPage = 1 } = route.params || {};
  const { colors } = useTheme();

  const [currentPage, setCurrentPage] = useState<number>(lastPage || 1);
  const [totalPages, setTotalPages]   = useState(0);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const toolbarAnim = useRef(new Animated.Value(1)).current;

  // Long-press bubble
  const [bubbleVisible, setBubbleVisible]   = useState(false);
  const [bubblePosition, setBubblePosition] = useState({ x: width / 2, y: height / 2 });
  const [bubbleText, setBubbleText]         = useState('');

  // Definition / search modals
  const [wordModalVisible, setWordModalVisible]     = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [selectedWordData, setSelectedWordData]     = useState<WordDefinition | null>(null);
  const [wordIsSaved, setWordIsSaved]               = useState(false);
  const [isLoadingWord, setIsLoadingWord]           = useState(false);

  // Custom entry modal
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customMode, setCustomMode]                 = useState<EntryMode>('vocab');
  const [customInitialText, setCustomInitialText]   = useState('');

  // Hint (page 1 only)
  const [showHint, setShowHint] = useState(true);

  const pageTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef<LongPressGestureHandler>(null);

  // Track whether a long press is in progress so we can suppress the tap-toggle
  const longPressActive = useRef(false);

  useEffect(() => () => { if (pageTimer.current) clearTimeout(pageTimer.current); }, []);

  // ── Toolbar toggle ─────────────────────────────────────────────────────────
  const animateToolbar = useCallback((show: boolean) => {
    Animated.timing(toolbarAnim, {
      toValue:  show ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    setToolbarVisible(show);
  }, [toolbarAnim]);

  const toggleToolbar = useCallback(() => {
    animateToolbar(!toolbarVisible);
  }, [toolbarVisible, animateToolbar]);

  // ── PDF onPress → single tap → toggle toolbar ─────────────────────────────
  // react-native-pdf's onPress fires after a confirmed tap (i.e. no scroll/zoom).
  // This is the CORRECT way to detect taps on a PDF without blocking gestures.
  const handlePdfPress = useCallback((x: number, y: number, page: number) => {
    if (longPressActive.current) return; // ignore if long-press just fired
    if (bubbleVisible) {
      setBubbleVisible(false);
      return;
    }
    // Hide the page-1 hint on first tap
    if (showHint) setShowHint(false);
    toggleToolbar();
  }, [bubbleVisible, showHint, toggleToolbar]);

  // ── LongPressGestureHandler → show action bubble ──────────────────────────
  // Wrapped around <Pdf> so RNGH gets the event while still allowing the native
  // PDF layer to handle scroll/zoom (simultaneousHandlers is intentionally
  // omitted here — long-press and pan/pinch are mutually exclusive by time).
  const handleLongPress = useCallback((event: any) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      longPressActive.current = true;
      const { x, y } = event.nativeEvent;
      setBubblePosition({ x, y });
      setBubbleText('');
      setBubbleVisible(true);
      // Reset flag after a short delay (after the tap-suppression window)
      setTimeout(() => { longPressActive.current = false; }, 600);
    }
  }, []);

  // ── Actions from bubble ────────────────────────────────────────────────────
  const handleLookUp = useCallback(async (word: string) => {
    setBubbleVisible(false);
    setIsLoadingWord(true);
    setSelectedWordData(null);
    setWordModalVisible(true);
    const result = await lookupWord(word);
    setSelectedWordData(result);
    setIsLoadingWord(false);
    const saved = await isWordSaved(result.word);
    setWordIsSaved(saved);
  }, []);

  const openAddVocab = useCallback((text = '') => {
    setBubbleVisible(false);
    setCustomMode('vocab');
    setCustomInitialText(text);
    setCustomModalVisible(true);
  }, []);

  const openAddSentence = useCallback((text = '') => {
    setBubbleVisible(false);
    setCustomMode('sentence');
    setCustomInitialText(text);
    setCustomModalVisible(true);
  }, []);

  // ── Save dictionary word ───────────────────────────────────────────────────
  const handleSaveWord = useCallback(async (wordData: WordDefinition) => {
    const ok = await saveWord({
      word:         wordData.word,
      meaning:      wordData.meaning,
      synonyms:     JSON.stringify(wordData.synonyms),
      example:      wordData.example,
      partOfSpeech: wordData.partOfSpeech,
      savedDate:    new Date().toISOString(),
      pdfSource:    name ?? '',
    });
    if (ok) {
      setWordIsSaved(true);
      syncVocabTxt().catch(console.warn);
    } else {
      Alert.alert('Error', 'Could not save the word. Please try again.');
    }
  }, [name]);

  const handleWordFoundFromSearch = useCallback(async (wordData: WordDefinition) => {
    setSelectedWordData(wordData);
    setWordModalVisible(true);
    const saved = await isWordSaved(wordData.word);
    setWordIsSaved(saved);
  }, []);

  // ── Page persistence ───────────────────────────────────────────────────────
  const handlePageChanged = useCallback((page: number) => {
    setCurrentPage(page);
    if (pageTimer.current) clearTimeout(pageTimer.current);
    pageTimer.current = setTimeout(() => updatePdfLastPage(uri, page), 1500);
  }, [uri]);

  const pdfSource = React.useMemo(() => ({ uri, cache: true }), [uri]);

  // ── Toolbar slide interpolations ───────────────────────────────────────────
  const topBarTranslate = toolbarAnim.interpolate({
    inputRange: [0, 1], outputRange: [-90, 0],
  });
  const bottomBarTranslate = toolbarAnim.interpolate({
    inputRange: [0, 1], outputRange: [120, 0],
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* ── PDF wrapped in LongPressGestureHandler ──────────────────────────
           The handler sees the long-press before the PDF's native layer
           cancels it, and fires State.ACTIVE after minDurationMs.
           react-native-pdf's own scroll/zoom gestures are short — they start
           moving within ~50 ms, so the 500 ms threshold cleanly separates them.
           onPress on the Pdf component handles single-tap toggle.
      ─────────────────────────────────────────────────────────────────────── */}
      <LongPressGestureHandler
        ref={longPressRef}
        onHandlerStateChange={handleLongPress}
        minDurationMs={500}
        maxDist={15}
      >
        <Animated.View style={styles.pdfWrapper} collapsable={false}>
          <Pdf
            source={pdfSource}
            enablePaging={false}
            horizontal={false}
            fitPolicy={0}
            minScale={0.5}
            maxScale={6.0}
            enableAntialiasing
            style={styles.pdf}
            onLoadComplete={(pages) => setTotalPages(pages)}
            onPageChanged={handlePageChanged}
            onPress={handlePdfPress}
            onError={() =>
              Alert.alert("PDF Error", "Unable to load this PDF.", [
                { text: "Go Back", onPress: () => navigation.goBack() },
              ])
            }
            onPressLink={() => {}}
          />
        </Animated.View>
      </LongPressGestureHandler>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.topBar,
          {
            opacity: toolbarAnim,
            transform: [{ translateY: topBarTranslate }],
          },
        ]}
        pointerEvents={toolbarVisible ? "auto" : "none"}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {(name ?? "PDF Reader").replace(".pdf", "")}
        </Text>
        <Text style={styles.pageIndicator}>
          {currentPage} / {totalPages || "?"}
        </Text>
      </Animated.View>

      {/* ── Bottom toolbar ──────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.floatingToolbar,
          {
            backgroundColor: colors.surface,
            opacity: toolbarAnim,
            transform: [{ translateY: bottomBarTranslate }],
          },
        ]}
        pointerEvents={toolbarVisible ? "auto" : "none"}
      >
        {/* Search */}
        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: colors.primary }]}
          onPress={() => setSearchModalVisible(true)}
        >
          <Ionicons name="search" size={17} color="white" />
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* + Vocab */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => openAddVocab("")}
        >
          <Ionicons name="book-outline" size={20} color={colors.accentGreen} />
          <Text style={[styles.iconBtnLabel, { color: colors.accentGreen }]}>
            + Vocab
          </Text>
        </TouchableOpacity>

        {/* + Note */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => openAddSentence("")}
        >
          <Ionicons
            name="chatbubble-outline"
            size={20}
            color={colors.accentAmber}
          />
          <Text style={[styles.iconBtnLabel, { color: colors.accentAmber }]}>
            + Note
          </Text>
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Saved */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.navigate("SavedWords")}
        >
          <Ionicons name="bookmark-outline" size={20} color={colors.text} />
          <Text style={[styles.iconBtnLabel, { color: colors.textSecondary }]}>
            Saved
          </Text>
        </TouchableOpacity>

        {/* Notes */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.navigate("Notes")}
        >
          <Ionicons name="newspaper-outline" size={20} color={colors.text} />
          <Text style={[styles.iconBtnLabel, { color: colors.textSecondary }]}>
            Notes
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <TouchableOpacity
        style={[
          styles.fullscreenFab,
          {
            backgroundColor: "transparent",
            borderColor: colors.border,
          },
        ]}
        onPress={toggleToolbar}
      >
        <Ionicons
          name={toolbarVisible ? "expand-outline" : "contract-outline"}
          size={22}
          color={colors.text}
        />
      </TouchableOpacity>
      {/* ── Action bubble (long-press) ────────────────────────────────────── */}
      <ActionBubble
        visible={bubbleVisible}
        initialText={bubbleText}
        position={bubblePosition}
        onLookUp={handleLookUp}
        onAddMeaning={openAddVocab}
        onAddSentence={openAddSentence}
        onDismiss={() => setBubbleVisible(false)}
        colors={colors}
      />

      {/* ── Definition modal ─────────────────────────────────────────────── */}
      <WordMeaningModal
        visible={wordModalVisible}
        wordData={selectedWordData}
        onClose={() => {
          setWordModalVisible(false);
          setSelectedWordData(null);
        }}
        onSave={handleSaveWord}
        isSaved={wordIsSaved}
        isLoading={isLoadingWord}
      />

      {/* ── Search modal ─────────────────────────────────────────────────── */}
      <SearchWordModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onWordFound={handleWordFoundFromSearch}
      />

      {/* ── Custom entry modal ───────────────────────────────────────────── */}
      <CustomEntryModal
        mode={customMode}
        visible={customModalVisible}
        initialText={customInitialText}
        pdfSource={name ?? ""}
        onSaved={() => {
          if (Platform.OS === "android") {
            ToastAndroid.show(
              customMode === "vocab"
                ? "Vocabulary saved!"
                : "Sentence note saved!",
              ToastAndroid.SHORT,
            );
          }
        }}
        onClose={() => setCustomModalVisible(false)}
      />
    </GestureHandlerRootView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  // pdfWrapper and pdf must both be flex:1 and fill the screen.
  // The LongPressGestureHandler requires a single child Animated.View.
  pdfWrapper: {
    flex: 1,
    width,
    height,
  },
  pdf: {
    flex: 1,
    width,
    height,
    backgroundColor: "#1c1c1c",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 44,
    paddingBottom: 12,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: "rgba(10,10,10,0.92)",
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    flex: 1,
    color: "white",
    fontSize: FontSize.md,
    fontWeight: "600",
  },
  pageIndicator: {
    color: "rgba(255,255,255,0.6)",
    fontSize: FontSize.sm,
    fontWeight: "500",
  },
  floatingToolbar: {
    position: "absolute",
    bottom: 24,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.xl,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    gap: 2,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
  },
  searchBtnText: { color: "white", fontSize: FontSize.xs, fontWeight: "700" },
  divider: { width: 1, height: 28, marginHorizontal: 2 },
  iconBtn: { alignItems: "center", gap: 2, paddingHorizontal: 5 },
  iconBtnLabel: { fontSize: 9, fontWeight: "600" },
  hintWrap: {
    position: "absolute",
    bottom: 100,
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: "center",
  },
  hintBubble: {
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  hintText: {
    color: "white",
    fontSize: FontSize.sm,
    textAlign: "center",
    lineHeight: 20,
  },
  fullscreenFab: {
    position: "absolute",
    bottom: 32,
    right: 30,
    width: 40,
    height: 40,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    elevation: 10,
  },
});
