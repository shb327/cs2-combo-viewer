import type { ComboErrorCode, ComboInput, ComboView, NormalizedCombo } from './combo'
import { isAllowedOrigin, knownParentOrigin, learnParentOrigin, postToParent, whenParentOrigin } from './origins'

/** The combo embed's messages (docs/embed.md). Every event that follows a command carries that command's `id`. */
export type ComboCommand =
  | { type: 'cs3d:load'; id?: string; combo: ComboInput; view?: ComboView }
  | { type: 'cs3d:inspect'; id?: string }
  | { type: 'cs3d:setView'; id?: string; view: ComboView }
  | { type: 'cs3d:getState'; id?: string }
  /** Only with the page's `capture=1`: the frame shown, as a PNG (after `cs3d:captureReady`). */
  | { type: 'cs3d:capture'; id?: string }
  /** Testing aid, only with the page's `debug=1`: loses the WebGL context as a GPU reset would. */
  | { type: 'cs3d:loseContext'; id?: string }

export type ComboStatus = 'loading' | 'loaded' | 'error'

export type ComboEvent =
  | { type: 'cs3d:ready'; version: number; release: string | null; webgl2: boolean }
  | { type: 'cs3d:progress'; id: string | null; loaded: number; total: number }
  | { type: 'cs3d:loaded'; id: string | null; combo: NormalizedCombo; view: ComboView; release: string | null; ms: number }
  | { type: 'cs3d:error'; id: string | null; code: ComboErrorCode; message: string; retryable: boolean }
  | { type: 'cs3d:recovering'; id: string | null; reason: 'context-lost'; attempt: number }
  | { type: 'cs3d:state'; id: string | null; status: ComboStatus; combo: NormalizedCombo | null; view: ComboView; release: string | null; loadId: string | null }
  /** With `capture=1`: the loaded combo's frame is final (everything loaded and drawn, the pose held). */
  | { type: 'cs3d:captureReady'; id: string | null; combo: NormalizedCombo; release: string | null }
  /** Reply to `cs3d:capture` (another name than the command's: a page that isn't framed gets its own events). */
  | { type: 'cs3d:captured'; id: string | null; png: Blob; width: number; height: number; combo: NormalizedCombo; release: string | null }

const COMMANDS = new Set(['cs3d:load', 'cs3d:inspect', 'cs3d:setView', 'cs3d:getState', 'cs3d:capture', 'cs3d:loseContext'])

/** The message as a combo command, or null (not one, or from an origin not on the list: ignored). */
export function asComboCommand(e: MessageEvent): ComboCommand | null {
  if (!isAllowedOrigin(e.origin) || e.source !== window.parent) return null
  const data = e.data as { type?: unknown; id?: unknown } | null
  if (!data || typeof data !== 'object' || typeof data.type !== 'string' || !COMMANDS.has(data.type)) return null
  if (data.id !== undefined && typeof data.id !== 'string') return null
  learnParentOrigin(e)
  return data as ComboCommand
}

/**
 * Events to the parent: held back until the parent's origin is known and `cs3d:ready` has gone (with the parent's first
 * message, when the page couldn't tell its origin), then sent in order. Progress is coalesced while waiting.
 */
export class ComboChannel {
  private queue: ComboEvent[] = []
  private open = false

  constructor(ready: () => ComboEvent) {
    void whenParentOrigin().then(() => {
      postToParent(ready())
      this.open = true
      for (const e of this.queue.splice(0)) postToParent(e)
    })
  }

  post(event: ComboEvent): void {
    if (this.open && knownParentOrigin()) { postToParent(event); return }
    const last = this.queue[this.queue.length - 1]
    if (event.type === 'cs3d:progress' && last?.type === 'cs3d:progress') this.queue[this.queue.length - 1] = event
    else if (this.queue.length < 100) this.queue.push(event)
  }
}
