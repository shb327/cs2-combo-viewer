/** What drawing an item from both sides needs from the viewer. */
export interface SideStage<T> {
  /** The initial framing: the camera at the front, the item as it stands. */
  resetView(): void
  /**
   * Turns the item half way round in front of the camera. The camera and the lights stay where they are, so the back is
   * lit as the front was (turning the camera instead would light the back from behind).
   */
  turnBack(): void
  draw(): T
}

/** The item from the front, then from the back (turned under the same light); the viewer is left at the front. */
export function drawSides<T>(stage: SideStage<T>): { front: T; back: T } {
  stage.resetView()
  const front = stage.draw()
  stage.turnBack()
  const back = stage.draw()
  stage.resetView()
  return { front, back }
}
