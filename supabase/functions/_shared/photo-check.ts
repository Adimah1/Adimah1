// Decides whether an uploaded profile photo is allowed: a real photo (not a
// drawing, cartoon or AI-generated image) that shows a face, with no nudity or
// gore. Uses Sightengine (https://sightengine.com).
//
// Field names below follow Sightengine's documented response shapes. A field
// the API doesn't return is treated as "no signal" rather than a rejection, so
// check one real response after setting up your account.

const THRESHOLD = 0.5;
const MODELS = 'nudity-2.1,gore-2.0,genai,type,faces';

interface SightengineResult {
  status: string;
  nudity?: { sexual_activity?: number; sexual_display?: number; erotica?: number };
  gore?: { prob?: number };
  // `genai` adds ai_generated; `type` adds photo/illustration.
  type?: { ai_generated?: number; photo?: number; illustration?: number };
  faces?: unknown[];
}

export type PhotoVerdict =
  | { ok: true; checked: boolean }
  | { ok: false; reason: 'explicit' | 'ai_generated' | 'illustration' | 'no_face' | 'found_online'; message: string };

const MESSAGES = {
  explicit: 'This photo isn’t allowed on LushDate. Please choose another.',
  ai_generated: 'This looks AI-generated. Please use a real photo of yourself.',
  illustration: 'This looks like a drawing, cartoon or graphic. Please use a real photo of yourself.',
  no_face: 'We couldn’t see a face in this photo. Every profile photo needs to show you.',
  found_online: 'This photo already appears elsewhere online. Please use a photo you took yourself.',
} as const;

/**
 * Photo provenance (anti-catfish): Google Cloud Vision web detection finds
 * exact copies of the image on the public web. Set GOOGLE_VISION_API_KEY.
 * Returns null when not configured or on error (other checks still apply).
 */
async function foundOnline(url: string): Promise<boolean | null> {
  const key = Deno.env.get('GOOGLE_VISION_API_KEY');
  if (!key) return null;
  try {
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { source: { imageUri: url } }, features: [{ type: 'WEB_DETECTION', maxResults: 5 }] }],
      }),
    });
    const data = (await res.json()) as {
      responses?: { webDetection?: { fullMatchingImages?: { url: string }[] } }[];
    };
    const matches = data.responses?.[0]?.webDetection?.fullMatchingImages ?? [];
    // Our own storage URL can show up as a match; ignore it.
    return matches.some((m) => !m.url.includes('supabase'));
  } catch (err) {
    console.error('provenance check failed', err);
    return null;
  }
}

export async function checkPhoto(url: string): Promise<PhotoVerdict> {
  const user = Deno.env.get('SIGHTENGINE_USER');
  const secret = Deno.env.get('SIGHTENGINE_SECRET');
  if (!user || !secret) {
    console.warn('SIGHTENGINE_USER/SIGHTENGINE_SECRET not set; photos are not being checked');
    return { ok: true, checked: false };
  }

  const params = new URLSearchParams({ models: MODELS, api_user: user, api_secret: secret, url });
  const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`);
  const result = (await res.json()) as SightengineResult;
  if (result.status !== 'success') {
    throw new Error(`Sightengine error: ${JSON.stringify(result)}`);
  }

  const reject = (reason: keyof typeof MESSAGES): PhotoVerdict => ({ ok: false, reason, message: MESSAGES[reason] });

  const nudity = Math.max(
    result.nudity?.sexual_activity ?? 0,
    result.nudity?.sexual_display ?? 0,
    result.nudity?.erotica ?? 0,
  );
  if (nudity > THRESHOLD || (result.gore?.prob ?? 0) > THRESHOLD) return reject('explicit');
  if ((result.type?.ai_generated ?? 0) > THRESHOLD) return reject('ai_generated');
  if ((result.type?.illustration ?? 0) > THRESHOLD) return reject('illustration');
  if (Array.isArray(result.faces) && result.faces.length === 0) return reject('no_face');
  if ((await foundOnline(url)) === true) return reject('found_online');
  return { ok: true, checked: true };
}
