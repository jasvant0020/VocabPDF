// src/navigation/AppNavigator.tsx
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { HomeScreen } from "../screens/HomeScreen";
import { ReaderScreen } from "../screens/ReaderScreen";
import { SavedWordsScreen } from "../screens/SavedWordsScreen";
import { NotesScreen } from "../screens/NotesScreen";
import { RevisionScreen } from "../screens/RevisionScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { QuizScreen } from "@/screens/QuizScreen";
import { FlashcardScreen } from "@/screens/FlashcardScreen";

export type RootStackParamList = {
  Home: undefined;
  Reader: { uri: string; name: string; lastPage?: number };
  SavedWords: undefined;
  Notes: undefined;
  Revision: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => (
  <Stack.Navigator
    initialRouteName="Home"
    screenOptions={{
      headerShown: false,
      animation: "slide_from_right",
      gestureEnabled: true,
    }}
  >
    <Stack.Screen name="Home" component={HomeScreen} />
    <Stack.Screen
      name="Reader"
      component={ReaderScreen}
      options={{ animation: "slide_from_bottom", gestureEnabled: false }}
    />
    <Stack.Screen name="SavedWords" component={SavedWordsScreen} />
    <Stack.Screen name="Notes" component={NotesScreen} />
    <Stack.Screen name="Revision" component={RevisionScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="Quiz" component={QuizScreen} />
    <Stack.Screen name="Flashcard" component={FlashcardScreen} />
  </Stack.Navigator>
);
