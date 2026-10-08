import { admin } from './admin.ts';

/** The signed-in user calling this function, or null. */
export async function requestUser(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!jwt) return null;
  const {
    data: { user },
  } = await admin.auth.getUser(jwt);
  return user;
}
