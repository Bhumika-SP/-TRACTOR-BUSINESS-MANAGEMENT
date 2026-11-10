import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import type { Work } from '@/types/api';
import { formatDate, formatINR, formatTime } from '@/utils/format';
import { StatusBadge } from './ui';

/** One job in a list: farmer, time, hours, amount, received and pending. */
export function WorkRow({ work, showDate = true }: { work: Work; showDate?: boolean }) {
  const { t, duration } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/work/[id]', params: { id: work.id } })}
      className="mb-3 rounded-2xl border border-line bg-white p-4 active:bg-section"
    >
      <View className="flex-row items-start justify-between">
        <View className="mr-3 flex-1">
          <Text className="text-lg font-bold text-ink" numberOfLines={1}>
            {work.customerName}
          </Text>
          <Text className="mt-1 text-base text-ink-soft">
            {showDate ? `${formatDate(work.workDate)} · ` : ''}
            {formatTime(work.fromTime)} – {formatTime(work.toTime)}
          </Text>
          <Text className="text-base text-ink-soft">{duration(work.workingMinutes)}</Text>
        </View>
        <View className="items-end">
          <Text className="text-xl font-bold text-ink">{formatINR(work.totalWorkAmount)}</Text>
          <View className="mt-1">
            <StatusBadge status={work.paymentStatus} />
          </View>
        </View>
      </View>
      <View className="mt-3 flex-row justify-between rounded-xl bg-section px-3 py-2">
        <Text className="text-base text-received">
          {t('amountReceived')}: <Text className="font-bold">{formatINR(work.amountReceived)}</Text>
        </Text>
        <Text className="text-base text-pending">
          {t('pending')}: <Text className="font-bold">{formatINR(work.pendingAmount)}</Text>
        </Text>
      </View>
    </Pressable>
  );
}
