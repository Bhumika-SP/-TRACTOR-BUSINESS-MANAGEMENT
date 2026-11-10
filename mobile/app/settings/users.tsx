import { router } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { Button, ErrorView, LoadingView, Notice, Screen } from '@/components/ui';
import { COLORS } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';

/** Owner only: list of the 3–4 people who use the app. Users cannot sign themselves up. */
export default function UsersScreen() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const errorMessage = useErrorMessage();
  const q = useQuery('users', () => api.users(), { enabled: isAdmin });

  if (!isAdmin) return <Screen><Notice message={t('onlyAdminCanChange')} /></Screen>;

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Button title={t('addUser').replace('+ ', '')} icon={<Plus color={COLORS.white} size={24} />} onPress={() => router.push('/settings/user')} />
      <View className="mt-4">
        {q.loading ? (
          <LoadingView />
        ) : !q.data ? (
          <ErrorView message={errorMessage(q.error)} onRetry={q.refresh} />
        ) : (
          q.data.map((u) => (
            <Pressable
              key={u.id}
              onPress={() => router.push({ pathname: '/settings/user', params: { id: u.id } })}
              className={`mb-3 flex-row items-center rounded-2xl border border-line p-4 active:bg-section ${u.isActive ? '' : 'opacity-50'}`}
            >
              <View className="flex-1">
                <Text className="text-lg font-bold text-ink">{u.name}</Text>
                <Text className="text-base text-ink-soft">
                  {u.username} · {t(`role_${u.role}` as 'role_admin')}
                </Text>
                <Text className="text-sm text-ink-faint">
                  {u.isActive ? t('active') : t('inactive')}
                  {u.role === 'entry' && u.canEdit ? ` · ${t('canEditRecords')}` : ''}
                </Text>
              </View>
              <ChevronRight color={COLORS.inkFaint} size={22} />
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}
