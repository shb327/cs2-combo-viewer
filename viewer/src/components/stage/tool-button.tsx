import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ToolButtonProps {
  icon: LucideIcon
  label: string
  /** A toggle: lit while on. */
  pressed?: boolean
  disabled?: boolean
  iconClassName?: string
  onClick: () => void
}

/** An icon button of the stage toolbar; with `pressed` it is a toggle, lit while on. */
export function ToolButton({ icon: Icon, label, pressed, disabled, iconClassName, onClick }: ToolButtonProps) {
  return (
    <Button
      variant={pressed ? 'default' : 'outline'}
      size="icon-lg"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className={iconClassName} />
    </Button>
  )
}
