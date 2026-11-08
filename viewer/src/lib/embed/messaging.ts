import { isAllowedOrigin, learnParentOrigin, postToParent } from './origins'
import { EMBED_PREFIX, type EmbedCommand, type EmbedEvent } from './types'

/** Posts an event to the parent page (only to its origin, and only when it is allowed: see origins.ts). */
export function emit(event: EmbedEvent): void {
  postToParent(event)
}

/** The message as a command, or null: not one, or from an origin that isn't allowed (ignored without a reply). */
export function asCommand(e: MessageEvent): EmbedCommand | null {
  if (!isAllowedOrigin(e.origin)) return null
  const command = e.data as EmbedCommand
  if (!command || typeof command !== 'object' || typeof command.type !== 'string' || !command.type.startsWith(EMBED_PREFIX)) return null
  learnParentOrigin(e)
  return command
}

export function replier(e: MessageEvent): (event: EmbedEvent) => void {
  return (event) => (e.source as Window | null)?.postMessage(event, { targetOrigin: e.origin })
}
