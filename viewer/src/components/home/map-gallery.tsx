import { useNavigate } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useInspectMaps, useLighting } from '@/hooks/use-lighting'
import { ASSET_BASE, DEFAULT_SKIN } from '@/lib/config'
import { VIEWER_DATA } from '@/lib/data/catalog'
import { selectionPath } from '@/lib/selection'
import { tiltHandlers } from '@/lib/tilt'

export function MapGallery() {
  const maps = useInspectMaps()
  const { setLighting } = useLighting()
  const navigate = useNavigate()

  const open = (map: string) => {
    setLighting({ map })
    navigate(selectionPath({ kind: 'skin', ...DEFAULT_SKIN }))
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {!maps.length && Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-2/1 rounded-2xl" />)}
      {maps.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => open(m.id)}
          {...tiltHandlers}
          className="group tile tilt-card relative aspect-2/1 overflow-hidden p-0 text-left transition hover:border-white/20"
        >
          <img src={ASSET_BASE + VIEWER_DATA + m.thumb} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <span aria-hidden className="absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-2.5 text-[13px] font-semibold text-white">
            {m.name}
            <span className="text-[11px] font-medium text-violet-200 opacity-0 transition-opacity group-hover:opacity-100">View here →</span>
          </span>
        </button>
      ))}
    </div>
  )
}
