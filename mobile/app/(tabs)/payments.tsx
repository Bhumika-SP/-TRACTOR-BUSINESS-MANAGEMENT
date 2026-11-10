import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { makePeriod, PeriodFilter, type Period } from '@/components/PeriodFilter';
import { CycleCard, ExpenseRow } from '@/components/PaymentRows';
import { Button, Card, Chips, EmptyState, ErrorView, LoadingView, OfflineBanner, Segmented } from '@/components/ui';
import { WorkRow } from '@/components/WorkRow';
import { COLORS } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { usePagedList } from '@/hooks/usePagedList';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import { formatINR } from '@/utils/format';

type Tab = 'customer' | 'driver' | 'expenses';

/** Customer payments, driver payments and expenses — kept separate from the Work screen. */
export default function PaymentsScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'customer');
  // Opening this screen from the Home driver card switches to the Driver section.
  const [lastParam, setLastParam] = useState(params.tab);
  if (params.tab !== lastParam) {
    setLastParam(params.tab);
    if (params.tab) setTab(params.tab);
  }

  const header = (
    <View className="pb-3">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'customer', label: t('farmerPaymentsShort') },
          { value: 'driver', label: t('driver') },
          { value: 'expenses', label: t('expenses') },
        ]}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-white">
      <OfflineBanner />
      {tab === 'customer' ? <CustomerSection header={header} /> : tab === 'driver' ? <DriverSection header={header} /> : <ExpenseSection header={header} />}
    </View>
  );
}

function ListStates({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  const errorMessage = useErrorMessage();
  if (loading) return <LoadingView />;
  if (error) return <ErrorView message={errorMessage(error)} onRetry={onRetry} />;
  return null;
}

// ------------------------------------------------------------------ customer payments

function CustomerSection({ header }: { header: ReactElement }) {
  const { t } = useI18n();
  const { canCreate } = useAuth();
  const [status, setStatus] = useState<'due' | 'paid' | 'all'>('due');
  const list = usePagedList(`cp-works:${status}`, (page, limit) => api.works({ page, limit, status: status === 'all' ? undefined : status }));

  return (
    <FlatList
      data={list.items}
      keyExtractor={(w) => w.id}
      renderItem={({ item }) => <WorkRow work={item} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View>
          {header}
          {canCreate ? (
            <Button title={t('recordCustomerPayment')} variant="secondary" icon={<Plus color={COLORS.white} size={24} />} onPress={() => router.push('/payments/customer')} />
          ) : null}
          {list.meta?.totals && status === 'due' ? (
            <View className="mt-4 rounded-2xl bg-pending-light p-4">
              <Text className="text-base text-ink-soft">{t('moneyPending')}</Text>
              <Text className="text-3xl font-extrabold text-pending">{formatINR(list.meta.totals.pending)}</Text>
            </View>
          ) : null}
          <View className="my-4">
            <Chips
              value={status}
              onChange={setStatus}
              options={[
                { value: 'due', label: t('pending') },
                { value: 'paid', label: t('paid') },
                { value: 'all', label: t('all') },
              ]}
            />
          </View>
          <ListStates loading={list.loading} error={list.items.length === 0 ? list.error : null} onRetry={list.refresh} />
        </View>
      }
      ListEmptyComponent={list.loading || list.error ? undefined : <EmptyState message={status === 'due' ? t('noPendingWork') : t('nothingFound')} />}
      ListFooterComponent={list.loadingMore ? <ActivityIndicator color={COLORS.brand} style={{ margin: 16 }} /> : undefined}
    />
  );
}

// ------------------------------------------------------------------ driver payments


function DriverSection({ header }: { header: ReactElement }) {
  const { t } = useI18n();
  const { canCreate } = useAuth();
  const summary = useQuery('driver-summary', () => api.driverSummary());
  const list = usePagedList('cycles', (page, limit) => api.cycles({ page, limit }));
  const due = (summary.data?.currentCycle.remaining ?? 0) + (summary.data?.olderUnpaid ?? 0);

  return (
    <FlatList
      data={list.items.filter((c) => c.status !== 'no_work' || c.isCurrent)}
      keyExtractor={(c) => c.startDate}
      renderItem={({ item }) => <CycleCard cycle={item} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={list.refreshing}
          onRefresh={() => {
            void list.refresh();
            void summary.refresh();
          }}
        />
      }
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View>
          {header}
          {summary.data ? (
            <Card className="mb-4 bg-section">
              <Text className="text-xl font-bold text-ink">{summary.data.driverName}</Text>
              <Text className="text-base text-ink-soft">
                {t('driverRate')}: {formatINR(summary.data.driverHourlyRate)}
              </Text>
              <View className="mt-3 rounded-xl bg-white p-3">
                <Text className="text-base text-ink-soft">{t('remainingToPay')}</Text>
                <Text className={`text-3xl font-extrabold ${due > 0 ? 'text-pending' : 'text-profit'}`}>{formatINR(due)}</Text>
              </View>
              {canCreate ? (
                <View className="mt-3">
                  <Button title={t('payDriver')} onPress={() => router.push('/payments/driver')} />
                </View>
              ) : null}
            </Card>
          ) : null}
          <ListStates loading={list.loading} error={list.items.length === 0 ? list.error : null} onRetry={list.refresh} />
        </View>
      }
      ListEmptyComponent={list.loading || list.error ? undefined : <EmptyState message={t('noCycles')} />}
      ListFooterComponent={list.loadingMore ? <ActivityIndicator color={COLORS.brand} style={{ margin: 16 }} /> : undefined}
    />
  );
}

// ------------------------------------------------------------------ expenses


function ExpenseSection({ header }: { header: ReactElement }) {
  const { t } = useI18n();
  const { canCreate } = useAuth();
  const [period, setPeriod] = useState<Period>(makePeriod('month'));
  const range = period.kind === 'all' ? {} : { from: period.from, to: period.to };
  const list = usePagedList(`expenses:${period.kind}:${period.from}:${period.to}`, (page, limit) => api.expenses({ page, limit, ...range }));

  return (
    <FlatList
      data={list.items}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => <ExpenseRow expense={item} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View>
          {header}
          {canCreate ? (
            <Button title={t('addExpense').replace('+ ', '')} variant="danger" icon={<Plus color={COLORS.expense} size={24} />} onPress={() => router.push('/payments/expense')} />
          ) : null}
          <View className="mt-4">
            <PeriodFilter value={period} onChange={setPeriod} allowAll />
          </View>
          {list.meta ? (
            <View className="my-4 rounded-2xl bg-expense-light p-4">
              <Text className="text-base text-ink-soft">{t('total')}</Text>
              <Text className="text-3xl font-extrabold text-expense">{formatINR(list.meta.totalAmount ?? 0)}</Text>
            </View>
          ) : null}
          <ListStates loading={list.loading} error={list.items.length === 0 ? list.error : null} onRetry={list.refresh} />
        </View>
      }
      ListEmptyComponent={list.loading || list.error ? undefined : <EmptyState message={t('noExpenses')} />}
      ListFooterComponent={list.loadingMore ? <ActivityIndicator color={COLORS.brand} style={{ margin: 16 }} /> : undefined}
    />
  );
}
