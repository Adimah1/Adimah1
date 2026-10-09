import { ageFrom, distanceLabel, formatNaira, matchPreview, parseBirthdate, timeAgo, toE164 } from './format';
import type { MatchSummary } from './types';

describe('ageFrom', () => {
  const today = new Date(2026, 9, 8); // 8 Oct 2026
  it('counts completed years', () => {
    expect(ageFrom('2000-10-08', today)).toBe(26);
    expect(ageFrom('2000-10-09', today)).toBe(25);
    expect(ageFrom('2008-10-09', today)).toBe(17);
  });
});

describe('parseBirthdate', () => {
  it('accepts real dates', () => {
    expect(parseBirthdate('5/1/1996')).toBe('1996-05-01');
    expect(parseBirthdate(' 12/31/1990 ')).toBe('1990-12-31');
  });
  it('rejects impossible or malformed dates', () => {
    expect(parseBirthdate('2/30/1996')).toBeNull();
    expect(parseBirthdate('13/01/1996')).toBeNull();
    expect(parseBirthdate('1996-05-01')).toBeNull();
  });
});

describe('distanceLabel', () => {
  it('never shows a distance below one mile', () => {
    expect(distanceLabel(1)).toBe('Under 1 mi away');
    expect(distanceLabel(7)).toBe('7 mi away');
  });
});

describe('toE164', () => {
  it('normalises US numbers and keeps explicit country codes', () => {
    expect(toE164('(555) 555-0100')).toBe('+15555550100');
    expect(toE164('1 555 555 0100')).toBe('+15555550100');
    expect(toE164('+44 7700 900123')).toBe('+447700900123');
  });
  it('rejects junk', () => {
    expect(toE164('12345')).toBeNull();
    expect(toE164('+1')).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  it('buckets durations', () => {
    expect(timeAgo('2026-10-08T11:59:30Z', now)).toBe('now');
    expect(timeAgo('2026-10-08T11:15:00Z', now)).toBe('45m');
    expect(timeAgo('2026-10-08T07:00:00Z', now)).toBe('5h');
    expect(timeAgo('2026-10-05T12:00:00Z', now)).toBe('3d');
  });
});

describe('matchPreview', () => {
  const base: MatchSummary = {
    match_id: 'm',
    other_id: 'o',
    display_name: 'Ben',
    photo: null,
    verified: false,
    last_kind: null,
    last_body: null,
    last_sender_id: null,
    last_at: null,
    matched_at: '2026-10-08T00:00:00Z',
  };
  it('describes each kind of last message', () => {
    expect(matchPreview(base, 'me')).toMatch(/say hi/);
    expect(matchPreview({ ...base, last_kind: 'text', last_body: 'hey', last_sender_id: 'me' }, 'me')).toBe('You: hey');
    expect(matchPreview({ ...base, last_kind: 'snap', last_sender_id: 'o' }, 'me')).toBe('📸 New snap');
    expect(matchPreview({ ...base, last_kind: 'screenshot', last_sender_id: 'o' }, 'me')).toBe('Ben took a screenshot');
  });
});

describe('formatNaira', () => {
  it('formats kobo as naira with thousands separators', () => {
    expect(formatNaira(250000)).toBe('₦2,500');
    expect(formatNaira(2000000)).toBe('₦20,000');
    expect(formatNaira(100050)).toBe('₦1,000.50');
    expect(formatNaira(99)).toBe('₦0.99');
  });
});
