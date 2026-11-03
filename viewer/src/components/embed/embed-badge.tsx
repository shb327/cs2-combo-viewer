import { WATERMARK } from '@/lib/watermark'

export function EmbedBadge({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="glass absolute left-3 top-3 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-xs font-semibold text-white/90 transition hover:text-white">
      <img src="/logo/favicon.svg" alt="" className="size-5" />
      {WATERMARK}
    </a>
  )
}
