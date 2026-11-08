export function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

export function toEpoch(dateStr?: string | null): number | null {
  if (!dateStr || !dateStr.trim()) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

export function toLocalInput(epochSecs?: number | null): string {
  if (epochSecs == null) return '';
  const d = new Date(epochSecs * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function toDateInput(epochSecs?: number | null): string {
  if (epochSecs == null) return '';
  const d = new Date(epochSecs * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtTime(epochSecs: number): string {
  const d = new Date(epochSecs * 1000);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d * 1000) : d;
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtMonth(d: Date): string {
  return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

export function fmtFull(epochSecs: number): string {
  const d = new Date(epochSecs * 1000);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtRelative(epochSecs: number): string {
  const now = nowEpoch();
  const diff = epochSecs - now;
  const abs = Math.abs(diff);

  if (abs < 60) return diff >= 0 ? 'in a few seconds' : 'just now';
  if (abs < 3600) {
    const m = Math.floor(abs / 60);
    return diff >= 0 ? `in ${m}m` : `${m}m ago`;
  }
  if (abs < 86400) {
    const h = Math.floor(abs / 3600);
    return diff >= 0 ? `in ${h}h` : `${h}h ago`;
  }
  const days = Math.floor(abs / 86400);
  return diff >= 0 ? `in ${days}d` : `${days}d ago`;
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayKey(epochSecs: number): string {
  const d = new Date(epochSecs * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
