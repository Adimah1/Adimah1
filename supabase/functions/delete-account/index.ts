// Permanently deletes the calling user's account (required by both app stores).
// Called from the app with the user's own session token.

import { admin, json } from '../_shared/admin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function removeFolder(bucket: string, folder: string): Promise<void> {
  const { data } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  const paths = (data ?? []).map((f) => `${folder}/${f.name}`);
  if (paths.length > 0) {
    await admin.storage.from(bucket).remove(paths);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!jwt) {
    return json({ error: 'unauthorized' }, 401);
  }
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(jwt);
  if (error || !user) {
    return json({ error: 'unauthorized' }, 401);
  }

  await removeFolder('photos', user.id);
  await removeFolder('verifications', user.id);

  // Cascades to the profile, location, swipes, matches, messages, etc.
  // Snap files from deleted chats are swept up by purge-snaps.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error(deleteError);
    return json({ error: 'delete failed' }, 500);
  }
  return json({ deleted: true });
});
