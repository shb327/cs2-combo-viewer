import { Link2Off } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/common/spinner'
import { Button } from '@/components/ui/button'
import { useCatalog } from '@/hooks/use-catalog'
import { useInspectLink } from '@/hooks/use-inspect-link'
import { DEFAULT_SKIN } from '@/lib/config'
import { decodeInspectLink } from '@/lib/data/inspect'
import { selectionPath } from '@/lib/selection'

const noop = () => {}

export function InspectPage() {
  const { pathname, search } = useLocation()
  const { catalog, attachments, agents, error: loadError } = useCatalog()
  const load = useInspectLink(catalog, attachments, agents, '', noop)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!catalog || !attachments || !agents) return
    try {
      const link = pathname.replace(/^\/inspect\/?/, '') + search
      const failure = load(decodeInspectLink(link))
      if (failure) setError(failure)
    } catch (e) {
      setError((e as Error).message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search, catalog, attachments, agents])

  const failure = error || loadError
  return (
    <div className="grid h-dvh place-items-center p-4">
      {failure ? (
        <div className="glass-strong flex max-w-sm flex-col items-center gap-3 rounded-3xl p-6 text-center">
          <Link2Off className="size-8 text-muted-foreground" />
          <div className="text-[15px] font-semibold">Can’t open this inspect link</div>
          <div className="text-[12.5px] text-muted-foreground">{failure}</div>
          <Button render={<Link to={selectionPath({ kind: 'skin', ...DEFAULT_SKIN })} />}>Open the viewer</Button>
        </div>
      ) : (
        <div className="glass-strong flex items-center gap-3 rounded-2xl px-4 py-3">
          <Spinner />
          Opening the item…
        </div>
      )}
    </div>
  )
}
