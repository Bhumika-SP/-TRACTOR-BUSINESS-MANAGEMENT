import { Redirect, Tabs } from 'expo-router';
import { History, House, Tractor, Wallet } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/i18n/I18nProvider';

/** Exactly four sections: Home, Work, Payments, History. */
export default function TabsLayout() {
  const { user, ready } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={COLORS.brand} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.inkFaint,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '700' },
        tabBarStyle: { height: 74 + insets.bottom, paddingTop: 6, paddingBottom: 10 + insets.bottom, borderTopColor: COLORS.line },
        headerStyle: { backgroundColor: COLORS.white },
        headerTitleStyle: { fontSize: 22, fontWeight: '800', color: COLORS.ink },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('home'), headerShown: false, tabBarIcon: ({ color }) => <House color={color} size={26} /> }} />
      <Tabs.Screen name="work" options={{ title: t('work'), tabBarIcon: ({ color }) => <Tractor color={color} size={26} /> }} />
      <Tabs.Screen name="payments" options={{ title: t('payments'), tabBarIcon: ({ color }) => <Wallet color={color} size={26} /> }} />
      <Tabs.Screen name="history" options={{ title: t('history'), tabBarIcon: ({ color }) => <History color={color} size={26} /> }} />
    </Tabs>
  );
}
