import { X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface DialogHeadingProps {
  icon: LucideIcon
  title: string
  description: string
  onClose: () => void
}

/** A dialog's top bar: its icon in a raised tile, the title and a line under it, and close. */
export function DialogHeading({ icon: Icon, title, description, onClose }: DialogHeadingProps) {
  return (
    <div className="flex shrink-0 items-center gap-3.5 border-b border-white/10 px-5 py-4">
      <div className="bevel-primary grid size-11 shrink-0 place-items-center rounded-2xl text-white"><Icon className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <DialogTitle className="text-[16px] font-semibold tracking-tight">{title}</DialogTitle>
        <DialogDescription className="text-[12px] text-muted-foreground">{description}</DialogDescription>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}><X /></Button>
    </div>
  )
}
