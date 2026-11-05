import { useStoredSettings } from '@/hooks/use-stored-settings'
import { DEFAULT_VIEWMODEL, type Viewmodel } from '@/lib/viewer/viewer-options'

/** The first-person viewmodel settings, remembered in this browser (v4: the closer defaults of phase 2C). */
export function useViewmodel() {
  const [viewmodel, setViewmodel] = useStoredSettings<Viewmodel>('viewmodel-v4', DEFAULT_VIEWMODEL)
  return { viewmodel, setViewmodel }
}
