/**
 * The g_flWeaponLength1 the knife composite is given. Its expressions size the pattern, wear and grunge by
 * g_flWeaponLength1 / 36 (unless the paint sets g_bIgnoreWeaponSizeScale), but the game sizes knife textures by the
 * composite's g_flUvScale1: the composite inputs' own g_flWeaponLength1 doesn't match it on several knives (checked
 * against in-game pictures of the Gut Knife and renders of three other knives). So it is fed as uvScale × 36;
 * without a uvScale, the composite inputs' weapon length is kept.
 */
export function compositeWeaponLength(ci: { uvScale?: number | null; weaponLength?: number | null }): number {
  return ci.uvScale != null ? ci.uvScale * 36 : (ci.weaponLength ?? 32)
}
