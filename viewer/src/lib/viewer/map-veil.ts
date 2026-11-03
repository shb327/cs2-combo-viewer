/** How long the veil takes to cover the view, and to lift off it (ms). */
const COVER_MS = 280
const REVEAL_MS = 650
/** How long a new background video settles from its zoom (ms). */
const SETTLE_MS = 1400

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A veil over the viewport while the map changes: it fades in (a dark blur), the old background is swapped for the
 * new one under it, and it lifts while the new background video eases out of a slight zoom — instead of the old
 * video cutting to an empty frame and the new one popping in.
 */
export class MapVeil {
  private readonly el = document.createElement('div')

  constructor(container: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none', opacity: '0', visibility: 'hidden',
      background: 'radial-gradient(ellipse at 50% 60%, rgb(24 22 36 / 0.55), rgb(6 6 10 / 0.92) 75%)',
      backdropFilter: 'blur(18px) saturate(1.2)',
      transition: `opacity ${COVER_MS}ms ease-out`,
    })
    // Hidden once lifted: a backdrop blur costs a pass every frame even at opacity 0.
    this.el.addEventListener('transitionend', () => { if (this.el.style.opacity === '0') this.el.style.visibility = 'hidden' })
    container.appendChild(this.el)
  }

  /** Fades in over the view; resolves once it is covered. */
  async cover(): Promise<void> {
    if (this.el.style.opacity === '1') return
    this.el.style.visibility = 'visible'
    this.el.style.transition = `opacity ${COVER_MS}ms ease-out`
    void this.el.offsetWidth // (starts the fade from where it is)
    this.el.style.opacity = '1'
    await wait(COVER_MS)
  }

  /** Lifts the veil; a new background video (already in place) settles from a slight zoom meanwhile. */
  reveal(video?: HTMLVideoElement | null): void {
    if (video) {
      video.style.transform = 'scale(1.06)'
      video.style.transition = 'none'
      void video.offsetWidth // (applies the start before the transition)
      video.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      video.style.transform = 'scale(1)'
    }
    // a frame later, so the swapped background is drawn before the veil starts lifting
    requestAnimationFrame(() => {
      this.el.style.transition = `opacity ${REVEAL_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
      this.el.style.opacity = '0'
    })
  }

  dispose(): void {
    this.el.remove()
  }
}
