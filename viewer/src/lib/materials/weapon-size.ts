/** F_PAINT_STYLE values whose pattern is projected from the composite's position map (spray paint, airbrush). */
const POSITION_PROJECTED_STYLES: ReadonlySet<number> = new Set([2, 5])

/**
 * The g_flWeaponLength1 the knife composite is given. Its expressions size the pattern, wear and grunge by
 * g_flWeaponLength1 / 36 (unless the paint sets g_bIgnoreWeaponSizeScale). Which value the game sizes a knife's
 * textures by depends on how the paint style places its pattern:
 *
 * - Spray paint and airbrush project the pattern from the position map, which is normalized to the knife's size; the
 *   composite inputs' g_flWeaponLength1 is the knife's length in inches, so they keep it (checked against Shadow
 *   Daggers | Scorched in game).
 * - The other styles sample the pattern by UV, and the game sizes them by g_flUvScale1 (checked against in-game
 *   pictures of the Gut Knife and renders of three other knives), so they get uvScale × 36. Without a uvScale, the
 *   composite inputs' weapon length is kept.
 */
export function compositeWeaponLength(
  ci: { uvScale?: number | null; weaponLength?: number | null },
  paintStyle: number | null | undefined,
): number {
  const weaponLength = ci.weaponLength ?? 32
  if (paintStyle != null && POSITION_PROJECTED_STYLES.has(paintStyle)) return weaponLength
  return ci.uvScale != null ? ci.uvScale * 36 : weaponLength
}
