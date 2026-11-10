import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { ExpenseRow } from '@/components/PaymentRows';
import { makePeriod, PeriodFilter, type Period } from '@/components/PeriodFilter';
import { Chips, EmptyState, ErrorView, LoadingView, OfflineBanner, StatusBadge } from '@/components/ui';
import { WorkRow } from '@/components/WorkRow';
import { COLORS } from '@/constants/config';
import { useDebounced } from '@/hooks/useDebounced';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { usePagedList } from '@/hooks/usePagedList';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import type { CustomerPayment, DriverPayment, Expense, HistoryItem, Paged, Work } from '@/types/api';
import { formatDate, formatINR, formatTime } from '@/utils/format';

type Kind = 'all' | 'work' | 'payments' | 'expenses';
type PaymentKind = 'farmer' | 'driver';
type StatusFilter = 'all' | 'pending' | 'partial' | 'paid';

/** Unified row type so one list can show any record. */
type Entry =
  | { kind: 'work'; id: string; item: Work }
  | { kind: 'customer_payment'; id: string; item: CustomerPayment }
  | { kind: 'driver_payment'; id: string; item: DriverPayment }
  | { kind: 'expense'; id: string; item: Expense };

function fromHistory(h: HistoryItem): Entry {
  return { kind: h.type, id: `${h.type}:${h.id}`, item: h.data } as Entry;
}

export default function HistoryScreen() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [kind, setKind] = useState<Kind>('all');
  const [paymentKind, setPaymentKind] = useState<PaymentKind>('farmer');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [period, setPeriod] = useState<Period>(makePeriod('all'));
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());

  const range = period.kind === 'all' ? {} : { from: period.from, to: period.to };
  const key = JSON.stringify({ kind, paymentKind, status, range, q });

  const list = usePagedList<Entry>(key, async (page, limit): Promise<Paged<Entry>> => {
    const base = { page, limit, ...range, search: q || undefined };
    if (kind === 'work') {
      const r = await api.works({ ...base, status: status === 'all' ? undefined : status });
      return { data: r.data.map((item) => ({ kind: 'work', id: `w:${item.id}`, item })), meta: r.meta };
    }
    if (kind === 'payments' && paymentKind === 'farmer') {
      const r = await api.customerPayments(base);
      return { data: r.data.map((item) => ({ kind: 'customer_payment', id: `cp:${item.id}`, item })), meta: r.meta };
    }
    if (kind === 'payments') {
      const r = await api.driverPayments({ page, limit, ...range });
      return { data: r.data.map((item) => ({ kind: 'driver_payment', id: `dp:${item.id}`, item })), meta: r.meta };
    }
    if (kind === 'expenses') {
      const r = await api.expenses(base);
      return { data: r.data.map((item) => ({ kind: 'expense', id: `e:${item.id}`, item })), meta: r.meta };
    }
    const r = await api.history({ ...base, type: 'all' });
    return { data: r.data.map(fromHistory), meta: r.meta };
  });

  const showSearch = !(kind === 'payments' && paymentKind === 'driver');

  const header = (
    <View className="pb-2">
      <Chips
        value={kind}
        onChange={setKind}
        options={[
          { value: 'all', label: t('all') },
          { value: 'work', label: t('work') },
          { value: 'payments', label: t('payments') },
          { value: 'expenses', label: t('expenses') },
        ]}
      />
      {kind === 'payments' ? (
        <View className="mt-3">
          <Chips
            value={paymentKind}
            onChange={setPaymentKind}
            options={[
              { value: 'farmer', label: t('farmerPaymentsShort') },
              { value: 'driver', label: t('driverShort') },
            ]}
          />
        </View>
      ) : null}
      <View className="mt-4">
        <PeriodFilter value={period} onChange={setPeriod} allowAll />
      </View>
      {showSearch ? (
        <View className="mt-3 flex-row items-center rounded-xl border-2 border-line px-3">
          <Search color={COLORS.inkFaint} size={22} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={kind === 'expenses' ? t('searchHere') : t('searchFarmer')}
            placeholderTextColor={COLORS.inkFaint}
            className="ml-2 flex-1 py-3 text-lg text-ink"
          />
        </View>
      ) : null}
      {kind === 'work' ? (
        <View className="mt-3">
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
      ) : null}
      {kind === 'work' && list.meta?.totals ? (
        <View className="mt-3 flex-row justify-between rounded-xl bg-section px-4 py-3">
          <Text className="text-base text-ink">
            {t('workAmount')}: <Text className="font-bold">{formatINR(list.meta.totals.workAmount)}</Text>
          </Text>
          <Text className="text-base text-pending">
            {t('pending')}: <Text className="font-bold">{formatINR(list.meta.totals.pending)}</Text>
          </Text>
        </View>
      ) : null}
      {(kind === 'payments' || kind === 'expenses') && list.meta?.totalAmount !== undefined ? (
        <View className="mt-3 rounded-xl bg-section px-4 py-3">
          <Text className="text-base text-ink">
            {t('total')}: <Text className="font-bold">{formatINR(list.meta.totalAmount)}</Text>
          </Text>
        </View>
      ) : null}
      <View className="h-3" />
      {list.loading ? <LoadingView /> : null}
      {!list.loading && list.error && list.items.length === 0 ? <ErrorView message={errorMessage(list.error)} onRetry={list.refresh} /> : null}
    </View>
  );

  return (
    <View className="flex-1 bg-white">
      <OfflineBanner />
      <FlatList
        data={list.items}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow entry={item} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={list.loading || list.error ? undefined : <EmptyState message={t('nothingFound')} />}
        ListFooterComponent={list.loadingMore ? <ActivityIndicator color={COLORS.brand} style={{ margin: 16 }} /> : undefined}
      />
    </View>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const { t, duration } = useI18n();
  switch (entry.kind) {
    case 'work':
      return <WorkRow work={entry.item} />;
    case 'expense':
      return <ExpenseRow expense={entry.item} />;
    case 'customer_payment': {
      const p = entry.item;
      return (
        <Pressable
          onPress={() => router.push({ pathname: '/work/[id]', params: { id: p.workId } })}
          className="mb-3 flex-row items-center rounded-2xl border border-line bg-white p-4 active:bg-section"
        >
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-received-light">
            <ArrowDownLeft color={COLORS.received} size={24} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-bold text-ink" numberOfLines={1}>
              {p.customerName}
            </Text>
            <Text className="text-base text-ink-soft">
              {t('paymentEntry')} · {formatDate(p.paymentDate)} · {t(p.paymentMethod)}
            </Text>
            {p.work ? (
              <Text className="text-sm text-ink-faint">
                {t('relatedWork')}: {formatDate(p.work.workDate)} {formatTime(p.work.fromTime)} ({formatINR(p.work.totalWorkAmount)})
              </Text>
            ) : null}
          </View>
          <Text className="text-xl font-bold text-received">{formatINR(p.amount)}</Text>
        </Pressable>
      );
    }
    case 'driver_payment': {
      const p = entry.item;
      return (
        <Pressable
          onPress={() => router.push({ pathname: '/payments/cycle/[start]', params: { start: p.cycleStartDate } })}
          className="mb-3 rounded-2xl border border-line bg-white p-4 active:bg-section"
        >
          <View className="flex-row items-center">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-expense-light">
              <ArrowUpRight color={COLORS.expense} size={24} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-lg font-bold text-ink">{t('driverPaymentEntry')}</Text>
              <Text className="text-base text-ink-soft">
                {formatDate(p.paymentDate)} · {t(p.paymentMethod)}
              </Text>
            </View>
            <Text className="text-xl font-bold text-ink">{formatINR(p.amountPaid)}</Text>
          </View>
          <View className="mt-2 rounded-xl bg-section px-3 py-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-base text-ink-soft">
                {t('cycle')}: {formatDate(p.cycleStartDate)} – {formatDate(p.cycleEndDate)}
              </Text>
              <StatusBadge status={p.balanceAfter === 0 ? 'paid' : 'partial'} />
            </View>
            <Text className="text-base text-ink-soft">
              {t('salaryDue')}: {formatINR(p.totalSalary)} · {duration(p.totalWorkingMinutes)}
            </Text>
            {p.balanceAfter !== null ? (
              <Text className="text-base text-pending">
                {t('balanceAfter')}: {formatINR(p.balanceAfter)}
              </Text>
            ) : null}
          </View>
        </Pressable>
      );
    }
  }
}
