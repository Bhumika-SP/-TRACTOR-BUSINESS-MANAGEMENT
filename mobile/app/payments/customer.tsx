import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import { DateField } from '@/components/pickers';
import { useToast } from '@/components/Toast';
import { Button, Card, Chips, EmptyState, Field, FieldLabel, LoadingView, Notice, Row, Screen } from '@/components/ui';
import { COLORS } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useDebounced } from '@/hooks/useDebounced';
import { useDraft } from '@/hooks/useDraft';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useQuery } from '@/hooks/useQuery';
import { useI18n } from '@/i18n/I18nProvider';
import { api } from '@/services/api';
import { PAYMENT_METHODS, type PaymentMethod } from '@/types/api';
import { formatDate, formatINR, formatTime, parseAmount, todayString } from '@/utils/format';

const schema = z.object({
  workId: z.string().min(1, 'selectWork'),
  amount: z.string().refine((v) => parseAmount(v) > 0, 'invalidAmount'),
  paymentDate: z.string().min(10, 'required'),
  paymentMethod: z.enum(['cash', 'upi', 'bank']),
  note: z.string().max(300),
});
type FormValues = z.infer<typeof schema>;

/** Record one payment from a farmer for one job. Many payments can be added to the same job. */
export default function CustomerPaymentScreen() {
  const params = useLocalSearchParams<{ workId?: string }>();
  const { t, duration } = useI18n();
  const { canCreate } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { workId: params.workId ?? '', amount: '', paymentDate: todayString(), paymentMethod: 'cash', note: '' },
  });
  const draft = useDraft(params.workId ? `customer-payment:${params.workId}` : 'customer-payment', form);
  const workId = useWatch({ control: form.control, name: 'workId' });

  const work = useQuery(`work:${workId}`, () => api.work(workId), { enabled: Boolean(workId) });
  const dueWorks = useQuery(`due-works:${q}`, () => api.works({ status: 'due', search: q || undefined, limit: 30 }), { enabled: !workId });

  const pending = work.data?.pendingAmount ?? 0;

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    const amount = parseAmount(values.amount);
    if (amount > pending) {
      form.setError('amount', { message: 'amountMoreThanPending' });
      return;
    }
    try {
      await api.createCustomerPayment({
        workId: values.workId,
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

  // Step 1: choose the farmer / job.
  if (!workId) {
    return (
      <Screen refreshing={dueWorks.refreshing} onRefresh={dueWorks.refresh}>
        <Text className="mb-3 text-xl font-bold text-ink">{t('selectWork')}</Text>
        <View className="mb-4 flex-row items-center rounded-xl border-2 border-line px-3">
          <Search color={COLORS.inkFaint} size={22} />
          <TextInput value={search} onChangeText={setSearch} placeholder={t('searchFarmer')} placeholderTextColor={COLORS.inkFaint} className="ml-2 flex-1 py-3 text-lg text-ink" />
        </View>
        {dueWorks.loading ? (
          <LoadingView />
        ) : (dueWorks.data?.data.length ?? 0) === 0 ? (
          <EmptyState message={q ? t('nothingFound') : t('noPendingWork')} />
        ) : (
          dueWorks.data!.data.map((w) => (
            <Pressable key={w.id} onPress={() => form.setValue('workId', w.id)} className="mb-3 rounded-2xl border border-line p-4 active:bg-section">
              <View className="flex-row justify-between">
                <Text className="flex-1 text-lg font-bold text-ink">{w.customerName}</Text>
                <Text className="text-lg font-bold text-pending">{formatINR(w.pendingAmount)}</Text>
              </View>
              <Text className="text-base text-ink-soft">
                {formatDate(w.workDate)} · {formatTime(w.fromTime)} – {formatTime(w.toTime)} · {duration(w.workingMinutes)}
              </Text>
            </Pressable>
          ))
        )}
      </Screen>
    );
  }

  // Step 2: payment details.
  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Screen footer={<Button title={t('savePayment')} variant="secondary" onPress={onSubmit} loading={form.formState.isSubmitting} disabled={!work.data || pending <= 0} />}>
        {draft.restored ? <Notice message={t('draftRestored')} tone="blue" /> : null}
        {submitError ? <Notice message={submitError} tone="red" /> : null}

        {work.loading ? (
          <LoadingView />
        ) : work.data ? (
          <Card className="mb-4 bg-section">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-xl font-bold text-ink">{work.data.customerName}</Text>
              {!params.workId ? (
                <Pressable onPress={() => form.setValue('workId', '')} className="px-2 py-1">
                  <Text className="text-base font-bold text-received">{t('changeWork')}</Text>
                </Pressable>
              ) : null}
            </View>
            <Text className="text-base text-ink-soft">
              {formatDate(work.data.workDate)} · {formatTime(work.data.fromTime)} – {formatTime(work.data.toTime)}
            </Text>
            <Row label={t('totalWorkAmount')} value={formatINR(work.data.totalWorkAmount)} />
            <Row label={t('amountReceived')} value={formatINR(work.data.amountReceived)} valueClass="text-received" />
            <Row label={t('totalPending')} value={formatINR(pending)} valueClass="text-pending text-2xl" />
          </Card>
        ) : null}

        <Controller
          control={form.control}
          name="amount"
          render={({ field, fieldState }) => (
            <Field label={t('amount')} value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="0" error={err(fieldState.error?.message)} />
          )}
        />
        {pending > 0 ? (
          <View className="-mt-2 mb-4 self-start">
            <Button title={`${t('fullAmount')}: ${formatINR(pending)}`} small variant="outline" onPress={() => form.setValue('amount', String(pending))} />
          </View>
        ) : null}
        <Controller
          control={form.control}
          name="paymentDate"
          render={({ field }) => <DateField label={t('paymentDate')} value={field.value} onChange={field.onChange} />}
        />
        <FieldLabel>{t('paymentMethod')}</FieldLabel>
        <Controller
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <Chips<PaymentMethod> value={field.value} onChange={field.onChange} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(m) }))} />
          )}
        />
        <View className="mt-4">
          <Controller
            control={form.control}
            name="note"
            render={({ field }) => <Field label={t('noteOptional')} value={field.value} onChangeText={field.onChange} maxLength={300} />}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
