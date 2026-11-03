import { EMBED_PREFIX, type EmbedCommand, type EmbedEvent } from './types'

export function emit(event: EmbedEvent): void {
  if (window.parent !== window) window.parent.postMessage(event, '*')
}

export function asCommand(data: unknown): EmbedCommand | null {
  const command = data as EmbedCommand
  if (!command || typeof command !== 'object' || typeof command.type !== 'string' || !command.type.startsWith(EMBED_PREFIX)) return null
  return command
}

export function replier(e: MessageEvent): (event: EmbedEvent) => void {
  return (event) => (e.source as Window | null)?.postMessage(event, { targetOrigin: e.origin === 'null' ? '*' : e.origin })
}
