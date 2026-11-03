import { Section } from '@/components/common/section'
import { Skeleton } from '@/components/ui/skeleton'

/** Placeholder sections shown in the sidebar before the first skin has loaded. */
export function SidebarSkeleton() {
  return (
    <>
      <Section title="Float">
        <div className="flex items-center gap-3">
          <Skeleton className="h-2.5 flex-1 rounded-full" />
          <Skeleton className="h-8 w-24" />
        </div>
      </Section>
      <Section title="Pattern">
        <div className="flex items-center gap-3">
          <Skeleton className="h-1 flex-1 rounded-full" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="size-8" />
        </div>
      </Section>
      <Section title="Attachments">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-7 w-40" />
        </div>
      </Section>
    </>
  )
}
