import { useCallback } from 'react'
import type { DbImages } from '@/context/db-context'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import { WEB_ORIGIN } from '@/lib/config'
import type { AgentIndex } from '@/lib/data/agents'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex, CatalogSkin } from '@/lib/data/catalog'
import type { Item } from '@/lib/data/items'
import type { Heading } from '@/lib/heading'
import { selectionPath, type Selection } from '@/lib/selection'
import { shareCardFor, type ShareSource } from '@/lib/share-card'
import { encodeShare } from '@/lib/share-code'
import type { SkinViewer } from '@/lib/viewer/skin-viewer'

interface ShareInputs {
  viewer: SkinViewer | null
  selection: Selection
  state: ViewerStateApi
  heading: Heading
  item: Item | null
  skin: CatalogSkin | undefined
  catalog: CatalogIndex | null
  attachments: AttachmentIndex | null
  agents: AgentIndex | null
  images: DbImages
}

/**
 * What the share dialog shows for the current view: its link (`<site>/share/<code>` when the view packs into a code,
 * or else the full path and search params on the site), what its image says, and the viewer's render of the item.
 */
export function useShare({ viewer, selection, state, heading, item, skin, catalog, attachments, agents, images }: ShareInputs) {
  return useCallback((): ShareSource => {
    const code = catalog && attachments && agents ? encodeShare(selection, state, { catalog, attachments, agents }) : null
    const link = code
      ? { url: `${WEB_ORIGIN}/share/${code}`, short: true }
      : { url: WEB_ORIGIN + selectionPath(selection) + (state.search ? '?' + state.search : ''), short: false }
    return {
      link,
      card: shareCardFor(selection, state, heading, item, skin, catalog, attachments, images),
      renderItem: (longSide) => viewer?.renderItem(longSide) ?? null,
    }
  }, [viewer, selection, state, heading, item, skin, catalog, attachments, agents, images])
}
