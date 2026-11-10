/**
 * Money is stored and calculated as INTEGER PAISE (1 rupee = 100 paise) to avoid
 * floating-point errors. The API accepts and returns rupees (numbers with up to 2 decimals).
 */

export function rupeesToPaise(rupees: number): number {
  // toFixed guards against values like 0.1 + 0.2 before rounding.
  return Math.round(Number((rupees * 100).toFixed(4)));
}

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/** Amount (paise) for a number of minutes at an hourly rate (paise/hour), rounded to the nearest paisa. */
export function amountForMinutes(minutes: number, hourlyRatePaise: number): number {
  return Math.round((minutes * hourlyRatePaise) / 60);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
