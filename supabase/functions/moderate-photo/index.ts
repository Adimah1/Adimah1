// Backstop moderation for profile photos: runs on every upload, whether or not
// the app called check-photo, and removes anything that isn't allowed.
// Wire up a database webhook on INSERT into storage.objects pointing here, with
// header Authorization: Bearer <MODERATION_WEBHOOK_SECRET>.

import { admin, hasSharedSecret, json, type WebhookPayload } from '../_shared/admin.ts';
import { checkPhoto } from '../_shared/photo-check.ts';

interface StorageObject {
  bucket_id: string;
  name: string;
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
  let verdict;
  try {
    verdict = await checkPhoto(publicUrl);
  } catch (err) {
    console.error(err);
    return json({ error: 'moderation failed' }, 500);
  }
  if (verdict.ok) {
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
  console.warn(`Removed photo ${object.name}: ${verdict.reason}`);
  return json({ flagged: true, reason: verdict.reason });
});
