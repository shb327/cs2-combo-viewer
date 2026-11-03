import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface SwitchFieldProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}

/** A switch with its label beside it. */
export function SwitchField({ checked, label, onChange }: SwitchFieldProps) {
  const id = useId()
  return (
    <div className="flex items-center gap-2.5">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-[12.5px] font-normal text-foreground/80">{label}</Label>
    </div>
  )
}
