import { lazy, Suspense, useMemo } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Spinner } from '@/components/common/spinner'
import { HomePage } from '@/pages/home-page'

const EmbedPage = lazy(() => import('@/pages/embed-page').then((m) => ({ default: m.EmbedPage })))
const ApiPage = lazy(() => import('@/pages/api-page').then((m) => ({ default: m.ApiPage })))
const SharePage = lazy(() => import('@/pages/share-page').then((m) => ({ default: m.SharePage })))
const InspectPage = lazy(() => import('@/pages/inspect-page').then((m) => ({ default: m.InspectPage })))
const ViewerPage = lazy(() => import('@/pages/viewer-page').then((m) => ({ default: m.ViewerPage })))

function SkinRoute() {
  const { item = '', kit = '' } = useParams()
  const selection = useMemo(() => ({ kind: 'skin' as const, item, kit }), [item, kit])
  return <ViewerPage selection={selection} />
}

function StickerRoute() {
  const { id = '' } = useParams()
  const selection = useMemo(() => ({ kind: 'sticker' as const, id }), [id])
  return <ViewerPage selection={selection} />
}

function CharmRoute() {
  const { id = '' } = useParams()
  const selection = useMemo(() => ({ kind: 'charm' as const, id }), [id])
  return <ViewerPage selection={selection} />
}

function PinRoute() {
  const { id = '' } = useParams()
  const selection = useMemo(() => ({ kind: 'pin' as const, id }), [id])
  return <ViewerPage selection={selection} />
}

function PatchRoute() {
  const { id = '' } = useParams()
  const selection = useMemo(() => ({ kind: 'patch' as const, id }), [id])
  return <ViewerPage selection={selection} />
}

function PetRoute() {
  const { id = '' } = useParams()
  const selection = useMemo(() => ({ kind: 'pet' as const, id }), [id])
  return <ViewerPage selection={selection} />
}

function AgentRoute() {
  const { id = '' } = useParams()
  const selection = useMemo(() => ({ kind: 'agent' as const, id }), [id])
  return <ViewerPage selection={selection} />
}

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center"><Spinner /></div>}>
    <Routes>
      <Route path="/skin/:item/:kit" element={<SkinRoute />} />
      <Route path="/sticker/:id" element={<StickerRoute />} />
      <Route path="/charm/:id" element={<CharmRoute />} />
      <Route path="/agent/:id" element={<AgentRoute />} />
      <Route path="/pin/:id" element={<PinRoute />} />
      <Route path="/patch/:id" element={<PatchRoute />} />
      <Route path="/pet/:id" element={<PetRoute />} />
      <Route path="/inspect/*" element={<InspectPage />} />
      <Route path="/share/:code" element={<SharePage />} />
      <Route path="/embed" element={<EmbedPage />} />
      <Route path="/api" element={<ApiPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
