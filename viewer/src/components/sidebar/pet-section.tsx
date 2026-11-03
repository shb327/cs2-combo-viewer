import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Section } from '@/components/common/section'
import { Input } from '@/components/ui/input'
import { CLIP_CATEGORIES, petClipCategory, petClipLabel } from '@/lib/data/pet-labels'
import { defaultPetClip, petClips, type PetClip, type PetEntry, type PetIndex } from '@/lib/data/pets'
import { cn } from '@/lib/utils'

interface PetSectionProps {
  pet: PetEntry | undefined
  pets: PetIndex | null
  variant: number
  /** The clip playing (null: the default idle). */
  clip: string | null
  onVariant: (index: number) => void
  onClip: (name: string | null) => void
}

const chip = (on: boolean) => cn('rounded-lg px-2.5 py-1 text-[12px] font-medium', on ? 'bevel-primary text-white' : 'bevel text-foreground/80')

/** A pet's colours (one per material of its model) and the animation it plays: folders that fold, and a search over them. */
export function PetSection({ pet, pets, variant, clip, onVariant, onClip }: PetSectionProps) {
  const model = pet && pets?.models[pet.model]
  const clips = useMemo(() => (pet && pets ? petClips(pets, pet) : []), [pet, pets])
  const playing = clip ?? defaultPetClip(clips)?.name
  const [query, setQuery] = useState('')
  /** Folders the visitor opened or closed; the one with the playing clip is open until then. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const searching = query.trim().length > 0

  const folders = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = new Map<string, PetClip[]>()
    for (const c of clips) {
      if (q && !petClipLabel(c.name).toLowerCase().includes(q)) continue
      const title = petClipCategory(c.group, c.name)
      out.set(title, [...(out.get(title) ?? []), c])
    }
    return CLIP_CATEGORIES.filter((t) => out.has(t)).map((t) => [t, out.get(t)!] as const)
  }, [clips, query])

  if (!model) return null
  const isOpen = (title: string, list: PetClip[]) => searching || (toggled[title] ?? list.some((c) => c.name === playing))
  return (
    <>
      {model.variants.length > 1 && (
        <Section title="Colour" collapsible={{ id: 'pet-colour' }} aside={<span className="text-[11px] tabular-nums text-muted-foreground">{Math.min(variant, model.variants.length - 1) + 1}/{model.variants.length}</span>}>
          <div className="flex flex-wrap gap-1.5">
            {model.variants.map((v, i) => (
              <button key={i} type="button" aria-pressed={i === variant} className={chip(i === variant)} onClick={() => onVariant(i)}>{v.name}</button>
            ))}
          </div>
        </Section>
      )}
      {clips.length > 0 && (
        <Section title="Animation" collapsible={{ id: 'pet-animation' }} aside={<span className="text-[11px] tabular-nums text-muted-foreground">{clips.length}</span>}>
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: dance, sit, sleep…" aria-label="Search the animations" className="mb-2.5" />
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
            {folders.length === 0 && <p className="px-1 py-2 text-[12px] text-muted-foreground">No animation matches “{query}”.</p>}
            {folders.map(([title, list]) => {
              const open = isOpen(title, list)
              return (
                <div key={title}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setToggled((t) => ({ ...t, [title]: !open }))}
                    className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground/70">{list.length}</span>
                    <ChevronDown className={cn('ml-auto size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <div className="flex flex-wrap gap-1.5 px-1 pb-2 pt-1">
                      {list.map((c) => (
                        <button key={c.file} type="button" aria-pressed={c.name === playing} className={chip(c.name === playing)} onClick={() => onClip(c.name)}>{petClipLabel(c.name)}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </>
  )
}
