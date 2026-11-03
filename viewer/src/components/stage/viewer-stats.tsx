import { Stat } from '@/components/common/stat'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import { DEFAULT_FLOAT } from '@/lib/config'
import type { AgentIndex } from '@/lib/data/agents'
import type { Item } from '@/lib/data/items'
import { fadeColor, fadeForItem, fadeLabel } from '@/lib/fade'
import type { Selection } from '@/lib/selection'
import { clampFloat, wearOf } from '@/lib/wear'

interface ViewerStatsProps {
  selection: Selection
  item: Item | null
  state: ViewerStateApi
  agents: AgentIndex | null
}

/** The stage bar's read-out: a skin's wear, float and pattern; a sticker's wear; an agent's team; a charm's pattern. */
export function ViewerStats({ selection, item, state, agents }: ViewerStatsProps) {
  if (selection.kind === 'skin') {
    if (!item) return null
    const float = clampFloat(item, state.float ?? DEFAULT_FLOAT)
    const wear = wearOf(float)
    const fade = fadeForItem(item, state.seed)
    return (
      <>
        <Stat label="Wear" value={wear.short} color={wear.color} />
        <Stat label="Float" value={float.toFixed(4)} />
        <Stat label="Pattern" value={'#' + state.seed} />
        {fade && <Stat label="Fade" value={fadeLabel(fade)} color={fadeColor(fade.percentage)} />}
      </>
    )
  }
  if (selection.kind === 'sticker') return <Stat label="Sticker wear" value={(state.stickerWear * 100).toFixed(0) + '%'} />
  if (selection.kind === 'pin' || selection.kind === 'patch' || selection.kind === 'pet') return null
  if (selection.kind === 'agent') return <Stat label="Team" value={agents?.agent.get(selection.id)?.team === 't' ? 'T' : 'CT'} />
  return <Stat label="Pattern" value={'#' + state.charm.seed} />
}
