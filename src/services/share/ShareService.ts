export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'error';

export interface ShareResult {
  outcome: ShareOutcome;
}

function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Share a generated file via the native share sheet. MUST be called
 * synchronously from a user-gesture handler with an already-built File, or iOS
 * may drop the gesture and refuse to share. Falls back to a download when file
 * sharing isn't supported.
 */
export async function shareFile(
  file: File,
  meta?: { title?: string; text?: string },
): Promise<ShareResult> {
  if (canShareFile(file)) {
    try {
      await navigator.share({
        files: [file],
        title: meta?.title,
        text: meta?.text,
      });
      return { outcome: 'shared' };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { outcome: 'cancelled' };
      }
      // Fall through to download on any other failure.
      try {
        downloadFile(file);
        return { outcome: 'error' };
      } catch {
        return { outcome: 'error' };
      }
    }
  }

  downloadFile(file);
  return { outcome: 'downloaded' };
}
