import { router } from 'expo-router';
import { ChevronRight, Settings as SettingsIcon, Tractor } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makePeriod, PeriodFilter, type Period } from '@/components/PeriodFilter';
import { Button, Card, Divider, EmptyState, ErrorView, LoadingView, MoneyCard, Notice, Row, Screen, Section, StatusBadge } from '@/components/ui';
import { WorkRow } from '@/components/WorkRow';
import { COLORS } from '@/constants/config';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import { formatDate, formatINR, todayString } from '@/utils/format';

export default function HomeScreen() {
  const { t, duration } = useI18n();
  const insets = useSafeAreaInsets();
  const errorMessage = useErrorMessage();
  const [period, setPeriod] = useState<Period>(makePeriod('today'));

  const params =
    period.kind === 'today'
      ? { date: period.from }
      : period.kind === 'month'
        ? { month: period.from.slice(0, 7) }
        : { from: period.from, to: period.to };

  const summary = useQuery(`summary:${JSON.stringify(params)}`, () => api.summary(params));
  const driver = useQuery('driver-summary', () => api.driverSummary());

  const s = summary.data;
  const moneyTitle = period.kind === 'today' ? t('todaysMoney') : period.kind === 'month' ? t('monthsMoney') : t('periodMoney');
  const profitTitle = period.kind === 'today' ? t('todaysProfit') : period.kind === 'month' ? t('monthsProfit') : t('periodProfit');
  const workTitle = period.kind === 'today' ? t('todaysWork') : t('periodWork');
  const isLoss = (s?.profit ?? 0) < 0;
  const refresh = () => {
    void summary.refresh();
    void driver.refresh();
  };

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-profit-light">
            <Tractor color={COLORS.brand} size={26} />
          </View>
          <View className="ml-3">
            <Text className="text-2xl font-extrabold text-ink">{t('appName')}</Text>
            <Text className="text-base text-ink-soft">{formatDate(todayString())}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('settings')} onPress={() => router.push('/settings')} className="rounded-xl p-3 active:bg-section">
          <SettingsIcon color={COLORS.inkSoft} size={28} />
        </Pressable>
      </View>

      <Screen refreshing={summary.refreshing} onRefresh={refresh}>
        <PeriodFilter value={period} onChange={setPeriod} />
        {summary.fromCache ? <View className="mt-3"><Notice message={t('offline')} /></View> : null}

        {summary.loading ? (
          <LoadingView />
        ) : !s ? (
          <View className="mt-4">
            <ErrorView message={errorMessage(summary.error)} onRetry={summary.refresh} />
          </View>
        ) : (
          <>
            {/* Section A: money */}
            <Section title={moneyTitle}>
              <View className="flex-row" style={{ gap: 12 }}>
                <MoneyCard label={t('workAmount')} amount={s.workAmount} tone="plain" />
                <MoneyCard label={t('moneyReceived')} amount={s.moneyReceived} tone="blue" />
              </View>
              <View className="mt-3 flex-row" style={{ gap: 12 }}>
                <MoneyCard label={t('moneyPending')} amount={s.moneyPending} tone="orange" />
                <MoneyCard label={t('totalExpenses')} amount={s.totalExpenses} tone="red" />
              </View>
            </Section>

            {/* Section B: profit */}
            <View className={`mt-5 rounded-3xl p-5 ${isLoss ? 'bg-expense-light' : 'bg-profit'}`}>
              <Text className={`text-lg font-semibold ${isLoss ? 'text-expense' : 'text-white'}`}>
                {isLoss ? `${profitTitle} (${t('loss')})` : profitTitle}
              </Text>
              <Text className={`mt-1 text-5xl font-extrabold ${isLoss ? 'text-expense' : 'text-white'}`} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(s.profit)}
              </Text>
              <View className={`mt-4 rounded-2xl px-4 py-2 ${isLoss ? 'bg-white' : 'bg-white/15'}`}>
                {[
                  [t('workAmount'), s.workAmount, ''],
                  [t('driverSalaryShort'), s.driverSalary, '− '],
                  [t('diesel'), s.dieselExpenses, '− '],
                  [t('otherExpensesShort'), s.otherExpenses, '− '],
                ].map(([label, value, sign]) => (
                  <View key={String(label)} className="flex-row justify-between py-1">
                    <Text className={`text-base ${isLoss ? 'text-ink-soft' : 'text-white'}`}>{label}</Text>
                    <Text className={`text-base font-semibold ${isLoss ? 'text-ink' : 'text-white'}`}>
                      {sign}
                      {formatINR(Number(value))}
                    </Text>
                  </View>
                ))}
              </View>
              <Text className={`mt-3 text-sm ${isLoss ? 'text-ink-soft' : 'text-white'}`}>
                {t('cashInHand')}: <Text className="font-bold">{formatINR(s.cashBalance)}</Text>
              </Text>
            </View>
          </>
        )}

        {/* Section C: driver payment */}
        {driver.data ? (
          <Section title={t('driverPayment')}>
            <Card className="bg-section">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-ink">{driver.data.driverName}</Text>
                <StatusBadge status={driver.data.currentCycle.status} />
              </View>
              <Text className="mt-1 text-base text-ink-soft">
                {t('currentCycle')}: {formatDate(driver.data.currentCycle.startDate)} – {formatDate(driver.data.currentCycle.endDate)}
              </Text>
              <Text className="text-base text-ink-soft">
                {t('workingHours')}: {duration(driver.data.currentCycle.workingMinutes)}
              </Text>
              <Divider />
              <Row label={t('salaryEarned')} value={formatINR(driver.data.currentCycle.totalSalary)} />
              <Row label={t('alreadyPaid')} value={formatINR(driver.data.currentCycle.amountPaid)} valueClass="text-received" />
              <Row label={t('remainingToPay')} value={formatINR(driver.data.currentCycle.remaining)} valueClass="text-pending" />
              {driver.data.olderUnpaid > 0 ? (
                <Row label={t('olderUnpaid')} value={formatINR(driver.data.olderUnpaid)} valueClass="text-expense" />
              ) : null}
              <View className="mt-3">
                <Button title={t('openDriverPayments')} variant="outline" small onPress={() => router.navigate({ pathname: '/payments', params: { tab: 'driver' } })} />
              </View>
            </Card>
          </Section>
        ) : null}

        {/* Section D: work list */}
        {s ? (
          <Section
            title={workTitle}
            right={
              <Pressable onPress={() => router.navigate('/history')} className="flex-row items-center py-1" accessibilityRole="link">
                <Text className="text-base font-bold text-received">{t('viewAll')}</Text>
                <ChevronRight color={COLORS.received} size={20} />
              </Pressable>
            }
          >
            {s.works.length === 0 ? (
              <EmptyState message={t('noWorkToday')} />
            ) : (
              s.works.slice(0, 10).map((w) => <WorkRow key={w.id} work={w} showDate={period.kind !== 'today'} />)
            )}
          </Section>
        ) : null}
      </Screen>
    </View>
  );
}
