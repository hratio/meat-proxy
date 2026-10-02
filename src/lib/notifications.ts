import { toast as sonner, type ExternalToast } from 'svelte-sonner';
import HudNotification from './components/hud/HudNotification.svelte';

export type NotificationKind = 'message' | 'success' | 'error' | 'info' | 'warning' | 'loading';
type NotificationOptions = Omit<ExternalToast, 'component' | 'componentProps' | 'description' | 'icon' | 'action' | 'cancel'> & { description?: string };

function notify(kind: NotificationKind, message: string, options: NotificationOptions = {}) {
  const id = sonner[kind](message, {
    ...options,
    component: HudNotification,
    componentProps: { message, description: options.description, kind, closable: options.dismissible !== false && options.closeButton !== false && kind !== 'loading', dismiss: () => sonner.dismiss(id) }
  });
  return id;
}

export const toast = Object.assign(
  (message: string, options?: NotificationOptions) => notify('message', message, options),
  {
    message: (message: string, options?: NotificationOptions) => notify('message', message, options),
    success: (message: string, options?: NotificationOptions) => notify('success', message, options),
    error: (message: string, options?: NotificationOptions) => notify('error', message, options),
    info: (message: string, options?: NotificationOptions) => notify('info', message, options),
    warning: (message: string, options?: NotificationOptions) => notify('warning', message, options),
    loading: (message: string, options?: NotificationOptions) => notify('loading', message, options),
    dismiss: sonner.dismiss,
    getActiveToasts: sonner.getActiveToasts
  }
);
