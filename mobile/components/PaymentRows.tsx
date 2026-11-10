import { router } from 'expo-router';
import { Fuel, Wrench } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { COLORS } from '@/constants/config';
import { useI18n } from '@/i18n/I18nProvider';
import type { Cycle, Expense } from '@/types/api';
import { formatDate, formatINR } from '@/utils/format';
import { Divider, Row, StatusBadge } from './ui';

/** One 10-day driver salary period. */
export function CycleCard({ cycle }: { cycle: Cycle }) {
  const { t, duration } = useI18n();
  const rateText = cycle.hourlyRates.length > 1 ? cycle.hourlyRates.map((r) => formatINR(r)).join(' / ') : formatINR(cycle.hourlyRate);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/payments/cycle/[start]', params: { start: cycle.startDate } })}
      className={`mb-3 rounded-2xl border p-4 active:bg-section ${cycle.isCurrent ? 'border-brand bg-profit-light/40' : 'border-line bg-white'}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-ink">
          {formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}
        </Text>
        <StatusBadge status={cycle.status} />
      </View>
      {cycle.isCurrent ? <Text className="text-base font-semibold text-brand">{t('currentCycle')}</Text> : null}
      <Divider />
      <Row label={t('workingHours')} value={duration(cycle.workingMinutes)} />
      <Row label={t('driverRate')} value={rateText} />
      <Row label={t('salaryEarned')} value={formatINR(cycle.totalSalary)} />
      <Row label={t('alreadyPaid')} value={formatINR(cycle.amountPaid)} valueClass="text-received" />
      <Row label={t('remainingToPay')} value={formatINR(cycle.remaining)} valueClass={cycle.remaining > 0 ? 'text-pending' : 'text-profit'} />
      {cycle.overpaid > 0 ? <Row label={t('overpaid')} value={formatINR(cycle.overpaid)} valueClass="text-expense" /> : null}
    </Pressable>
  );
}

/** One expense in a list. */
export function ExpenseRow({ expense }: { expense: Expense }) {
  const { t } = useI18n();
  const Icon = expense.category === 'diesel' ? Fuel : Wrench;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/payments/expense', params: { id: expense.id } })}
      className="mb-3 flex-row items-center rounded-2xl border border-line bg-white p-4 active:bg-section"
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-expense-light">
        <Icon color={COLORS.expense} size={22} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-lg font-bold text-ink">{t(expense.category)}</Text>
        <Text className="text-base text-ink-soft" numberOfLines={1}>
          {formatDate(expense.expenseDate)}
          {expense.description ? ` · ${expense.description}` : ''}
        </Text>
      </View>
      <Text className="text-xl font-bold text-expense">{formatINR(expense.amount)}</Text>
    </Pressable>
  );
}
