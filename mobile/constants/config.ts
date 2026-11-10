import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Backend address. Set EXPO_PUBLIC_API_URL in mobile/.env (see .env.example), e.g.
 *   EXPO_PUBLIC_API_URL=https://tractor-tracker-api.onrender.com/api
 * Falls back to "extra.apiUrl" in app.json.
 *
 * In the browser during development, the app calls /api on its own address; the Expo dev
 * server forwards it to the backend (see metro.config.js). This works via localhost, the
 * Wi-Fi IP or a tunnel URL alike.
 */
const browserDevApi =
  Platform.OS === 'web' && __DEV__ && typeof window !== 'undefined' ? `${window.location.origin}/api` : undefined;

export const API_URL: string =
  browserDevApi ??
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:4000/api';

/** Colours for icons and places where class names cannot be used. Same palette as tailwind.config.js. */
export const COLORS = {
  profit: '#15803D',
  received: '#1D4ED8',
  pending: '#C2410C',
  expense: '#B91C1C',
  brand: '#166534',
  ink: '#111827',
  inkSoft: '#4B5563',
  inkFaint: '#6B7280',
  line: '#E5E7EB',
  section: '#F5F6F7',
  white: '#FFFFFF',
};
