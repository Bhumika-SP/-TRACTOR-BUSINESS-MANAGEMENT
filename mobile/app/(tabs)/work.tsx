import { router } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, TextInput, View } from 'react-native';
import { Button, Chips, EmptyState, ErrorView, LoadingView, OfflineBanner } from '@/components/ui';
import { WorkRow } from '@/components/WorkRow';
import { COLORS } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useDebounced } from '@/hooks/useDebounced';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { usePagedList } from '@/hooks/usePagedList';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';

type StatusFilter = 'all' | 'pending' | 'partial' | 'paid';

export default function WorkListScreen() {
  const { t } = useI18n();
  const { canCreate } = useAuth();
  const errorMessage = useErrorMessage();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const q = useDebounced(search.trim());

  const list = usePagedList(`works:${q}:${status}`, (page, limit) =>
    api.works({ page, limit, search: q || undefined, status: status === 'all' ? undefined : status }),
  );

  return (
    <View className="flex-1 bg-white">
      <OfflineBanner />
      <View className="px-4 pt-2">
        {canCreate ? (
          <Button title={t('addNewWork').replace('+ ', '')} icon={<Plus color={COLORS.white} size={26} />} onPress={() => router.push('/work/new')} />
        ) : null}
        <View className="mt-3 flex-row items-center rounded-xl border-2 border-line px-3">
          <Search color={COLORS.inkFaint} size={22} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchFarmer')}
            placeholderTextColor={COLORS.inkFaint}
            className="ml-2 flex-1 py-3 text-lg text-ink"
          />
        </View>
        <View className="mb-3 mt-3">
          <Chips
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: t('all') },
              { value: 'pending', label: t('pending') },
              { value: 'partial', label: t('partPaid') },
              { value: 'paid', label: t('paid') },
            ]}
          />
        </View>
      </View>

      {list.loading ? (
        <LoadingView />
      ) : list.error && list.items.length === 0 ? (
        <View className="px-4">
          <ErrorView message={errorMessage(list.error)} onRetry={list.refresh} />
        </View>
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(w) => w.id}
          renderItem={({ item }) => <WorkRow work={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState message={q ? t('nothingFound') : t('noWorkYet')} />}
          ListFooterComponent={list.loadingMore ? <ActivityIndicator color={COLORS.brand} style={{ margin: 16 }} /> : undefined}
        />
      )}
    </View>
  );
}
