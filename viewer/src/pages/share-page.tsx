import { Link2Off } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Spinner } from '@/components/common/spinner'
import { Button } from '@/components/ui/button'
import { useCatalog } from '@/hooks/use-catalog'
import { DEFAULT_SKIN } from '@/lib/config'
import { selectionPath } from '@/lib/selection'
import { decodeShare } from '@/lib/share-code'

export function SharePage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { catalog, attachments, agents, error: loadError } = useCatalog()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!catalog || !attachments || !agents) return
    try {
      navigate(decodeShare(code, { catalog, attachments, agents }), { replace: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }, [code, catalog, attachments, agents, navigate])

  const failure = error || loadError
  return (
    <div className="grid h-dvh place-items-center p-4">
      {failure ? (
        <div className="glass-strong flex max-w-sm flex-col items-center gap-3 rounded-3xl p-6 text-center">
          <Link2Off className="size-8 text-muted-foreground" />
          <div className="text-[15px] font-semibold">Can’t open this link</div>
          <div className="text-[12.5px] text-muted-foreground">{failure}</div>
          <Button render={<Link to={selectionPath({ kind: 'skin', ...DEFAULT_SKIN })} />}>Open the viewer</Button>
        </div>
      ) : (
        <div className="glass-strong flex items-center gap-3 rounded-2xl px-4 py-3">
          <Spinner />
          Opening the shared view…
        </div>
      )}
    </div>
  )
}
