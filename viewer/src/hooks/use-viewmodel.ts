import { useStoredSettings } from '@/hooks/use-stored-settings'
import { DEFAULT_VIEWMODEL, type Viewmodel } from '@/lib/viewer/viewer-options'

/** The first-person viewmodel settings, remembered in this browser (v3: viewmodel_fov read on a 4:3 screen, as in the game). */
export function useViewmodel() {
  const [viewmodel, setViewmodel] = useStoredSettings<Viewmodel>('viewmodel-v3', DEFAULT_VIEWMODEL)
  return { viewmodel, setViewmodel }
}
