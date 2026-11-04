precision highp float;

varying vec2 uv;
uniform sampler2D frame;
uniform vec2 size;
uniform float scale;
uniform float radius;
uniform float lensBand;
uniform float lensStrength;
uniform float softUnderTiles;
uniform float tileBrightness;
uniform float tileLift;
uniform float tileRadius;
uniform vec3 tint;
uniform float tintAmount;
uniform float rimStrength;
uniform vec4 tiles[16];
uniform int tileCount;

float box(vec2 q, vec2 b, float r) {
  vec2 d = abs(q) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// Frames arrive as BGRA.
vec3 sampleAt(vec2 px) {
  return texture2D(frame, clamp(px / size, 0.0, 1.0)).bgr;
}

// A small kernel: enough to soften, cheap enough to run on every pixel.
vec3 blurred(vec2 px, float r) {
  if (r <= 0.0) return sampleAt(px);
  vec3 sum = sampleAt(px) * 4.0;
  sum += (sampleAt(px + vec2(r, 0.0)) + sampleAt(px - vec2(r, 0.0)) + sampleAt(px + vec2(0.0, r)) + sampleAt(px - vec2(0.0, r))) * 2.0;
  sum += sampleAt(px + vec2(r, r)) + sampleAt(px + vec2(-r, r)) + sampleAt(px + vec2(r, -r)) + sampleAt(px + vec2(-r, -r));
  return sum / 16.0;
}

// 1 inside a tile, 0 outside, with an antialiased rounded edge.
float underTile(vec2 px) {
  for (int i = 0; i < 16; i++) {
    if (i >= tileCount) break;
    vec4 t = tiles[i];
    vec2 half_ = t.zw * 0.5;
    float inside = smoothstep(0.75, -0.75, box(px - t.xy - half_, half_, tileRadius));
    if (inside > 0.0) return inside;
  }
  return 0.0;
}

void main() {
  vec2 px = vec2(uv.x, 1.0 - uv.y) * size;
  vec2 c = size * 0.5;
  float d = box(px - c, c, radius);
  if (d > 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // The lens: sampling shifts inward near the edge, most at the rim, not at all in the middle.
  float k = clamp(1.0 + d / lensBand, 0.0, 1.0);
  float e = 1.0;
  vec2 n = normalize(vec2(
    box(px - c + vec2(e, 0.0), c, radius) - box(px - c - vec2(e, 0.0), c, radius),
    box(px - c + vec2(0.0, e), c, radius) - box(px - c - vec2(0.0, e), c, radius)
  ) + 1e-5);
  vec2 bent = px - n * k * k * k * lensStrength;

  // Tiles soften what's behind them and darken it, which is what makes their text readable.
  float tile = underTile(px);
  vec3 behind = mix(blurred(bent, softUnderTiles) * tileBrightness, vec3(1.0), tileLift);
  vec3 color = mix(sampleAt(bent), behind, tile);
  color = mix(color, tint, tintAmount);

  // The rim catches the light, brighter where the corners curve, and takes on what's behind it.
  float edge = smoothstep(-1.6 * scale, -0.2 * scale, d);
  float corner = abs(n.x * n.y) * 2.0;
  float top = 0.55 + 0.45 * abs(n.y);
  vec3 rimColor = mix(sampleAt(bent), vec3(1.0), 0.72);
  color = mix(color, rimColor, edge * rimStrength * (top + corner * 0.6));
  float inner = smoothstep(-5.0 * scale, -1.0 * scale, d) * (1.0 - edge);
  color += inner * 0.035;

  float alpha = smoothstep(0.5, -0.5, d);
  gl_FragColor = vec4(color * alpha, alpha);
}
