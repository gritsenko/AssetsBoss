/** Human file size in the design's English units (B / KB / MB / GB). */
export function formatSize(bytes: number): string {
  const kb = bytes / 1024
  const mb = kb / 1024
  const gb = mb / 1024
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  if (mb >= 10) return `${Math.round(mb)} MB`
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  if (kb >= 1) return `${Math.round(kb)} KB`
  return `${bytes} B`
}

/** Relative "added" label from a unix-seconds mtime, mirroring the design copy. */
export function formatDate(mtimeSeconds: number): string {
  const ms = mtimeSeconds * 1000
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

/** Seconds → m:ss for playback time labels. */
export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Extension without the dot, uppercased, for badges (e.g. "PNG"). */
export function extLabel(ext: string): string {
  return ext.replace(/^\./, '').toUpperCase()
}

/** Filename with the extension optionally stripped, per the "Show file extensions" setting. */
export function displayName(name: string, showExt: boolean): string {
  return showExt ? name : name.replace(/\.[^.]+$/, '')
}
