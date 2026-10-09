/**
 * Native Web Share and Clipboard fallback utilities for Huddle rooms.
 */

export type ShareResult = {
  shared: boolean;
  copied: boolean;
};

export type ShareRoomOptions = {
  title?: string;
  text?: string;
};

/**
 * Copies plain text to the user's clipboard.
 * Uses navigator.clipboard.writeText with fallback to document.execCommand('copy').
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue to execCommand fallback
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Checks whether navigator.share is supported in the current environment.
 */
export function isShareSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Shares a Huddle room URL.
 * - Uses navigator.share on platforms that support native sharing (iOS/Android share sheet
 *   to send via iMessage, WhatsApp, Messenger, SMS, etc.).
 * - Falls back to copying the link to the clipboard if navigator.share is unavailable
 *   or encounters an error.
 * - If the user dismisses the native share sheet (AbortError), no copy is performed and { shared: false, copied: false } is returned.
 *
 * @param roomId Unique room identifier
 * @param roomUrl Full room URL
 * @param options Optional custom title and share text
 * @returns Object with boolean flags: { shared: boolean, copied: boolean }
 */
export async function shareRoom(
  roomId: string,
  roomUrl: string,
  options?: ShareRoomOptions,
): Promise<ShareResult> {
  const title = options?.title ?? `Huddle: ${roomId}`;
  const text = options?.text ?? `Join my video call on Huddle! 🎧 ${roomUrl}`;

  const shareData: ShareData = {
    title,
    text,
    url: roomUrl,
  };

  if (isShareSupported()) {
    const canShare = typeof navigator.canShare === 'function' ? navigator.canShare(shareData) : true;
    if (canShare) {
      try {
        await navigator.share(shareData);
        return { shared: true, copied: false };
      } catch (err: unknown) {
        // User explicitly cancelled or closed the native share dialog
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { shared: false, copied: false };
        }
        // For other errors (e.g. permission or platform failure), fall through to clipboard
      }
    }
  }

  const copied = await copyToClipboard(roomUrl);
  return { shared: false, copied };
}
