import { View } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { currentMonth, todayString } from '@/utils/format';
import { DateField } from './pickers';
import { Chips } from './ui';

export type PeriodKind = 'all' | 'today' | 'month' | 'custom';
export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
}

export function makePeriod(kind: PeriodKind, custom?: { from: string; to: string }): Period {
  const today = todayString();
  if (kind === 'today') return { kind, from: today, to: today };
  if (kind === 'month') return { kind, from: `${currentMonth()}-01`, to: today };
  if (kind === 'custom') return { kind, from: custom?.from ?? today, to: custom?.to ?? today };
  return { kind, from: '', to: '' };
}

/** Today / This Month / Choose Dates (and optionally All Time). */
export function PeriodFilter({ value, onChange, allowAll = false }: { value: Period; onChange: (p: Period) => void; allowAll?: boolean }) {
  const { t } = useI18n();
  const options = [
    ...(allowAll ? [{ value: 'all' as const, label: t('allTime') }] : []),
    { value: 'today' as const, label: t('today') },
    { value: 'month' as const, label: t('thisMonth') },
    { value: 'custom' as const, label: t('chooseDates') },
  ];
  return (
    <View>
      <Chips options={options} value={value.kind} onChange={(k) => onChange(makePeriod(k, value.kind === 'custom' ? value : undefined))} />
      {value.kind === 'custom' ? (
        <View className="mt-3 flex-row" style={{ gap: 12 }}>
          <DateField
            label={t('from')}
            value={value.from}
            onChange={(from) => onChange({ ...value, from, to: value.to < from ? from : value.to })}
          />
          <DateField
            label={t('to')}
            value={value.to}
            onChange={(to) => onChange({ ...value, to, from: value.from > to ? to : value.from })}
          />
        </View>
      ) : null}
    </View>
  );
}
