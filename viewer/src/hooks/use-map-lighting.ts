import { useStoredSettings } from '@/hooks/use-stored-settings'
import { DEFAULT_MAP_LIGHTING, type MapLighting } from '@/lib/viewer/viewer-options'

/** The map lights' strengths, remembered in this browser. */
export function useMapLighting() {
  const [mapLighting, setMapLighting] = useStoredSettings<MapLighting>('map-lighting', DEFAULT_MAP_LIGHTING)
  return { mapLighting, setMapLighting }
}
