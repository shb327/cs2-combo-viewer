import * as THREE from 'three'

/**
 * The normalScale for a game normal texture on an exported model. The export writes the game's normal textures as RGB
 * normals with green pointing up the image; three.js reads green along the bitangent cross(N, T) · w, which on the
 * exported models (knives, gloves, arms, agents) points down it. Read as they are, a knife's or an arm's relief is
 * mirrored top to bottom (a ridge lit from above lit on its lower side): green is negated. The gloves' resolve writes
 * its map for three.js's frame already (GLOVE_RESOLVE) and keeps the default scale.
 */
export function gameNormalScale(): THREE.Vector2 {
  return new THREE.Vector2(1, -1)
}
