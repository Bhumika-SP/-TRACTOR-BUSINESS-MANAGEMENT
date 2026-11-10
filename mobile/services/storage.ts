import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoSecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Expo SecureStore exists only on Android/iOS. The web build (used only for previewing
 * the app in a browser during development) falls back to the browser's localStorage.
 */
const SecureStore =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
        setItemAsync: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
        deleteItemAsync: async (key: string) => globalThis.localStorage?.removeItem(key),
      }
    : ExpoSecureStore;

const TOKEN_KEY = 'tt_auth_token';
const LANG_KEY = 'tt_language';
const DRAFT_PREFIX = 'tt_draft:';
const CACHE_PREFIX = 'tt_cache:';

/**
 * - Login token: Expo SecureStore (encrypted Keychain / Keystore).
 * - Unsaved form drafts and last-loaded screens: AsyncStorage, so nothing typed is lost
 *   if the app closes or the internet drops.
 */
export const storage = {
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  setToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clearToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),

  getLanguage: () => SecureStore.getItemAsync(LANG_KEY),
  setLanguage: (lang: string) => SecureStore.setItemAsync(LANG_KEY, lang),

  async getDraft<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(DRAFT_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async setDraft(key: string, value: unknown) {
    try {
      await AsyncStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(value));
    } catch {
      // storage full or unavailable — the form still works
    }
  },
  async clearDraft(key: string) {
    await AsyncStorage.removeItem(DRAFT_PREFIX + key).catch(() => undefined);
  },

  async getCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async setCache(key: string, value: unknown) {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)).catch(() => undefined);
  },
  async clearAllCache() {
    const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(CACHE_PREFIX) || k.startsWith(DRAFT_PREFIX))).catch(
      () => undefined,
    );
  },
};
