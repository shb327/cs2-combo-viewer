import { Swords } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ToolButton } from '@/components/stage/tool-button'
import type { AttackInfo } from '@/lib/data/attacks'

interface AttackMenuProps {
  attacks: AttackInfo[]
  onAttack: (name: string) => void
}

/** A toolbar button that opens a small list of the weapon's attacks over the bar; a pick plays it and closes the list. */
export function AttackMenu({ attacks, onAttack }: AttackMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={root} className="relative">
      <ToolButton icon={Swords} label="Attacks" pressed={open} onClick={() => setOpen((on) => !on)} />
      {open && (
        <ul className="glass-panel absolute bottom-full left-1/2 z-20 mb-2 w-44 -translate-x-1/2 rounded-2xl bg-zinc-950/90 p-1.5" role="menu" aria-label="Attacks">
          {attacks.map((a) => (
            <li key={a.name} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => { onAttack(a.name); setOpen(false) }}
                className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
