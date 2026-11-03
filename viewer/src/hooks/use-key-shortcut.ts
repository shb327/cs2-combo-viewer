import { useEffect } from 'react'

/**
 * Runs `action` when `key` is pressed (no Ctrl / Cmd / Alt), while `enabled`, unless the user is typing in a field.
 * @param key the key, lower case ('f', 'g'…)
 */
export function useKeyShortcut(key: string, enabled: boolean, action: () => void): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.key.toLowerCase() !== key || e.ctrlKey || e.metaKey || e.altKey || target?.closest('input, textarea, [contenteditable]')) return
      /** Space: no page scroll, and not on top of a focused button's own click. */
      if (key === ' ') {
        if (target?.closest('button, a, select, [role=button]')) return
        e.preventDefault()
      }
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, enabled, action])
}
