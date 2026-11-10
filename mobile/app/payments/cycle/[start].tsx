import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ReasonDialog } from '@/components/ReasonDialog';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, EmptyState, ErrorView, LoadingView, Row, Screen, Section, StatusBadge } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import type { DriverPayment } from '@/types/api';
import { formatDate, formatINR } from '@/utils/format';

/** One 10-day period: salary earned, payments made, balance. */
export default function CycleDetailScreen() {
  const { start } = useLocalSearchParams<{ start: string }>();
  const { t, duration } = useI18n();
  const { canCreate, canEdit } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const q = useQuery(`cycle:${start}`, () => api.cycle(start));
  const [voiding, setVoiding] = useState<DriverPayment | null>(null);

  const c = q.data;
  if (q.loading) return <Screen><LoadingView /></Screen>;
  if (!c) return <Screen><ErrorView message={errorMessage(q.error)} onRetry={q.refresh} /></Screen>;

  return (
    <Screen
      refreshing={q.refreshing}
      onRefresh={q.refresh}
      footer={
        canCreate && c.remaining > 0 ? (
          <Button title={t('payDriver')} onPress={() => router.push({ pathname: '/payments/driver', params: { cycleStart: c.startDate } })} />
        ) : undefined
      }
    >
      <Card>
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-ink">{c.driverName}</Text>
          <StatusBadge status={c.status} />
        </View>
        <Text className="text-base text-ink-soft">
          {formatDate(c.startDate)} – {formatDate(c.endDate)}
        </Text>
        <Divider />
        <Row label={t('workingHours')} value={duration(c.workingMinutes)} />
        <Row label={t('driverRate')} value={c.hourlyRates.length > 1 ? c.hourlyRates.map((r) => formatINR(r)).join(' / ') : formatINR(c.hourlyRate)} />
        <Row label={t('salaryEarned')} value={formatINR(c.totalSalary)} />
        <Row label={t('alreadyPaid')} value={formatINR(c.amountPaid)} valueClass="text-received" />
        <Row label={t('remainingToPay')} value={formatINR(c.remaining)} valueClass={c.remaining > 0 ? 'text-pending text-2xl' : 'text-profit text-2xl'} />
        {c.overpaid > 0 ? <Row label={t('overpaid')} value={formatINR(c.overpaid)} valueClass="text-expense" /> : null}
      </Card>

      <Section title={t('paymentHistory')}>
        {c.payments.length === 0 ? (
          <EmptyState message={t('noPaymentsYet')} />
        ) : (
          c.payments.map((p) => (
            <Card key={p.id} className={`mb-3 ${p.isVoided ? 'opacity-60' : ''}`}>
              <View className="flex-row items-center justify-between">
                <Text className={`text-xl font-bold ${p.isVoided ? 'text-ink-faint line-through' : 'text-received'}`}>{formatINR(p.amountPaid)}</Text>
                {p.isVoided ? <StatusBadge status="cancelled" /> : <Text className="text-base font-semibold text-ink-soft">{t(p.paymentMethod)}</Text>}
              </View>
              <Text className="text-base text-ink-soft">{formatDate(p.paymentDate)}</Text>
              {p.balanceAfter !== null ? (
                <Text className="text-base text-ink-soft">
                  {t('balanceAfter')}: <Text className="font-bold text-pending">{formatINR(p.balanceAfter)}</Text>
                </Text>
              ) : null}
              {p.note ? <Text className="text-base text-ink-soft">{p.note}</Text> : null}
              {p.isVoided && p.voidReason ? <Text className="text-sm text-ink-faint">{t('reason')}: {p.voidReason}</Text> : null}
              {canEdit && !p.isVoided ? (
                <Pressable onPress={() => setVoiding(p)} className="mt-2 self-start py-1">
                  <Text className="text-base font-semibold text-expense">{t('cancelPayment')}</Text>
                </Pressable>
              ) : null}
            </Card>
          ))
        )}
      </Section>

      <ReasonDialog
        visible={voiding !== null}
        title={t('cancelPayment')}
        message={t('confirmCancelPayment')}
        confirmLabel={t('confirm')}
        onClose={() => setVoiding(null)}
        onConfirm={async (reason) => {
          try {
            await api.voidDriverPayment(voiding!.id, reason);
            toast.show(t('paymentCancelled'));
            void q.refresh();
          } catch (err) {
            toast.show(errorMessage(err), 'error');
          } finally {
            setVoiding(null);
          }
        }}
      />
    </Screen>
  );
}
