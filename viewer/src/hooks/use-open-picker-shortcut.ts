import { useEffect } from 'react'

/** Opens the picker on "/" (unless typing in a field) or Ctrl+K / ⌘K, while `enabled`. */
export function useOpenPickerShortcut(enabled: boolean, open: () => void): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]')
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing
      const k = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey
      if (!slash && !k) return
      e.preventDefault()
      open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, open])
}
