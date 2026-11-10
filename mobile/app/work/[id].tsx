import { router, useLocalSearchParams } from 'expo-router';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ReasonDialog } from '@/components/ReasonDialog';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, EmptyState, ErrorView, LoadingView, Row, Screen, Section, StatusBadge } from '@/components/ui';
import { COLORS } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import type { CustomerPayment } from '@/types/api';
import { formatDate, formatINR, formatTime } from '@/utils/format';

/** Full work details with every payment received for it. */
export default function WorkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, duration } = useI18n();
  const { canCreate, canEdit } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const q = useQuery(`work:${id}`, () => api.work(id));
  const [deleting, setDeleting] = useState(false);
  const [voiding, setVoiding] = useState<CustomerPayment | null>(null);

  const w = q.data;
  if (q.loading) return <Screen><LoadingView /></Screen>;
  if (!w) return <Screen><ErrorView message={errorMessage(q.error)} onRetry={q.refresh} /></Screen>;

  const methodLabel = (m: string) => t(m as 'cash' | 'upi' | 'bank');

  return (
    <Screen
      refreshing={q.refreshing}
      onRefresh={q.refresh}
      footer={
        canCreate && w.pendingAmount > 0 ? (
          <Button
            title={t('recordPayment')}
            variant="secondary"
            icon={<Plus color={COLORS.white} size={24} />}
            onPress={() => router.push({ pathname: '/payments/customer', params: { workId: w.id } })}
          />
        ) : undefined
      }
    >
      <Card>
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-2xl font-bold text-ink">{w.customerName}</Text>
            {w.customerPhone ? <Text className="text-base text-ink-soft">{w.customerPhone}</Text> : null}
          </View>
          <StatusBadge status={w.paymentStatus} />
        </View>
        <Divider />
        <Row label={t('workDate')} value={formatDate(w.workDate)} />
        <Row label={t('fromTime')} value={formatTime(w.fromTime)} />
        <Row label={t('toTime')} value={formatTime(w.toTime)} />
        <Row label={t('runningTime')} value={duration(w.workingMinutes)} />
        <Row label={t('rate')} value={`${formatINR(w.tractorHourlyRate)} / ${t('hours')}`} />
        {w.description ? <Row label={t('description')} value={w.description} /> : null}
        <Divider />
        <Row label={t('totalWorkAmount')} value={formatINR(w.totalWorkAmount)} valueClass="text-ink text-xl" />
        <Row label={t('amountReceived')} value={formatINR(w.amountReceived)} valueClass="text-received" />
        <Row label={t('pendingAmount')} value={formatINR(w.pendingAmount)} valueClass="text-pending" />
        <Row label={t('driverSalaryShort')} value={formatINR(w.driverSalary)} valueClass="text-ink-soft" />
      </Card>

      {canEdit ? (
        <View className="mt-4 flex-row" style={{ gap: 12 }}>
          <View className="flex-1">
            <Button title={t('edit')} variant="outline" small icon={<Pencil color={COLORS.ink} size={20} />} onPress={() => router.push({ pathname: '/work/new', params: { id: w.id } })} />
          </View>
          <View className="flex-1">
            <Button title={t('delete')} variant="danger" small icon={<Trash2 color={COLORS.expense} size={20} />} onPress={() => setDeleting(true)} />
          </View>
        </View>
      ) : null}

      <Section title={t('paymentHistory')}>
        {w.payments.length === 0 ? (
          <EmptyState message={t('noPaymentsYet')} />
        ) : (
          w.payments.map((p) => (
            <Card key={p.id} className={`mb-3 ${p.isVoided ? 'opacity-60' : ''}`}>
              <View className="flex-row items-center justify-between">
                <Text className={`text-xl font-bold ${p.isVoided ? 'text-ink-faint line-through' : 'text-received'}`}>{formatINR(p.amount)}</Text>
                {p.isVoided ? <StatusBadge status="cancelled" /> : <Text className="text-base font-semibold text-ink-soft">{methodLabel(p.paymentMethod)}</Text>}
              </View>
              <Text className="mt-1 text-base text-ink-soft">{formatDate(p.paymentDate)}</Text>
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

      {w.relatedExpenses.length > 0 ? (
        <Section title={t('relatedExpenses')}>
          {w.relatedExpenses.map((e) => (
            <Row key={e.id} label={`${t(e.category)} · ${formatDate(e.expenseDate)}`} value={formatINR(e.amount)} valueClass="text-expense" />
          ))}
        </Section>
      ) : null}

      <ReasonDialog
        visible={deleting}
        title={t('confirmDelete')}
        confirmLabel={t('delete')}
        onClose={() => setDeleting(false)}
        onConfirm={async (reason) => {
          try {
            await api.deleteWork(w.id, reason);
            setDeleting(false);
            toast.show(t('workDeleted'));
            router.back();
          } catch (err) {
            setDeleting(false);
            toast.show(errorMessage(err), 'error');
          }
        }}
      />
      <ReasonDialog
        visible={voiding !== null}
        title={t('cancelPayment')}
        message={t('confirmCancelPayment')}
        confirmLabel={t('confirm')}
        onClose={() => setVoiding(null)}
        onConfirm={async (reason) => {
          try {
            await api.voidCustomerPayment(voiding!.id, reason);
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
