import { Camera, Crosshair, Eye, Hand, HandMetal, MousePointer2, RotateCw, ScanSearch } from 'lucide-react'
import type { ReactNode } from 'react'
import { AttackMenu } from '@/components/stage/attack-menu'
import { ToolButton } from '@/components/stage/tool-button'
import type { AttackInfo } from '@/lib/data/attacks'
import { cn } from '@/lib/utils'

export interface StageToolbarProps {
  spin: boolean
  /** First person applies to weapons; palm-up to gloves. */
  isWeapon: boolean
  isGlove: boolean
  firstPerson: boolean
  palmUp: boolean
  /** The first-person weapon has an inspect animation. */
  canInspect: boolean
  /** First person wears skin gloves: it can look at them (a glove skin's page always can). */
  canInspectGloves: boolean
  /** First person's attack animations (a gun's shots, a knife's slashes and stabs). */
  attacks: AttackInfo[]
  stats: ReactNode
  onToggleSpin: () => void
  onToggleFirstPerson: () => void
  onTogglePalmUp: () => void
  onInspect: () => void
  onInspectGloves: () => void
  /** Plays an attack; with no name, the plain fire (Space). */
  onAttack: (name?: string) => void
  onScreenshot: () => void
}

/** The floating bar under the model: view tools, the read-out, and a hint. */
export function StageToolbar({ spin, isWeapon, isGlove, firstPerson, palmUp, canInspect, canInspectGloves, attacks, stats, onToggleSpin, onToggleFirstPerson, onTogglePalmUp, onInspect, onInspectGloves, onAttack, onScreenshot }: StageToolbarProps) {
  const inFirstPerson = firstPerson && isWeapon
  return (
    <div className="glass-panel pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl p-2">
      <div className="flex gap-1.5">
        <ToolButton icon={RotateCw} label="Auto-rotate" pressed={spin} disabled={inFirstPerson} iconClassName={cn(spin && !inFirstPerson && 'animate-spin [animation-duration:3s]')} onClick={onToggleSpin} />
        {isWeapon && <ToolButton icon={Eye} label="First person (V)" pressed={firstPerson} onClick={onToggleFirstPerson} />}
        {inFirstPerson && canInspect && <ToolButton icon={ScanSearch} label="Inspect (F)" onClick={onInspect} />}
        {inFirstPerson && attacks.length > 0 && <ToolButton icon={Crosshair} label="Fire (click · Space)" onClick={() => onAttack()} />}
        {inFirstPerson && attacks.length > 1 && <AttackMenu attacks={attacks} onAttack={onAttack} />}
        {((inFirstPerson && canInspectGloves) || isGlove) && <ToolButton icon={HandMetal} label="Look at gloves (G)" onClick={onInspectGloves} />}
        {isGlove && <ToolButton icon={Hand} label="Right glove palm-up" pressed={palmUp} onClick={onTogglePalmUp} />}
        <ToolButton icon={Camera} label="Save screenshot" onClick={onScreenshot} />
      </div>

      {stats && (
        <>
          <span className="hidden h-8 w-px bg-white/10 sm:block" />
          <div className="inset-well hidden items-center gap-4 sm:flex rounded-xl px-3.5 py-1.5">{stats}</div>
        </>
      )}

      <span className="hidden items-center gap-1.5 px-2 text-[11px] text-muted-foreground md:flex">
        <MousePointer2 className="size-3.5" /> {inFirstPerson ? (canInspect ? 'Move the mouse to sway · F to inspect' : 'Move the mouse to sway') + (attacks.length ? ' · click or Space to fire' : '') : 'Drag to rotate · scroll to zoom'}
      </span>
    </div>
  )
}
