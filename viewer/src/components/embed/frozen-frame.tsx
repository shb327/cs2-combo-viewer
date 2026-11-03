export function FrozenFrame({ canvas, thawing }: { canvas: HTMLCanvasElement; thawing: boolean }) {
  return (
    <div
      aria-hidden
      ref={(el) => { if (el && !el.contains(canvas)) { canvas.style.cssText = 'width:100%;height:100%;display:block'; el.replaceChildren(canvas) } }}
      className="pointer-events-none absolute inset-0 transition-opacity duration-300"
      style={{ opacity: thawing ? 0 : 1 }}
    />
  )
}
