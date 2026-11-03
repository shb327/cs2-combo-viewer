import { Move } from 'lucide-react'
import { Kbd } from '@/components/common/kbd'
import { Button } from '@/components/ui/button'

interface EditButtonProps {
  editing: boolean
  onToggle: () => void
}

/** The stage's edit toggle (top right, E): while on, the weapon's stickers and charm are dragged with the pointer. */
export function EditButton({ editing, onToggle }: EditButtonProps) {
  return (
    <Button
      variant={editing ? 'default' : 'outline'}
      aria-pressed={editing}
      title={editing ? 'Stop editing (E)' : 'Edit: drag the stickers and the charm (E)'}
      className={editing ? 'pointer-events-auto h-10 rounded-2xl px-3' : 'glass-panel pointer-events-auto h-10 rounded-2xl px-3'}
      onClick={onToggle}
    >
      <Move /> {editing ? 'Editing' : 'Edit'} <Kbd className="hidden sm:inline-flex">E</Kbd>
    </Button>
  )
}
