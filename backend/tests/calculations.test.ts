import { describe, expect, it } from 'vitest';
import {
  calcCashBalance,
  calcDriverSalary,
  calcPending,
  calcProfit,
  calcTotalExpenses,
  calcWorkAmount,
  calcWorkingMinutes,
  cycleForDate,
  paymentStatus,
  summarisePeriod,
} from '../src/services/calculations';
import { addDays, monthRange } from '../src/utils/dates';
import { paiseToRupees, rupeesToPaise } from '../src/utils/money';

const R = rupeesToPaise;

describe('work time and amount', () => {
  it('Ramesh: 8 AM to 12 PM at ₹800/hour = 4 hours, ₹3,200', () => {
    const minutes = calcWorkingMinutes('08:00', '12:00');
    expect(minutes).toBe(240);
    expect(calcWorkAmount(minutes, R(800))).toBe(R(3200));
  });

  it('handles partial hours accurately', () => {
    expect(calcWorkingMinutes('08:00', '10:20')).toBe(140);
    expect(calcWorkAmount(140, R(750))).toBe(R(1750));
    // 1 hour 10 minutes at ₹800 = ₹933.33
    expect(paiseToRupees(calcWorkAmount(70, R(800)))).toBe(933.33);
  });

  it('handles work that crosses midnight', () => {
    expect(calcWorkingMinutes('22:00', '01:30')).toBe(210);
    expect(calcWorkAmount(210, R(800))).toBe(R(2800));
    expect(calcWorkingMinutes('23:45', '00:15')).toBe(30);
  });

  it('same from/to time is zero (invalid) work', () => {
    expect(calcWorkingMinutes('09:00', '09:00')).toBe(0);
  });
});

describe('driver salary, expenses and profit', () => {
  it('matches the specification example', () => {
    const driverSalary = calcDriverSalary(240, R(200));
    expect(driverSalary).toBe(R(800));
    const total = calcTotalExpenses(driverSalary, R(600), R(100));
    expect(total).toBe(R(1500));
    expect(calcProfit(R(3200), total)).toBe(R(1700));
  });

  it('10-day cycle: 40 hours at ₹200 = ₹8,000 salary', () => {
    expect(calcDriverSalary(40 * 60, R(200))).toBe(R(8000));
  });

  it('profit can be negative', () => {
    expect(calcProfit(R(1000), R(2500))).toBe(R(-1500));
  });

  it('summarisePeriod mixes jobs with different rates', () => {
    const s = summarisePeriod(
      [
        { totalWorkAmount: R(3200), workingMinutes: 240, driverWorkingMinutes: 240, driverHourlyRateSnapshot: R(200) },
        { totalWorkAmount: R(1800), workingMinutes: 120, driverWorkingMinutes: 120, driverHourlyRateSnapshot: R(250) },
      ],
      [
        { category: 'diesel', amount: R(600) },
        { category: 'repair', amount: R(400) },
        { category: 'other', amount: R(100) },
      ],
    );
    expect(s.workAmount).toBe(R(5000));
    expect(s.driverSalary).toBe(R(800 + 500));
    expect(s.dieselExpenses).toBe(R(600));
    expect(s.otherExpenses).toBe(R(500));
    expect(s.totalExpenses).toBe(R(2400));
    expect(s.profit).toBe(R(2600));
  });
});

describe('customer pending and status', () => {
  it('partial and full payments', () => {
    expect(calcPending(R(3200), [R(1000), R(1000)])).toBe(R(1200));
    expect(paymentStatus(R(3200), R(2000))).toBe('partial');
    expect(calcPending(R(3200), [R(1000), R(1000), R(1200)])).toBe(0);
    expect(paymentStatus(R(3200), R(3200))).toBe('paid');
    expect(paymentStatus(R(3200), 0)).toBe('pending');
  });
});

describe('cash balance', () => {
  it('counts driver salary only when paid, never twice', () => {
    // Received ₹2,000; diesel ₹600 + other ₹100 paid; driver paid ₹500.
    expect(calcCashBalance(R(2000), R(700), R(500))).toBe(R(800));
  });
});

describe('10-day driver cycles', () => {
  const start = '2026-11-01';
  it('generates consecutive 10-day periods from the start date', () => {
    expect(cycleForDate('2026-11-01', start)).toMatchObject({ index: 0, startDate: '2026-11-01', endDate: '2026-11-10' });
    expect(cycleForDate('2026-11-10', start)).toMatchObject({ index: 0 });
    expect(cycleForDate('2026-11-11', start)).toMatchObject({ index: 1, startDate: '2026-11-11', endDate: '2026-11-20' });
    expect(cycleForDate('2026-11-30', start)).toMatchObject({ index: 2, startDate: '2026-11-21', endDate: '2026-11-30' });
  });
  it('does not assume months split into three equal parts', () => {
    // 31-day month: Dec 1 is cycle 3 starting Dec 1, Dec 31 is cycle 6 starting Dec 31.
    expect(cycleForDate('2026-12-31', start)).toMatchObject({ index: 6, startDate: '2026-12-31', endDate: '2027-01-09' });
    expect(cycleForDate('2027-02-28', '2027-02-01')).toMatchObject({ startDate: '2027-02-21', endDate: '2027-03-02' });
  });
  it('dates before the start date belong to earlier cycles', () => {
    expect(cycleForDate('2026-10-31', start)).toMatchObject({ index: -1, startDate: '2026-10-22', endDate: '2026-10-31' });
  });
});

describe('date helpers', () => {
  it('month range and addDays', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('rupee/paise conversion avoids floating point errors', () => {
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(rupeesToPaise(1234.56)).toBe(123456);
    expect(paiseToRupees(123456)).toBe(1234.56);
  });
});
