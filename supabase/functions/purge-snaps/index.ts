// Deletes snap media that has been viewed, has expired, or whose chat is gone.
// Schedule it every few minutes (see README: "Scheduled jobs") with
// Authorization: Bearer <CRON_SECRET>.

import { admin, hasSharedSecret, json } from '../_shared/admin.ts';

const BATCH = 100;

Deno.serve(async (req) => {
  if (!hasSharedSecret(req, 'CRON_SECRET')) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { data, error } = await admin.rpc('snaps_to_purge');
  if (error) {
    console.error(error);
    return json({ error: 'query failed' }, 500);
  }
  const names = (data as { object_name: string }[]).map((r) => r.object_name);

  let purged = 0;
  for (let i = 0; i < names.length; i += BATCH) {
    const chunk = names.slice(i, i + BATCH);
    const removed = await admin.storage.from('snaps').remove(chunk);
    if (removed.error) {
      console.error('storage remove failed', removed.error);
      continue;
    }
    const marked = await admin.rpc('mark_snaps_purged', { object_names: chunk });
    if (marked.error) {
      console.error('mark_snaps_purged failed', marked.error);
      continue;
    }
    purged += chunk.length;
  }
  return json({ purged });
});
