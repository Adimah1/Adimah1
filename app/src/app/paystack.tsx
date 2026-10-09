import { router } from 'expo-router';
import { useEffect } from 'react';

/**
 * Paystack checkout returns to lushdate://paystack. The payment itself is
 * verified by the screen that started it; this just steps back to it.
 */
export default function PaystackReturn() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
