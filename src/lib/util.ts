// Shared primitives: ids, money, dates, escaping, formatting.

export type Cents = number;

export function nowIso(): string {
  return new Date().toISOString();
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a.length <= 10 ? `${a}T00:00:00Z` : a).getTime();
  const db = new Date(b.length <= 10 ? `${b}T00:00:00Z` : b).getTime();
  return Math.round((db - da) / 86_400_000);
}

export function monthStart(d = new Date()): string {
  return `${d.toISOString().slice(0, 7)}-01`;
}

export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomToken(9)}`;
}

export function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function money(cents: number | null | undefined, currency = 'USD'): string {
  const n = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function moneyExact(cents: number | null | undefined, currency = 'USD'): string {
  const n = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function parseMoney(input: unknown): number {
  if (input === null || input === undefined || input === '') return 0;
  const raw = String(input).replace(/[^0-9.\-]/g, '');
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2);
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const iso = value.length === 10 ? `${value}T00:00:00Z` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function fmtDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}

export function relTime(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return fmtDate(value);
}

export function dueLabel(date: string | null | undefined): { text: string; tone: string } {
  if (!date) return { text: 'No date', tone: 'neutral' };
  const diff = daysBetween(today(), date.slice(0, 10));
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, tone: 'danger' };
  if (diff === 0) return { text: 'Due today', tone: 'warn' };
  if (diff <= 7) return { text: `Due in ${diff}d`, tone: 'warn' };
  return { text: fmtDate(date), tone: 'neutral' };
}

export function titleize(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function csv(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function truncate(value: string | null | undefined, len = 90): string {
  if (!value) return '';
  const s = String(value);
  return s.length > len ? `${s.slice(0, len - 1)}…` : s;
}

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}
