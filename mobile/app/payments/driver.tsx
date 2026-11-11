import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { z } from 'zod';
import { DateField } from '@/components/pickers';
import { useToast } from '@/components/Toast';
import { Button, Card, Chips, EmptyState, Field, FieldLabel, LoadingView, Notice, Row, Screen, StatusBadge } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useDraft } from '@/hooks/useDraft';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import { PAYMENT_METHODS, type PaymentMethod } from '@/types/api';
import { formatDate, formatINR, parseAmount, todayString } from '@/utils/format';

const schema = z.object({
  cycleStartDate: z.string().min(10, 'selectCycle'),
  amount: z.string().refine((v) => parseAmount(v) > 0, 'invalidAmount'),
  paymentDate: z.string().min(10, 'required'),
  paymentMethod: z.enum(['cash', 'upi', 'bank']),
  note: z.string().max(300),
});
type FormValues = z.infer<typeof schema>;

/** Pay the driver for one 10-day period. Part payments are allowed. */
export default function PayDriverScreen() {
  const params = useLocalSearchParams<{ cycleStart?: string }>();
  const { t, duration } = useI18n();
  const { canCreate } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cycles = useQuery('cycles-pending', () => api.cycles({ status: 'pending', limit: 50 }));
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { cycleStartDate: params.cycleStart ?? '', amount: '', paymentDate: todayString(), paymentMethod: 'cash', note: '' },
  });
  const draft = useDraft('driver-payment', form);
  const selectedStart = useWatch({ control: form.control, name: 'cycleStartDate' });
  const pendingCycles = useMemo(() => cycles.data?.data ?? [], [cycles.data]);
  const cycle = pendingCycles.find((c) => c.startDate === selectedStart);

  // Pick the oldest unpaid period automatically.
  useEffect(() => {
    if (draft.loaded && !form.getValues('cycleStartDate') && pendingCycles.length > 0) {
      form.setValue('cycleStartDate', pendingCycles[pendingCycles.length - 1].startDate);
    }
  }, [draft.loaded, pendingCycles, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    const amount = parseAmount(values.amount);
    if (cycle && amount > cycle.remaining) {
      form.setError('amount', { message: 'amountMoreThanPending' });
      return;
    }
    try {
      await api.createDriverPayment({
        cycleStartDate: values.cycleStartDate,
        amount,
        paymentDate: values.paymentDate,
        paymentMethod: values.paymentMethod,
        note: values.note.trim(),
        requestId: draft.requestId,
      });
      await draft.clearDraft();
      toast.show(t('paymentSaved'));
      router.back();
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  });

  const err = (key?: string) => (key ? t(key as Parameters<typeof t>[0]) ?? key : undefined);
  if (!canCreate) return <Screen><Notice message={t('readOnly')} /></Screen>;
  if (cycles.loading) return <Screen><LoadingView /></Screen>;
  if (pendingCycles.length === 0) return <Screen><EmptyState message={t('noCycles')} /></Screen>;

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Screen footer={<Button title={t('payDriver')} onPress={onSubmit} loading={form.formState.isSubmitting} disabled={!cycle} />}>
        {draft.restored ? <Notice message={t('draftRestored')} tone="blue" /> : null}
        {submitError ? <Notice message={submitError} tone="red" /> : null}

        <FieldLabel>{t('selectCycle')}</FieldLabel>
        {pendingCycles.map((c) => {
          const selected = c.startDate === selectedStart;
          return (
            <Pressable
              key={c.startDate}
              onPress={() => form.setValue('cycleStartDate', c.startDate)}
              className={`mb-2 flex-row items-center justify-between rounded-xl border-2 px-4 py-3 ${selected ? 'border-brand bg-profit-light' : 'border-line bg-white'}`}
            >
              <Text className="text-lg font-semibold text-ink">
                {formatDate(c.startDate)} – {formatDate(c.endDate)}
              </Text>
              <Text className="text-lg font-bold text-pending">{formatINR(c.remaining)}</Text>
            </Pressable>
          );
        })}

        {cycle ? (
          <Card className="mb-4 mt-2 bg-section">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-ink">{t('cycle')}</Text>
              <StatusBadge status={cycle.status} />
            </View>
            <Row label={t('workingHours')} value={duration(cycle.workingMinutes)} />
            <Row label={t('driverRate')} value={formatINR(cycle.hourlyRate)} />
            <Row label={t('salaryDue')} value={formatINR(cycle.totalSalary)} />
            <Row label={t('alreadyPaid')} value={formatINR(cycle.amountPaid)} valueClass="text-received" />
            <Row label={t('remainingToPay')} value={formatINR(cycle.remaining)} valueClass="text-pending text-2xl" />
          </Card>
        ) : null}

        <Controller
          control={form.control}
          name="amount"
          render={({ field, fieldState }) => (
            <Field label={t('amount')} value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="0" error={err(fieldState.error?.message)} />
          )}
        />
        {cycle && cycle.remaining > 0 ? (
          <View className="-mt-2 mb-4 self-start">
            <Button title={`${t('fullAmount')}: ${formatINR(cycle.remaining)}`} small variant="outline" onPress={() => form.setValue('amount', String(cycle.remaining))} />
          </View>
        ) : null}
        <Controller control={form.control} name="paymentDate" render={({ field }) => <DateField label={t('paymentDate')} value={field.value} onChange={field.onChange} />} />
        <FieldLabel>{t('paymentMethod')}</FieldLabel>
        <Controller
          control={form.control}
          name="paymentMethod"
          render={({ field }) => <Chips<PaymentMethod> value={field.value} onChange={field.onChange} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(m) }))} />}
        />
        <View className="mt-4">
          <Controller control={form.control} name="note" render={({ field }) => <Field label={t('noteOptional')} value={field.value} onChangeText={field.onChange} maxLength={300} />} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
