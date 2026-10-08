// Checks a profile photo right after the user uploads it, so the app can tell
// them straight away if it isn't allowed. Rejected photos are deleted.
// The moderate-photo webhook applies the same check to every upload as a
// backstop, so skipping this call doesn't get a photo through.

import { admin, json } from '../_shared/admin.ts';
import { checkPhoto } from '../_shared/photo-check.ts';

Deno.serve(async (req) => {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  const {
    data: { user },
  } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (!user) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { path } = (await req.json()) as { path?: string };
  if (!path || !path.startsWith(`${user.id}/`)) {
    return json({ error: 'not your photo' }, 403);
  }

  const {
    data: { publicUrl },
  } = admin.storage.from('photos').getPublicUrl(path);
  try {
    const verdict = await checkPhoto(publicUrl);
    if (!verdict.ok) {
      await admin.storage.from('photos').remove([path]);
    }
    return json(verdict);
  } catch (err) {
    console.error(err);
    return json({ error: 'check failed' }, 502);
  }
});
