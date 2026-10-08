import type { MatchSummary } from './types';

/** Whole years between a YYYY-MM-DD birthdate and `today`. */
export function ageFrom(birthdate: string, today: Date = new Date()): number {
  const [y, m, d] = birthdate.split('-').map(Number);
  let age = today.getFullYear() - y;
  const beforeBirthday = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Parses a date typed as MM/DD/YYYY into YYYY-MM-DD, or null if it isn't a
 * real calendar date.
 */
export function parseBirthdate(input: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const [, mm, dd, yyyy] = match.map(Number);
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (date.getUTCFullYear() !== yyyy || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) {
    return null;
  }
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** Formats the server's whole-mile distance bucket. */
export function distanceLabel(miles: number): string {
  return miles <= 1 ? 'Under 1 mi away' : `${miles} mi away`;
}

/** Normalises a phone number to E.164, assuming +1 when no country code is given. */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function matchPreview(match: MatchSummary, myId: string): string {
  if (!match.last_kind) return 'New match — say hi 👋';
  const mine = match.last_sender_id === myId;
  switch (match.last_kind) {
    case 'snap':
      return mine ? 'You sent a snap' : '📸 New snap';
    case 'screenshot':
      return mine ? 'You took a screenshot' : `${match.display_name} took a screenshot`;
    default:
      return (mine ? 'You: ' : '') + (match.last_body ?? '');
  }
}
