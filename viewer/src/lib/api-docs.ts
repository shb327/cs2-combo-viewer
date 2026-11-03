/**
 * The embed API's reference, as the /api page shows it (the README's "Public API" section, as data).
 */

export interface DocRow {
  /** The parameter or message, as written in code. */
  name: string
  /** Its values, when it takes a few. */
  values?: string
  description: string
  /** The default, when it has one. */
  fallback?: string
}

export interface ApiSection {
  id: string
  title: string
}

export const API_SECTIONS: ApiSection[] = [
  { id: 'quick-start', title: 'Quick start' },
  { id: 'playground', title: 'Playground' },
  { id: 'what', title: 'What to show' },
  { id: 'how', title: 'How to show it' },
  { id: 'to-embed', title: 'Messages to the embed' },
  { id: 'from-embed', title: 'Messages from the embed' },
  { id: 'notes', title: 'Good to know' },
]

/** The inspect maps an embed can use as its background (`map`). */
export const EMBED_MAPS = [
  'studio', 'de_mirage', 'de_dust2', 'de_inferno', 'de_ancient', 'de_ancient_night', 'de_anubis', 'de_nuke', 'de_overpass',
  'de_vertigo', 'de_cache', 'de_train', 'cs_italy', 'cs_office', 'ar_baggage', 'warehouse',
]

export const TARGET_PARAMS: DocRow[] = [
  { name: 'inspect', description: 'An inspect link (steam://rungame/730/…csgo_econ_action_preview <hex>) or just its hex. Brings the float, pattern, stickers and charm with it. Old S…A…D… links can’t be read.' },
  { name: 'def + paint', description: 'A weapon or gloves by item definition index and paint index (def=7&paint=180 is the AK-47 | Fire Serpent).' },
  { name: 'skin', description: 'A skin by catalog key, item|kit (weapon_ak47|cu_fireserpent_ak47_bravo).' },
  { name: 'sticker', description: 'A sticker on its own, by id.' },
  { name: 'charm', description: 'A charm on its own, by id.' },
  { name: 'character', description: 'An agent, by id (customplayer_…). An inspect link of an agent brings its patches.' },
  { name: 'pin', description: 'A collectible pin on its own, by its item definition index (pin=6101 is the Dust II pin; the keys of db.json’s pins).' },
  { name: 'patch', description: 'An agent patch on its own, on the game’s inspect card, by its patch kit id (patch=4553 is Welcome to the Clutch; the keys of db.json’s patches).' },
  { name: 'pet', description: 'A pet on its own, by its pet definition number: 1 egg, 2 chick, 3 catalana, 4 silkie, 5 polish. Pets are not in db.json; the viewer lists their colours and animations.' },
]

export const OPTION_PARAMS: DocRow[] = [
  { name: 'float', values: '0–1', description: 'Clamped to the skin’s range; wins over an inspect link’s.', fallback: '0, or the link’s' },
  { name: 'seed', values: '1–1000', description: 'The pattern; wins over an inspect link’s.', fallback: '1, or the link’s' },
  { name: 'view', values: 'orbit · fpv', description: 'First person applies to weapons; other items stay in orbit.', fallback: 'orbit' },
  { name: 'map', values: 'an inspect map id · studio', description: 'The background: one of the game’s inspect maps, or the studio.', fallback: 'studio' },
  { name: 'loadout_gloves', values: 'item|kit', description: 'The player’s skin gloves (first person, and on an agent).', fallback: 'the agent’s own' },
  { name: 'loadout_gloves_float', values: '0–1', description: 'Those gloves’ float.', fallback: '0.15' },
  { name: 'loadout_gloves_seed', values: '1–1000', description: 'Those gloves’ pattern.', fallback: 'the gloves’ own' },
  { name: 'sticker_wear', values: '0–1', description: 'A sticker shown on its own: its wear (0 pristine, 1 scratched).', fallback: 'the link’s, or 0' },
  { name: 'sticker_card', values: '1', description: 'A sticker shown on its own: on the game’s inspect card (the grey card with the CS2 mark it sits on in the inspect).', fallback: 'off' },
  { name: 'charm_pattern', values: '0–99999', description: 'A charm shown on its own: its pattern.', fallback: 'the link’s, or 0' },
  { name: 'loadout_weapon', values: 'item|kit', description: 'The weapon skin an agent holds (catalog key; empty for none).', fallback: 'none' },
  { name: 'loadout_weapon_float', values: '0–1', description: 'That weapon’s float.', fallback: '0.1' },
  { name: 'loadout_weapon_seed', values: '1–1000', description: 'That weapon’s pattern.', fallback: '1' },
  { name: 'agent_patches', values: 'id~size,…', description: 'The patches an agent wears: one entry per slot (3), comma-separated, an empty entry leaves the slot empty (agent_patches=4588~1.15,,4584). id is a patch kit id; size scales the patch (1 as designed, 0.5–1.5).', fallback: 'none, or the link’s' },
  { name: 'pet_color', values: '0–12', description: 'A pet shown on its own: its colour, as an index (0 is the first; the egg and the chick have one, the catalana 13, the silkie 9, the polish 12). Clamped to the pet’s colours.', fallback: '0' },
  { name: 'pet_animation', values: 'a clip name', description: 'A pet shown on its own: the clip it plays in a loop (chick_idle03, chick_trick05 for a dance, chick_walk, chick_egg_reaction01 for the egg…). The names are the file names behind the viewer’s Animation panel; an unknown name plays the default idle.', fallback: 'its first idle' },
  { name: 'loadout_agent', values: 'customplayer_…', description: 'The agent whose arms and sleeves first person shows.', fallback: 'the default CT agent' },
  { name: 'stickers', values: 'id~slot~wear~x~y~rotation~scale,…', description: 'The weapon’s stickers, comma-separated; first load only.', fallback: 'none, or the link’s' },
  { name: 'viewmodel_sway', values: '0', description: 'First person’s weapon stops swaying with the pointer.', fallback: 'on' },
  { name: 'viewmodel_left_hand', values: '1', description: 'First person holds the weapon in the left hand.', fallback: 'off' },
  { name: 'side', values: 'front · back', description: 'Which side of the item faces the camera: front is the initial view, back a half turn around it (the item’s other side).', fallback: 'front' },
  { name: 'knife_pose', values: 'vertical · horizontal · tilted', description: 'How a knife stands: upright, lying flat or tilted. Other items ignore it; choosing a pose brings the view back to front unless side is given too.', fallback: 'tilted' },
  { name: 'auto_rotate', values: '1', description: 'The item turns on its own.', fallback: 'off' },
  { name: 'bg', values: 'transparent', description: 'No backdrop: the page shows through.', fallback: 'the studio backdrop' },
  { name: 'quality', values: 'lite · max', description: 'lite, for small or busy embeds: draws at 1× resolution without antialiasing, and stops drawing while scrolled out of view. max, for renders: always the full resolution, never lowered while frames are slow.', fallback: 'full, lowered while frames are slow' },
  { name: 'ui', values: '0', description: 'No spinner or error message (the page shows its own). The watermark always stays.', fallback: 'shown' },
]

export const COMMANDS: DocRow[] = [
  { name: "{ type: 'cs3d:load', target, options? }", description: 'Shows another item. target is one of { inspect }, { def, paint }, { skin }, { sticker }, { charm }, { character }, { pin }, { patch }, { pet }; options as for cs3d:set (an agent with patches: target { character } and options { agent_patches }; a pet: target { pet } and options { pet_color, pet_animation }).' },
  { name: "{ type: 'cs3d:set', options }", description: 'Changes float, seed, view, map, the loadout_* options, sticker_wear, sticker_card, charm_pattern, agent_patches, pet_color, pet_animation, viewmodel_sway, viewmodel_left_hand, side, knife_pose or auto_rotate without reloading the page (an agent’s gloves or weapon, and view, redraw the model behind the last frame).' },
  { name: "{ type: 'cs3d:setMap', map }", description: 'Changes the map (an inspect map id, or studio).' },
  { name: "{ type: 'cs3d:inspect' }", description: 'Plays the weapon’s inspect animation (first person).' },
  { name: "{ type: 'cs3d:inspectGloves' }", description: 'Looks at the gloves: in first person with skin gloves, or on a gloves skin.' },
  { name: "{ type: 'cs3d:resetView' }", description: 'Puts the camera back (and side to front).' },
  { name: "{ type: 'cs3d:screenshot', id? }", description: 'Replies cs3d:screenshot with a PNG data URL (watermarked).' },
  { name: "{ type: 'cs3d:screenshots', id?, longSide? }", description: 'Replies cs3d:screenshots with the item alone from the front and from the back, as two transparent PNG Blobs (longSide pixels at most, 2400 by default; no watermark).' },
  { name: "{ type: 'cs3d:share', id? }", description: 'Replies cs3d:share with the share link: the short /share/<code>, or the full link when the view doesn’t fit a code.' },
  { name: "{ type: 'cs3d:openShare' }", description: 'Opens the share dialog inside the embed (the link to copy, or an image card to download).' },
  { name: "{ type: 'cs3d:getState', id? }", description: 'Replies cs3d:state with the current settings.' },
]

export const EVENTS: DocRow[] = [
  { name: "{ type: 'cs3d:ready', version }", description: 'The embed listens for messages (protocol version 1).' },
  { name: "{ type: 'cs3d:loading' }", description: 'An item starts loading.' },
  { name: "{ type: 'cs3d:loaded', item }", description: 'It is shown. item: { kind, id, floatMin, floatMax, canInspect, canInspectGloves }, plus stickerWear (a sticker), charmPattern (a charm) or agentPatches (an agent: its patches, as the agent_patches option) or petColor and petAnimation (a pet: as the pet_color and pet_animation options). It fires again when a change redraws the model (an agent’s gloves or weapon, first person).' },
  { name: "{ type: 'cs3d:error', message }", description: 'It can’t be shown (unknown item, bad link, missing asset…).' },
  { name: "{ type: 'cs3d:screenshot', id, dataUrl }", description: 'Reply to cs3d:screenshot.' },
  { name: "{ type: 'cs3d:screenshots', id, front, back }", description: 'Reply to cs3d:screenshots: two PNG Blobs.' },
  { name: "{ type: 'cs3d:share', id, url }", description: 'Reply to cs3d:share: the item with its float, pattern, stickers, charm, first person and loadout.' },
  { name: "{ type: 'cs3d:state', id, state }", description: 'Reply to cs3d:getState: { item, share_url, float, seed, view, map, loadout_*, sticker_wear, sticker_card, charm_pattern, agent_patches, pet_color, pet_animation, viewmodel_sway, viewmodel_left_hand, side, knife_pose, auto_rotate }.' },
  { name: "{ type: 'cs3d:key', key: 'Escape' }", description: 'Escape was pressed inside the embed (an iframe with the focus keeps the keys): close it if you show it in a dialog. F (inspect, first person) and G (look at the gloves) work inside the embed itself.' },
]

/** The page's code samples. */
export const LISTEN_SAMPLE = `const frame = document.querySelector('iframe')

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return
  if (e.data.type === 'cs3d:loaded') {
    console.log('float range', e.data.item.floatMin, e.data.item.floatMax)
  }
})

frame.contentWindow.postMessage({ type: 'cs3d:set', options: { float: 0.25, seed: 661 } }, '*')`
