/**
 * The studio behind the model: a soft vignette and a floor grid in perspective. Pure CSS under the (transparent)
 * WebGL canvas, so the renderer and screenshots are unchanged.
 */
export function StudioBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 35%, oklch(0.24 0.06 292 / 70%), transparent 75%)' }} />
      <div
        className="absolute -inset-x-1/2 bottom-0 h-[58%] origin-bottom"
        style={{
          transform: 'perspective(520px) rotateX(64deg)',
          backgroundImage:
            'linear-gradient(oklch(1 0 0 / 7%) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 7%) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'linear-gradient(to top, black 5%, transparent 80%)',
        }}
      />
    </div>
  )
}
