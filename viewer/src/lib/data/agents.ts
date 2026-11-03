import type { DrawCall } from '@/lib/data/catalog'
import { VIEWER_DATA } from '@/lib/data/catalog'
import type { ArmsSkeleton } from '@/lib/viewer/firstperson'

/** A model skeleton: bone names, parents, bind pose in the parent's space (Source units) and twist constraints. */
export type ModelSkeleton = ArmsSkeleton

/**
 * An agent model (build_agents.py): its first-person arms (sleeves, arms with the default gloves) and its whole body,
 * both as .glb paths under extracted/game, bound to the model's own skeleton.
 */
export interface AgentModel {
  glb: string | null
  body: string
  skeleton: ModelSkeleton
  /** Mesh group (firstperson_sleeves, firstperson_default_gloves_arms, thirdperson_body…) → its draw calls in order. */
  drawCalls: Record<string, DrawCall[]>
}

/** An agent item (items_game customplayer_*): `index` is its item definition index (db.json's agents key). */
export interface AgentEntry { id: string; index: number; name: string; model: string; team: 'ct' | 't'; rarity: string | null }

export interface AgentIndex {
  agents: AgentEntry[]
  models: Record<string, AgentModel>
  agent: Map<string, AgentEntry>
}

/** The agent whose arms first person shows when none is chosen: the default CT agent. */
export const DEFAULT_AGENT = 'customplayer_ct_map_based'

const loaded = new Map<string, Promise<AgentIndex>>()

/** Every agent and agent model; loaded once per asset root. */
export function loadAgents(base: string): Promise<AgentIndex> {
  let p = loaded.get(base)
  if (!p) {
    p = fetch(base + VIEWER_DATA + 'agents.json')
      .then((r) => r.json() as Promise<{ agents: AgentEntry[]; models: Record<string, AgentModel> }>)
      .then((d) => ({ ...d, agent: new Map(d.agents.map((a) => [a.id, a])) }))
    p.catch(() => loaded.delete(base))
    loaded.set(base, p)
  }
  return p
}
