import { Alert, Platform, type AlertButton } from 'react-native';

export interface PendingAlert {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Listener = (alert: PendingAlert) => void;
let listener: Listener | null = null;

/** Lets <AlertHost /> receive alerts on web, where Alert.alert does nothing. */
export function setAlertListener(next: Listener | null) {
  listener = next;
}

/** Drop-in for Alert.alert that also works on web. */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  listener?.({ title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }] });
}
