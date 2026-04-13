/**
 * Thin wrapper around Sonner — keeps the same call signature as before
 * so no call sites need to change.
 *
 *   toast('Saved ✓')              → success (default)
 *   toast('Something failed', 'error')
 *   toast('FYI', 'info')
 */
import { toast as sonnerToast, Toaster } from 'sonner';

export type ToastType = 'success' | 'error' | 'info';

export const toast = (message: string, type: ToastType = 'success') => {
    if (type === 'error') sonnerToast.error(message);
    else if (type === 'info') sonnerToast(message);
    else sonnerToast.success(message);
};

export { Toaster as ToastContainer };
