import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  label?: string
  className?: string
}


export function CodeBlock({ code, label, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { }
  }
  return (
    <div className={cn('inset-well overflow-hidden rounded-2xl', className)}>
      <div className="flex items-center justify-between border-b border-white/6 px-3.5 py-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label ?? 'Code'}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground">
          {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-foreground/90"><code>{code}</code></pre>
    </div>
  )
}
