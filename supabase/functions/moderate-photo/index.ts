// Automatic moderation for profile photos.
// Wire up a database webhook on INSERT into storage.objects pointing here, with
// header Authorization: Bearer <MODERATION_WEBHOOK_SECRET>.
// Uses Sightengine (https://sightengine.com). Without credentials it logs a
// warning and lets every photo through, so set them before launch.

import { admin, hasSharedSecret, json, type WebhookPayload } from '../_shared/admin.ts';

const THRESHOLD = 0.5;

interface StorageObject {
  bucket_id: string;
  name: string;
}

interface SightengineResult {
  status: string;
  nudity?: { sexual_activity?: number; sexual_display?: number; erotica?: number };
  gore?: { prob?: number };
  weapon?: { classes?: Record<string, number> };
}

async function isFlagged(url: string): Promise<boolean | null> {
  const user = Deno.env.get('SIGHTENGINE_USER');
  const secret = Deno.env.get('SIGHTENGINE_SECRET');
  if (!user || !secret) {
    console.warn('SIGHTENGINE_USER/SIGHTENGINE_SECRET not set; skipping moderation');
    return null;
  }
  const params = new URLSearchParams({
    models: 'nudity-2.1,gore-2.0',
    api_user: user,
    api_secret: secret,
    url,
  });
  const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`);
  const result = (await res.json()) as SightengineResult;
  if (result.status !== 'success') {
    throw new Error(`Sightengine error: ${JSON.stringify(result)}`);
  }
  const nudity = Math.max(
    result.nudity?.sexual_activity ?? 0,
    result.nudity?.sexual_display ?? 0,
    result.nudity?.erotica ?? 0,
  );
  return nudity > THRESHOLD || (result.gore?.prob ?? 0) > THRESHOLD;
}

Deno.serve(async (req) => {
  if (!hasSharedSecret(req, 'MODERATION_WEBHOOK_SECRET')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const payload = (await req.json()) as WebhookPayload<StorageObject>;
  const object = payload.record;
  if (payload.type !== 'INSERT' || !object || object.bucket_id !== 'photos') {
    return json({ skipped: true });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from('photos').getPublicUrl(object.name);
  let flagged: boolean | null;
  try {
    flagged = await isFlagged(publicUrl);
  } catch (err) {
    console.error(err);
    return json({ error: 'moderation failed' }, 500);
  }
  if (!flagged) {
    return json({ flagged: false });
  }

  // Remove the photo from storage and from the owner's profile.
  const ownerId = object.name.split('/')[0];
  await admin.storage.from('photos').remove([object.name]);
  const { data: profile } = await admin.from('profiles').select('photos').eq('id', ownerId).single();
  if (profile) {
    await admin
      .from('profiles')
      .update({ photos: (profile.photos as string[]).filter((p) => p !== object.name) })
      .eq('id', ownerId);
  }
  console.warn(`Removed flagged photo ${object.name}`);
  return json({ flagged: true });
});
