/**
 * csgo_weapon_sticker's sticker layer (decompiled from the game's shader: extracted/shaders/spv_sticker): the
 * sticker color, automatic PBR color fitting (g_vAlbedoLevels / metallic levels, color boost), glitter
 * (glitter normals → sin(reflect(V, N')·12) sparkles), holographic (a spectrum looked up by the view angle
 * through the sfx mask), wear (scratches, alpha-biased fading, paper backing showing through) and roughness.
 * stickerEval(i, sk, skDx, skDy, maskR, maskG, V, N, tbn) → StickerOut; V points to the camera, N is the surface normal (one space);
 * skDx/skDy are the sticker UV's screen derivatives, taken by the caller outside any per-pixel branch.
 */
export const STICKER_GLSL = `
  #define STICKER_MAX 5
  uniform highp sampler2DArray uStTex;
  uniform vec4 uStFlags[STICKER_MAX]; uniform vec4 uStFlags2[STICKER_MAX]; uniform vec4 uStFlags3[STICKER_MAX];
  uniform vec3 uStTint[STICKER_MAX]; uniform vec4 uStParams[STICKER_MAX]; uniform vec4 uStWear[STICKER_MAX];
  struct StickerOut { vec3 color; float alpha; float rough; float metal; vec3 emissive; vec3 normal; };
  // A tangent frame from the screen-space derivatives of the position and the sticker UV (cotangent frame).
  // (from derivatives taken by the caller in uniform control flow: inside a per-pixel branch they are undefined)
  mat3 stTbnD(vec3 dp1, vec3 dp2, vec2 du1, vec2 du2, vec3 n) {
    vec3 a = cross(dp2, n), b = cross(n, dp1);
    vec3 t = a * du1.x + b * du2.x, bt = a * du1.y + b * du2.y;
    float s = inversesqrt(max(max(dot(t, t), dot(bt, bt)), 1e-12));
    return mat3(t * s, bt * s, n);
  }
  mat3 stTbn(vec3 p, vec3 n, vec2 uv) { return stTbnD(dFdx(p), dFdy(p), dFdx(uv), dFdy(uv), n); }
  const vec3 ST_LW = vec3(0.2125, 0.7154, 0.0721);
  const vec3 ST_ALBEDO = vec3(0.045, 0.736968, 0.85);
  const vec3 ST_DARK_METAL = vec3(0.1, 0.736968, 0.92);
  const vec3 ST_METAL = vec3(0.45, 0.736968, 0.92);
  const vec3 ST_HOLO = vec3(0.05, 0.62149, 0.85);
  const float FOIL_SAT = 1.7;
  // The sticker UV's screen derivatives for the current sticker (set by stickerEval: see stTbnD).
  vec2 gStDx, gStDy;
  vec4 stTex(vec2 uv, float layer) { return textureGrad(uStTex, vec3(uv, layer), gStDx, gStDy); }
  vec3 stLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
  // The CLI exports the game's normal textures as plain RGB normals (roughness, where packed, in alpha); the game
  // reads them hemi-octahedral and flips y.
  vec3 stNrm(vec3 e) {
    vec3 n = normalize(e * 2.0 - 1.0);
    n.y = -n.y;
    return n;
  }
  // The game's PBR color fitting: n = the color's direction (·1.06), brightness remapped into the levels.
  vec3 stFit(vec3 dir, vec3 c, vec3 lv, float lo, float boost, float lum, float boostDiv) {
    vec3 n = normalize(max(vec3(0.0003), dir)) * 1.06;
    vec3 a = max(n * lo * 1.732 / length(n) / dot(n, ST_LW), n * mix(lv.x, lv.z, clamp(pow(max(c.r, max(c.g, c.b)) * boost, lv.y), 0.0, 1.0)));
    return mix(vec3(lo), mix(a, min(vec3(lv.z), a + vec3(lum)), max(0.0, boost - 1.0) / boostDiv), pow(smoothstep(0.0003, lo, lum), 0.5));
  }
  // The glitter flakes' normals stay hemi-octahedral in the export (x + y and x − y), as the game reads them.
  vec3 stOct(vec2 e) {
    float a = e.x + e.y - 1.00392162, b = e.x - e.y;
    return normalize(vec3(a, b, 1.0 - abs(a) - abs(b)));
  }
  vec3 stSparkle(vec3 V, vec3 n) {
    vec3 s = sin(reflect(V, n) * 12.0);
    vec3 hi = max(vec3(0.0), s - 0.99) * 100.0;
    return vec3(pow(dot(clamp(-s, 0.0, 1.0), ST_LW), 4.0)) + vec3(dot(clamp(0.15 - s, 0.0, 1.0), ST_LW) * 0.25) + (hi + pow(hi.yzx, vec3(4.0))) * 3.0;
  }
  StickerOut stickerEval(int si, vec2 sk, vec2 skDx, vec2 skDy, float maskR, float maskG, vec3 V, vec3 N, mat3 tbn) {
    gStDx = skDx; gStDy = skDy;
    StickerOut o;
    vec4 uF = uStFlags[si], uF2 = uStFlags2[si], uF3 = uStFlags3[si], uP = uStParams[si], uW = uStWear[si];
    vec3 uT = uStTint[si];
    float B = float(si * 6);
    bool metallic = uF.x > 0.5, paper = uF.w > 0.5, autoFit = uF2.y > 0.5, legacy = uF2.z > 0.5;
    float tintSat = uP.x, boost = uP.y, sfxBoost = uP.z;
    vec2 uv = clamp(sk, 0.0, 1.0);
    vec4 st = stTex(uv, B + 0.0);
    st.rgb = stLin(st.rgb);
    float alpha = clamp(st.a * 12.75, 0.0, 1.0);
    vec3 c = st.rgb;
    vec4 nr = uF3.x > 0.5 ? stTex(uv, B + 1.0) : vec4(0.5, 0.5, 1.0, 0.5);
    // Foil: a polished metal of the sticker's own color (the fitted albedo came out dark and the default roughness map too glossy)
    float rough = metallic ? 0.28 : uF3.x > 0.5 ? nr.a : 0.55;
    // (a touch under full metal: the viewer's dim environment would leave a pure metal dark)
    float metal = metallic ? 0.8 : 0.0;
    o.emissive = vec3(0.0);
    // Glitter: the sfx mask's 1 − w, sparkles from the glitter normals (two layers, offset by half a tile).
    if (uF.z > 0.5) {
      float g = 1.0 - stTex(uv, B + 2.0).w;
      if (g > 0.0) {
        // g_flGlitterScaleSticker0 × 2.5 tiles across the sticker, as in the game.
        float k = 2.5 * uP.w;
        // Tiled and filtered, as the game samples it (point sampling at this density turns into moiré stripes);
        // the gradients come from the unwrapped UV so the tile seams don't drop to the smallest mip.
        vec2 t1 = uv * k, t2 = (uv + 0.5) * k;
        vec2 dx = skDx * k, dy = skDy * k;
        vec4 g1 = textureGrad(uStTex, vec3(fract(t1), B + 5.0), dx, dy);
        vec4 g2 = textureGrad(uStTex, vec3(fract(t2), B + 5.0), dx, dy);
        vec3 n1 = stOct(g1.xy); n1 *= n1.z;
        vec3 n2 = stOct(g2.xy);
        vec3 w1 = normalize(tbn * n1), w2 = normalize(tbn * n2);
        vec3 base = autoFit ? stFit(c, c, ST_ALBEDO, ST_ALBEDO.x, 1.0, dot(clamp(c, 0.0, 1.0), ST_LW), 63.0) : c;
        o.emissive = max(stSparkle(V, w1) * g1.w, stSparkle(V, w2) * g2.w) * base * sfxBoost * g;
        metal = max(metal, g * 0.5);
      }
    }
    // Color: tint / saturation, automatic PBR fitting.
    if (autoFit && !metallic) {
      vec3 tint = mix(vec3(1.0), uT, metal);
      float sat = mix(0.0, tintSat, metal);
      vec3 lvMix = vec3(metal);
      if (legacy) {
        vec3 t = clamp(mix(c, vec3(dot(c, ST_LW)), sat) * tint, 0.0, 1.0);
        float lum = dot(clamp(t * boost, 0.0, 1.0), ST_LW);
        vec3 lv = mix(ST_ALBEDO, mix(ST_METAL, ST_DARK_METAL, smoothstep(0.55, 0.0156, lum)), lvMix);
        c = stFit(t, t, lv, mix(ST_ALBEDO.x, ST_DARK_METAL.x, metal), boost, lum, 63.0);
      } else {
        // (The decompiled shader blends toward the plain tint by g_flTintSaturate — which would turn every gold sticker
        // silver, while the game's own renders keep the texture's hue: the color stays.)
        vec3 dir = tint * c;
        float lum = dot(clamp(c * boost, 0.0, 1.0), ST_LW);
        vec3 lv = mix(ST_ALBEDO, mix(ST_METAL, ST_DARK_METAL, smoothstep(0.55, 0.0156, lum)), lvMix);
        c = stFit(dir, c, lv, mix(ST_ALBEDO.x, ST_DARK_METAL.x, metal), boost, lum, 63.0);
      }
    } else if (metallic) {
      // Foil metals read richer than their texture (the pale gold ones come out cream otherwise): saturated around the luma.
      // (in gamma space: in linear the oranges turn red)
      vec3 gm = pow(c, vec3(1.0 / 2.2));
      gm = max(vec3(0.0), mix(vec3(dot(gm, ST_LW)), gm, FOIL_SAT));
      c = pow(gm, vec3(2.2)) * uT * (legacy ? boost : 1.0);
      // The game's fitting brightens dark textures by g_flColorBoostSticker0 (the Gold Web is authored at ×4.5).
      if (!legacy) c = min(c * max(1.0, boost / 2.0), vec3(1.0));
    }
    // (self-illumination's mask, the normal texture's .w in the game, isn't in the CLI export: not shown)
    // Holographic: spectrum at (mask.y + view terms, mask.z), fitted to the holo levels, over mask.x.
    if (uF.y > 0.5) {
      vec3 m = stTex(uv, B + 2.0).xyz;
      if (m.x > 0.0) {
        vec2 suv = vec2(m.y + dot(V, N) - V.z, m.z);
        suv = vec2(fract(suv.x), uF3.y > 0.5 ? clamp(suv.y, 0.0, 1.0) : fract(suv.y));
        vec3 sp = stLin(textureLod(uStTex, vec3(suv, B + 4.0), 0.0).rgb);
        float lum = dot(clamp(sp * sfxBoost, 0.0, 1.0), ST_LW);
        vec3 n = normalize(max(vec3(0.0003), sp)) * 1.06;
        vec3 a = max(n * ST_HOLO.x * 1.732 / length(n) / dot(n, ST_LW), n * mix(ST_HOLO.x, ST_HOLO.z, clamp(pow(max(sp.r, max(sp.g, sp.b)) * sfxBoost, ST_HOLO.y), 0.0, 1.0)));
        vec3 holo = mix(vec3(ST_HOLO.x), mix(a, min(vec3(ST_HOLO.z), a + vec3(lum) * sfxBoost), max(0.0, sfxBoost - 1.0) / 63.0), pow(smoothstep(0.0003, ST_HOLO.x, lum), 0.5));
        c = mix(c, holo, m.x);
        metal *= 1.0 - m.x;
      }
    }
    // Wear.
    float wear = uW.w;
    if (wear > 0.0) {
      float qf = 1.0 - min(uW.z, stTex(uv, B + 3.0).r);
      float qg = mix(qf, qf * 0.5, wear);
      float ut = clamp(mix(wear, wear + 2.0 * (maskG - 0.5) * smoothstep(1.0, 0.85, wear), wear), 0.0, 1.0);
      float ni = paper ? 0.5 : (uW.y * (uW.y > 0.0 ? 0.5 : 0.25) + 0.5) * 0.5;
      float ts = clamp(ut - pow(clamp((st.a - 0.0784314) * 1.0851064, 0.0, 1.0), uW.x * uW.x), 0.0, 1.0);
      if (paper) {
        float e = clamp(ts * 2.0, 0.0, 1.0) + uW.y * ut;
        c = mix(vec3(mix(0.7, 0.2 + 0.4 * qg, ut)), c, smoothstep(e, e + 0.1, qg));
      }
      float us = clamp(ts * (1.0 + ni) - ni, 0.0, 1.0);
      if (!(metallic || uF2.w > 0.5)) rough = mix(rough, 0.8, step(qg, smoothstep(0.0, 0.35, ut)));
      c = mix(c, c * qg, ut * 0.3);
      alpha *= smoothstep(us, us + 0.1, qg);
    }
    o.color = c;
    // the sticker's own normal map (g_tNormalRoughnessSticker0 .xy, hemi-octahedral)
    o.normal = uF3.x > 0.5 ? normalize(tbn * stNrm(nr.xyz)) : N;
    o.alpha = alpha * maskR;
    o.rough = rough;
    o.metal = metal;
    return o;
  }`
