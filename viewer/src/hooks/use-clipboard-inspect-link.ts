import { useEffect, useState } from 'react'
import { decodeInspectLink } from '@/lib/data/inspect'

/**
 * The inspect link in the clipboard while `active`, if there is one. Read only where the browser already lets this
 * site read the clipboard (after a first Paste was allowed): asking would pop a permission prompt on every open.
 */
export function useClipboardInspectLink(active: boolean): string | null {
  const [link, setLink] = useState<string | null>(null)
  useEffect(() => {
    if (!active) { setLink(null); return }
    let live = true
    void (async () => {
      try {
        const status = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName })
        if (status.state !== 'granted') return
        const text = (await navigator.clipboard.readText()).trim()
        decodeInspectLink(text) // (throws when it isn't one)
        if (live) setLink(text)
      } catch { /* no permission API, no access, or not an inspect link */ }
    })()
    return () => { live = false }
  }, [active])
  return link
}
