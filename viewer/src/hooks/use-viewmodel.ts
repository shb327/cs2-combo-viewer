import { useStoredSettings } from '@/hooks/use-stored-settings'
import { DEFAULT_VIEWMODEL, type Viewmodel } from '@/lib/viewer/viewer-options'

/** The first-person viewmodel settings, remembered in this browser (v2: the offsets are CS2's absolute values). */
export function useViewmodel() {
  const [viewmodel, setViewmodel] = useStoredSettings<Viewmodel>('viewmodel-v2', DEFAULT_VIEWMODEL)
  return { viewmodel, setViewmodel }
}
