/** "8 h", "1 h 30 min", "10 min": how long an effect has left. */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h >= 48 && rest === 0) return `${Math.round(h / 24)} days`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
