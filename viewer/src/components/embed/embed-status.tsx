import { Callout } from '@/components/common/callout'
import { Spinner } from '@/components/common/spinner'

export function EmbedStatus({ loading, error }: { loading: boolean; error: string }) {
  return (
    <>
      {loading && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="glass-strong flex items-center gap-3 rounded-2xl px-4 py-3"><Spinner />Loading…</div>
        </div>
      )}
      {error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <Callout tone="error" pill className="pointer-events-auto">{error}</Callout>
        </div>
      )}
    </>
  )
}
