export function formatSessionDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;

  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${dateStr}, ${time}`;
}
