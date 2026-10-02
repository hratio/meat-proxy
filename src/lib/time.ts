/** Compact elapsed time: seconds < 3m, minutes < 2h, hours/minutes < 48h, then days. */
export function timeAgo(value: string | number | Date, now = Date.now()): string {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return 'Unknown time';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const unit = (count: number, name: string) => `${count} ${name}${count === 1 ? '' : 's'}`;
  if (seconds < 180) return `${unit(seconds, 'second')} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 120) return `${unit(minutes, 'minute')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${unit(hours, 'hour')}${minutes % 60 ? ` ${unit(minutes % 60, 'minute')}` : ''} ago`;
  return `${unit(Math.floor(hours / 24), 'day')} ago`;
}
