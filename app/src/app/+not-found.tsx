import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

/** Unknown paths (for example a web page opened at an unexpected URL) go to the right starting screen. */
export default function NotFound() {
  const { session, profile } = useAuth();
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile) return <Redirect href="/onboarding" />;
  return <Redirect href="/" />;
}
