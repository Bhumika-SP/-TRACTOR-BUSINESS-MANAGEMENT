import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/Toast';
import { COLORS } from '@/constants/config';
import { AuthProvider } from '@/hooks/useAuth';
import { I18nProvider, useI18n } from '@/i18n/I18nProvider';

function RootStack() {
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.white },
        headerTintColor: COLORS.ink,
        headerTitleStyle: { fontSize: 20, fontWeight: '700' },
        contentStyle: { backgroundColor: COLORS.white },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="work/new" options={{ title: t('addNewWork').replace('+ ', '') }} />
      <Stack.Screen name="work/[id]" options={{ title: t('workDetails') }} />
      <Stack.Screen name="payments/customer" options={{ title: t('recordCustomerPayment') }} />
      <Stack.Screen name="payments/driver" options={{ title: t('payDriver') }} />
      <Stack.Screen name="payments/cycle/[start]" options={{ title: t('driverPayment') }} />
      <Stack.Screen name="payments/expense" options={{ title: t('expenses') }} />
      <Stack.Screen name="settings/index" options={{ title: t('settings') }} />
      <Stack.Screen name="settings/users" options={{ title: t('users') }} />
      <Stack.Screen name="settings/user" options={{ title: t('editUser') }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="dark" />
            <RootStack />
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
