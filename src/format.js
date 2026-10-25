// Display formatting. Averages stay exact fractions; rounding happens only here (PLAN.md §3.3).

/** { num, den } → "6.25 (25/4)". Rounds half up using integer math, so no floating-point surprises. */
export function formatAverage({ num, den }) {
  const hundredths = Math.floor((200 * num + den) / (2 * den));
  const whole = Math.floor(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, '0');
  return `${whole}.${frac} (${num}/${den})`;
}
