// Nexren Store - GradientASCII Background (Vanilla JS + WebGL2)
(function initGradientASCII() {
  const MAX_COLORS = 8;
  const MAX_CLICKS = 4;
  const MAX_TRAIL = 24;
  const CLICK_LIFE = 1.2;
  const TRAIL_LIFE = 0.7;
  const TRAIL_STEP = 0.015;
  const INTRO_SECONDS = 2.4;
  const ATLAS_CELL_W = 60;
  const ATLAS_CELL_H = 100;
  const ATLAS_COLUMNS = 16;
  const FONT_SCALE = 0.78;
  const DEFAULT_COLORS = ['#1e3fd8', '#f6f8ff', '#a5d8ff', '#38bdf8'];
  const DEFAULT_CHARACTERS = ' =+xX0S8#@';
  const DEFAULT_FONT = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const SHAPES = { horizon: 0, pinch: 1, rise: 2, eclipse: 3 };
  const CLICK_EFFECTS = { none: 0, wave: 1, burst: 2 };

  const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const COMMON = `
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
`;

  const FIELD = `#version 300 es
precision highp float;
precision highp int;
uniform float uAspect;
uniform float uTime;
uniform int uShape;
uniform vec3 uRamp[8];
uniform int uCount;
uniform float uScale;
uniform float uSoftness;
uniform float uFlow;
uniform vec2 uSeed;
uniform vec4 uTrail[24];
uniform float uRadius;
uniform vec4 uClicks[4];
uniform int uClickEffect;
uniform float uIntro;
uniform float uFrame;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;
${COMMON}
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i), f);
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 labToRgb(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 horizon(vec2 p, float time, out float order) {
  float span = 0.5 * max(uAspect, 1.0);
  float x = p.x / span;
  float arch = -0.17 - 0.2 * x * x + 0.02 * sin(time * 0.6);
  float soft = mix(0.05, 0.22, uSoftness);
  float edge = p.y - arch;
  float rim = 0.38 * smoothstep(-soft, 0.42, edge);
  vec2 sun = vec2(0.08 * sin(time * 0.31) * span, 0.58);
  float spread = length((p - sun) / vec2(0.95 * span, 0.75));
  float sky = mix(0.55, 1.0, smoothstep(0.2, 0.95, spread));
  order = clamp(edge * 1.3, 0.0, 1.0);
  return vec3(rim, sky, smoothstep(0.18, 0.62, edge));
}

vec3 pinch(vec2 p, float time, out float order) {
  float span = 0.5 * max(uAspect, 0.75);
  float x = p.x / span;
  float sway = 0.02 * sin(x * 1.7 + time * 0.55);
  float breathe = 1.0 + 0.06 * sin(time * 0.8);
  float width = (0.13 + 0.22 * x * x) * breathe * mix(0.85, 1.2, uSoftness);
  float y = abs(p.y - sway) / width;
  float t = exp(-pow(y, 2.2)) * (0.42 + 0.58 * exp(-x * x * 1.8));
  order = clamp(abs(p.y - sway) * 2.4 + abs(x) * 0.3, 0.0, 1.0);
  return vec3(t, t, 0.0);
}

vec3 rise(vec2 p, float time, out float order) {
  float wide = max(uAspect, 0.9);
  vec2 center = vec2(0.05 * sin(time * 0.45) * wide, -0.7);
  vec2 radius = vec2(0.82 * wide, 0.64 * (1.0 + 0.04 * sin(time * 0.8)));
  float d = length((p - center) / radius);
  float soft = mix(0.6, 1.15, uSoftness);
  float t = clamp(pow(clamp(1.0 - d, 0.0, 1.0), soft) * 1.35, 0.0, 1.0);
  order = clamp((d - 0.2) * 1.3, 0.0, 1.0);
  return vec3(t, t, 0.0);
}

vec3 eclipse(vec2 p, float time, out float order) {
  float fit = min(1.0, uAspect * 1.25);
  float r = 0.23 * fit * (1.0 + 0.015 * sin(time * 0.9));
  float angle = atan(p.y, p.x);
  float rays = noise(vec2(cos(angle), sin(angle)) * 2.2 + time * 0.08) * 0.8 + 0.6;
  float d = length(p) - r;
  float reach = mix(0.07, 0.15, uSoftness) * rays * fit;
  float t = smoothstep(-0.006, 0.006 + 0.02 * uSoftness, d) * exp(-max(d, 0.0) / reach);
  order = clamp(d * 2.0, 0.0, 1.0);
  return vec3(t, t, 0.0);
}

vec4 tone(float t) {
  float x = smoothstep(0.3, 1.0, t) * float(uCount - 1);
  int index = int(floor(x));
  return vec4(mix(uRamp[index], uRamp[min(index + 1, uCount - 1)], fract(x)), smoothstep(0.0, 0.38, t));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float time = uTime;
  vec2 q = p / uScale;
  vec2 warp = vec2(
    noise(q * 1.6 + uSeed + vec2(0.0, time * 0.3)),
    noise(q * 1.6 + uSeed.yx + vec2(4.3, -time * 0.24))
  ) - 0.5;
  q += warp * uFlow * (uShape == 3 ? 0.04 : 0.18);
  float order = 0.0;
  vec3 shape;
  if (uShape == 0) shape = horizon(q, time, order);
  else if (uShape == 1) shape = pinch(q, time, order);
  else if (uShape == 2) shape = rise(q, time, order);
  else shape = eclipse(q, time, order);

  float reveal = clamp((uIntro * 1.45 - order) / 0.45, 0.0, 1.0);
  reveal = reveal * reveal * (3.0 - 2.0 * reveal);

  float scramble = 0.0;
  for (int i = 0; i < 24; i++) {
    vec4 point = uTrail[i];
    if (point.z <= 0.0) continue;
    vec2 d = p - point.xy;
    scramble = max(scramble, point.z * exp(-dot(d, d) / (uRadius * uRadius)));
  }
  for (int i = 0; i < 4; i++) {
    vec4 c = uClicks[i];
    if (c.w <= 0.0) continue;
    float d = length(p - c.xy);
    if (uClickEffect == 1) {
      scramble = max(scramble, exp(-pow((d - c.z * 0.75) / 0.06, 2.0)) * c.w);
    } else if (uClickEffect == 2) {
      float size = 0.08 + 0.22 * (1.0 - exp(-c.z * 5.0));
      scramble = max(scramble, (1.0 - smoothstep(size * 0.6, size, d)) * c.w);
    }
  }
  vec2 t = clamp(shape.xy * mix(0.7, 1.0, reveal), 0.0, 1.0);
  vec4 mixed = mix(tone(t.x), tone(t.y), shape.z);
  vec3 color = encode(labToRgb(mixed.rgb));
  float alpha = mixed.a * reveal;
  float dither = (hash12(gl_FragCoord.xy + uFrame * 13.7) - 0.5) / 255.0;
  outColor = clamp(vec4(color * alpha + dither, alpha + dither), 0.0, 1.0);
  outAux = vec4(reveal, scramble, 0.0, 1.0);
}`;

  const GLYPHS = `
uniform sampler2D uField;
uniform sampler2D uAux;
uniform sampler2D uAtlas;
uniform vec2 uResolution;
uniform vec2 uCell;
uniform vec2 uOffset;
uniform vec2 uAtlasGrid;
uniform float uCount;
uniform float uDensity;
uniform float uOpacity;
uniform float uFlicker;
uniform float uDepth;
uniform float uGlyphTime;
uniform float uSeedValue;
uniform float uLight;
${COMMON}
float sampleGlyph(float index, vec2 local, vec2 coord, float soft) {
  float column = mod(index, uAtlasGrid.x);
  float row = floor(index / uAtlasGrid.x);
  vec2 atlasUv = vec2((column + local.x) / uAtlasGrid.x, (row + 1.0 - local.y) / uAtlasGrid.y);
  vec2 continuous = coord / uAtlasGrid;
  float scale = exp2(soft);
  return textureGrad(uAtlas, atlasUv, dFdx(continuous) * scale, dFdy(continuous) * scale).a;
}

vec4 glyphAt(vec2 px) {
  vec2 coord = (px - uOffset) / uCell;
  vec2 cell = floor(coord);
  vec2 local = coord - cell;
  vec2 uv = clamp(((cell + 0.5) * uCell + uOffset) / uResolution, vec2(0.0), vec2(1.0));
  vec4 field = texture(uField, uv);
  vec4 aux = texture(uAux, uv);
  vec3 visible = uLight > 0.5 ? field.rgb + (1.0 - field.a) : field.rgb;
  float luma = dot(visible, vec3(0.2126, 0.7152, 0.0722));
  float value = uLight > 0.5 ? clamp((1.0 - luma) * 1.5, 0.0, 1.0) : luma;
  float pick = hash12(cell + uSeedValue * 7.31);
  float level = hash12(cell * 1.73 + 4.1 + uSeedValue);
  float tick = floor(uGlyphTime * 9.0 + level * 9.0);
  float wobble = (hash12(cell * 2.31 + tick * 17.7) - 0.5) * uFlicker * 0.4 + (level - 0.5) * 0.1;
  float tone = clamp(pow(value, 0.75) + wobble, 0.0, 1.0);
  float index = floor(tone * (uCount - 1.0) + 0.5);
  float decode = max(aux.g, 1.0 - aux.r);
  if (decode > 0.02) {
    float frame = floor(uGlyphTime * 20.0);
    if (hash12(cell * 3.7 + frame * 5.3) < decode * 1.25) index = 1.0 + floor(hash12(cell + frame * 1.37) * (uCount - 1.0));
  }
  float present = step(pick, uDensity * mix(1.0, 0.3 + tone * 1.1, 0.55));
  float cutoff = smoothstep(0.03, 0.1, value);
  float focus = step(hash12(cell * 0.71 + 9.2 + uSeedValue), uDepth);
  float coverage = sampleGlyph(index, local, coord, focus * 1.2);
  float alpha = uOpacity * present * cutoff * coverage * mix(1.0, 0.35 + 0.65 * level, 0.55) * (1.0 - focus * 0.5);
  if (uLight < 0.5) {
    vec3 light = field.rgb * 0.55 + vec3(0.03) * field.a;
    return vec4(light * alpha, 0.6 * field.a * alpha);
  }
  vec3 ink = visible * 0.8;
  return vec4(ink * alpha, alpha);
}
`;

  const HALO = `#version 300 es
precision highp float;
uniform float uDownscale;
in vec2 vUv;
out vec4 outColor;
${GLYPHS}
void main() {
  outColor = glyphAt(gl_FragCoord.xy * uDownscale);
}`;

  const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uStep;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 sum = texture(uSource, vUv) * 0.2270270270;
  sum += texture(uSource, vUv + uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, vUv - uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, vUv + uStep * 3.2307692308) * 0.0702702703;
  sum += texture(uSource, vUv - uStep * 3.2307692308) * 0.0702702703;
  outColor = sum;
}`;

  const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uHalo;
uniform float uGlow;
uniform float uGradient;
uniform float uGrain;
uniform float uFrame;
in vec2 vUv;
out vec4 outColor;
${GLYPHS}
void main() {
  vec4 base = texture(uField, vUv) * uGradient;
  vec4 glyph = glyphAt(gl_FragCoord.xy);
  vec4 halo = texture(uHalo, vUv) * uGlow;
  vec4 color;
  if (uLight < 0.5) {
    color = base + glyph + halo;
  } else {
    color = glyph + base * (1.0 - glyph.a);
    color += halo * 0.6 * (1.0 - color.a);
  }
  float grain = (hash12(gl_FragCoord.xy + uFrame * vec2(17.0, 59.0)) + hash12(gl_FragCoord.xy * 1.31 + uFrame * 7.0) - 1.0) * uGrain;
  float body = clamp(color.a, 0.0, 1.0);
  color.rgb += grain * (0.25 + body) * 0.5;
  color.a = clamp(color.a, 0.0, 1.0);
  color.rgb = clamp(color.rgb, 0.0, color.a);
  outColor = color;
}`;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const toLinear = value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

  const toLab = ([r, g, b]) => {
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ];
  };

  const compile = (gl, type, source) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  };

  const link = (gl, fragmentSource) => {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  };

  const createTarget = (gl, count) => {
    const textures = Array.from({ length: count }, () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });
    return { textures, framebuffer: gl.createFramebuffer(), width: 0, height: 0 };
  };

  const sizeTarget = (gl, target, width, height) => {
    if (target.width === width && target.height === height) return;
    target.width = width;
    target.height = height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    target.textures.forEach((texture, i) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const buildAtlas = (gl, characters, fontFamily) => {
    const list = [...new Set([...characters].filter(char => char !== '\n' && char !== '\r'))];
    if (!list.length) list.push(' ');
    const font = `300 ${Math.round(ATLAS_CELL_H * FONT_SCALE)}px ${fontFamily}`;
    const columns = Math.min(ATLAS_COLUMNS, list.length);
    const rows = Math.ceil(list.length / columns);
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_CELL_W * columns;
    canvas.height = ATLAS_CELL_H * rows;
    const context = canvas.getContext('2d');
    if (context) {
      context.font = font;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#fff';
      list.forEach((char, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        context.fillText(char, column * ATLAS_CELL_W + ATLAS_CELL_W / 2, row * ATLAS_CELL_H + ATLAS_CELL_H / 2 + 3);
      });
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture, count: list.length, grid: [columns, rows] };
  };

  const container = document.getElementById('bg-container');
  const canvas = document.getElementById('bg-canvas');
  if (!container || !canvas) return;

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false
  });
  if (!gl) {
    console.warn("WebGL2 is not supported in this browser.");
    return;
  }

  const palette = DEFAULT_COLORS.slice(0, MAX_COLORS);
  const settings = {
    colors: palette.length > 1 ? palette : [palette[0], palette[0]],
    shape: SHAPES['horizon'] ?? 0,
    characters: DEFAULT_CHARACTERS,
    cellSize: clamp(18, 6, 64),
    density: clamp(0.8, 0, 1),
    glyphOpacity: clamp(0.85, 0, 1),
    glow: clamp(0.2, 0, 2),
    depthOfField: clamp(0, 0, 1),
    flicker: clamp(0.2, 0, 1),
    softness: clamp(0.5, 0, 1),
    scale: clamp(1, 0.4, 2.5),
    flow: clamp(0.5, 0, 2),
    speed: Math.max(0, 1),
    gradientOpacity: clamp(0.9, 0, 1),
    grain: clamp(0.08, 0, 0.4),
    variation: 0,
    mouseInteraction: true,
    scrambleRadius: clamp(0.1, 0.02, 0.4),
    clickEffect: CLICK_EFFECTS['wave'] ?? 1,
    intro: true,
    lightMode: false,
    fontFamily: DEFAULT_FONT,
    dpr: null
  };

  const field = link(gl, FIELD);
  const halo = link(gl, HALO);
  const blur = link(gl, BLUR);
  const composite = link(gl, COMPOSITE);
  if (!field || !halo || !blur || !composite) return;

  const vao = gl.createVertexArray();
  const fieldTarget = createTarget(gl, 2);
  const haloA = createTarget(gl, 1);
  const haloB = createTarget(gl, 1);

  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  const parse = value => {
    const key = String(value);
    const cached = colorCache.get(key);
    if (cached) return cached;
    let rgb = [0, 0, 0];
    if (probe) {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = '#000000';
      probe.fillStyle = key;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
      rgb = [r / 255, g / 255, b / 255];
    }
    colorCache.set(key, rgb);
    return rgb;
  };

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const view = { width: 1, height: 1, ratio: 1 };
  const ramp = new Float32Array(MAX_COLORS * 3);
  const clickData = new Float32Array(MAX_CLICKS * 4);
  const clicks = [];
  const trailData = new Float32Array(MAX_TRAIL * 4);
  const trail = [];
  const pointer = { x: 0, y: 0, inside: false };
  let atlas = null;
  let atlasKey = '';
  let paletteKey = '';
  let time = 0;
  let glyphTime = 0;
  let introClock = settings.intro && !reduce ? 0 : 1;
  let frameSeed = 0;
  let grainClock = 0;
  let raf = 0;
  let last = 0;
  let visible = true;

  const syncAtlas = () => {
    const key = `${settings.fontFamily}|${settings.characters}`;
    if (key === atlasKey && atlas) return;
    atlasKey = key;
    if (atlas) gl.deleteTexture(atlas.texture);
    atlas = buildAtlas(gl, settings.characters, settings.fontFamily);
    document.fonts?.load?.(`300 64px ${settings.fontFamily}`, settings.characters).then(
      () => {
        if (atlasKey !== key) return;
        if (atlas) gl.deleteTexture(atlas.texture);
        atlas = buildAtlas(gl, settings.characters, settings.fontFamily);
        draw();
      },
      () => {}
    );
  };

  const syncPalette = () => {
    const key = settings.colors.join(',');
    if (key === paletteKey) return;
    paletteKey = key;
    settings.colors.forEach((color, i) => ramp.set(toLab(parse(color)), i * 3));
  };

  const bindGlyphs = (program, width, height) => {
    if (!atlas) return;
    const u = program.uniforms;
    const cellH = settings.cellSize * view.ratio;
    const cellW = cellH * (ATLAS_CELL_W / ATLAS_CELL_H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTarget.textures[0]);
    gl.uniform1i(u.uField, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fieldTarget.textures[1]);
    gl.uniform1i(u.uAux, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.uniform1i(u.uAtlas, 2);
    gl.uniform2f(u.uResolution, width, height);
    gl.uniform2f(u.uCell, cellW, cellH);
    gl.uniform2f(
      u.uOffset,
      (width - Math.ceil(width / cellW) * cellW) / 2,
      (height - Math.ceil(height / cellH) * cellH) / 2
    );
    gl.uniform2f(u.uAtlasGrid, atlas.grid[0], atlas.grid[1]);
    gl.uniform1f(u.uCount, atlas.count);
    gl.uniform1f(u.uDensity, settings.density);
    gl.uniform1f(u.uOpacity, settings.glyphOpacity);
    gl.uniform1f(u.uFlicker, reduce ? 0 : settings.flicker);
    gl.uniform1f(u.uDepth, settings.depthOfField);
    gl.uniform1f(u.uGlyphTime, glyphTime);
    gl.uniform1f(u.uSeedValue, settings.variation);
    gl.uniform1f(u.uLight, settings.lightMode ? 1 : 0);
  };

  const draw = () => {
    const aspect = view.width / view.height;
    syncAtlas();
    syncPalette();
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fieldTarget.framebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, fieldTarget.width, fieldTarget.height);
    gl.useProgram(field.program);
    const fu = field.uniforms;
    gl.uniform1f(fu.uAspect, aspect);
    gl.uniform1f(fu.uTime, time);
    gl.uniform1i(fu.uShape, settings.shape);
    gl.uniform3fv(fu.uRamp, ramp);
    gl.uniform1i(fu.uCount, settings.colors.length);
    gl.uniform1f(fu.uScale, settings.scale);
    gl.uniform1f(fu.uSoftness, settings.softness);
    gl.uniform1f(fu.uFlow, settings.flow);
    gl.uniform2f(fu.uSeed, settings.variation * 3.17, settings.variation * 1.91);
    gl.uniform4fv(fu.uTrail, trailData);
    gl.uniform1f(fu.uRadius, settings.scrambleRadius);
    gl.uniform4fv(fu.uClicks, clickData);
    gl.uniform1i(fu.uClickEffect, settings.clickEffect);
    gl.uniform1f(fu.uIntro, introClock);
    gl.uniform1f(fu.uFrame, frameSeed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const glowing = settings.glow > 0.001;
    if (glowing) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, 0, haloA.width, haloA.height);
      gl.useProgram(halo.program);
      bindGlyphs(halo, canvas.width, canvas.height);
      gl.uniform1f(halo.uniforms.uDownscale, canvas.width / haloA.width);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.useProgram(blur.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(blur.uniforms.uSource, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, haloB.framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]);
      gl.uniform2f(blur.uniforms.uStep, 1 / haloA.width, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, haloB.textures[0]);
      gl.uniform2f(blur.uniforms.uStep, 0, 1 / haloA.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(composite.program);
    bindGlyphs(composite, canvas.width, canvas.height);
    const cu = composite.uniforms;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]);
    gl.uniform1i(cu.uHalo, 3);
    gl.uniform1f(cu.uGlow, glowing ? settings.glow : 0);
    gl.uniform1f(cu.uGradient, settings.gradientOpacity);
    gl.uniform1f(cu.uGrain, settings.grain);
    gl.uniform1f(cu.uFrame, frameSeed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const resize = () => {
    view.width = Math.max(1, container.clientWidth || window.innerWidth);
    view.height = Math.max(1, container.clientHeight || window.innerHeight);
    // Cap DPR to 1x (and 0.75x on mobile) to eliminate GPU overheating and freezing
    view.ratio = window.innerWidth <= 860 ? 0.75 : 1;
    canvas.width = Math.max(1, Math.round(view.width * view.ratio));
    canvas.height = Math.max(1, Math.round(view.height * view.ratio));
    sizeTarget(
      gl,
      fieldTarget,
      Math.max(1, Math.round(canvas.width / 2)),
      Math.max(1, Math.round(canvas.height / 2))
    );
    const haloWidth = Math.max(1, Math.round(canvas.width / 4));
    const haloHeight = Math.max(1, Math.round(canvas.height / 4));
    sizeTarget(gl, haloA, haloWidth, haloHeight);
    sizeTarget(gl, haloB, haloWidth, haloHeight);
    draw();
    wake();
  };

  const updateInput = dt => {
    trail.forEach(point => {
      point.age += dt;
    });
    while (trail.length && trail[trail.length - 1].age > TRAIL_LIFE) trail.pop();
    for (let i = 0; i < MAX_TRAIL; i++) {
      const point = trail[i];
      if (!point) {
        trailData[i * 4 + 2] = 0;
        continue;
      }
      const k = 1 - point.age / TRAIL_LIFE;
      trailData.set([point.x, point.y, k * k, 0], i * 4);
    }
    clicks.forEach(click => {
      click.age += dt;
    });
    while (clicks.length && clicks[clicks.length - 1].age > CLICK_LIFE) clicks.pop();
    for (let i = 0; i < MAX_CLICKS; i++) {
      const click = clicks[i];
      if (!click) {
        clickData[i * 4 + 3] = 0;
        continue;
      }
      const k = click.age / CLICK_LIFE;
      const envelope = Math.min(1, click.age / 0.08) * (1 - k) * (1 - k);
      clickData.set([click.x, click.y, click.age, envelope], i * 4);
    }
  };

  let lastDrawTime = 0;
  const TARGET_FRAME_MS = 1000 / 30; // 30 FPS throttle saves 60-70% GPU load on low-end hardware

  const frame = now => {
    raf = 0;
    if (!visible || document.hidden) return;
    
    // Performance throttle: skip extra frames to protect low-end devices
    const elapsed = now - lastDrawTime;
    if (elapsed < TARGET_FRAME_MS) {
      raf = requestAnimationFrame(frame);
      return;
    }
    lastDrawTime = now - (elapsed % TARGET_FRAME_MS);

    const dt = last ? clamp((now - last) / 1000, 0.001, 0.05) : 1 / 30;
    last = now;
    if (!reduce) {
      time += dt * settings.speed * 0.4;
      glyphTime += dt * Math.max(settings.speed, 0.15);
    }
    if (introClock < 1) introClock = Math.min(1, introClock + dt / INTRO_SECONDS);
    grainClock += dt;
    if (!reduce && grainClock > 1 / 20) {
      grainClock = 0;
      frameSeed = (frameSeed + 1) % 97;
    }
    updateInput(dt);
    draw();
    const busy = !reduce || introClock < 1 || clicks.length > 0 || trail.length > 0;
    if (busy) raf = requestAnimationFrame(frame);
    else last = 0;
  };

  function wake() {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  const locate = event => {
    const rect = container.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
    const aspect = rect.width / Math.max(1, rect.height);
    pointer.inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    pointer.x = (x - 0.5) * aspect;
    pointer.y = y - 0.5;
  };

  let lastMoveTime = 0;
  const onPointerMove = event => {
    const now = performance.now();
    if (now - lastMoveTime < 24) return; // Cap mouse tracking to 40 Hz
    lastMoveTime = now;
    locate(event);
    if (!pointer.inside || !settings.mouseInteraction || reduce) return;
    const head = trail[0];
    const gap = head ? Math.hypot(pointer.x - head.x, pointer.y - head.y) : Infinity;
    if (gap < TRAIL_STEP) return;
    if (head && head.age < 0.1) {
      const steps = Math.min(4, Math.floor(gap / (TRAIL_STEP * 2)));
      for (let i = 1; i <= steps; i++) {
        const k = i / (steps + 1);
        trail.unshift({ x: head.x + (pointer.x - head.x) * k, y: head.y + (pointer.y - head.y) * k, age: 0 });
      }
    }
    trail.unshift({ x: pointer.x, y: pointer.y, age: 0 });
    trail.length = Math.min(trail.length, MAX_TRAIL);
    wake();
  };

  const onPointerDown = event => {
    locate(event);
    if (!pointer.inside || !settings.clickEffect || reduce) return;
    clicks.unshift({ x: pointer.x, y: pointer.y, age: 0 });
    if (clicks.length > MAX_CLICKS) clicks.pop();
    wake();
  };

  const onVisibility = () => {
    last = 0;
    wake();
  };

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  resize();
})();


// ==========================================
// Nexren Store - Dock Component (Vanilla JS)
// ==========================================
(function initDock() {
  const SIDES = ['bottom', 'top', 'left', 'right'];
  const EDGE = 12;
  const HOP = 0.4;
  const HOP_TIME = 0.38;
  const HOLD_TIME = 450;
  const TAIL = 9;
  const TAIL_HALF = 9;
  const MENU_RADIUS = 10;
  const MENU_GAP = 8;
  const MARGIN = 8;
  const POP = 'cubic-bezier(0.2, 1.25, 0.4, 1)';

  const THEMES = {
    dark: {
      '--dock-panel': 'rgba(38, 35, 46, 0.66)',
      '--dock-panel-edge': 'rgba(255, 255, 255, 0.08)',
      '--dock-panel-highlight': 'rgba(255, 255, 255, 0.07)',
      '--dock-panel-shadow': '0 22px 44px -20px rgba(0, 0, 0, 0.8), 0 6px 16px -8px rgba(0, 0, 0, 0.5)',
      '--dock-tile': 'linear-gradient(180deg, #3a3644 0%, #27242f 100%)',
      '--dock-tile-edge': 'rgba(255, 255, 255, 0.07)',
      '--dock-tile-highlight': 'rgba(255, 255, 255, 0.12)',
      '--dock-tile-shadow': '0 4px 10px -4px rgba(0, 0, 0, 0.7)',
      '--dock-ink': '#f4f4f5',
      '--dock-label': '#2a2731',
      '--dock-label-ink': '#f4f4f5',
      '--dock-dot': 'rgba(255, 255, 255, 0.72)',
      '--dock-separator': 'rgba(255, 255, 255, 0.12)',
      '--dock-press': 'brightness(0.75)',
      '--dock-menu': 'rgba(40, 37, 47, 0.8)',
      '--dock-menu-edge': 'rgba(255, 255, 255, 0.13)',
      '--dock-menu-ink': '#f4f4f5',
      '--dock-menu-muted': 'rgba(244, 244, 245, 0.42)',
      '--dock-menu-separator': 'rgba(255, 255, 255, 0.1)',
      '--dock-menu-shadow': '0 18px 40px -12px rgba(0, 0, 0, 0.65), 0 3px 10px rgba(0, 0, 0, 0.3)'
    }
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

  const icons = {
    store: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>`,
    apps: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
    contact: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`
  };

  const defaultItems = [
    {
      icon: icons.menu,
      label: 'Menu',
      active: false,
      onClick: () => {
        if (window.NexrenToggleMenu) window.NexrenToggleMenu();
      }
    },
    { separator: true },
    {
      icon: icons.apps,
      label: 'My Apps',
      active: true,
      onClick: () => {
        if (typeof window.NexrenCloseMenu === 'function') window.NexrenCloseMenu();
        if (typeof window.NexrenShowMyApps === 'function') {
          window.NexrenShowMyApps();
        }
      }
    },
    {
      icon: icons.download,
      label: 'Downloads',
      badge: false,
      active: false,
      onClick: () => {
        if (typeof window.NexrenCloseMenu === 'function') window.NexrenCloseMenu();
        if (typeof window.NexrenOnDownloadsClick === 'function') {
          window.NexrenOnDownloadsClick();
        } else {
          console.log('Downloads clicked');
        }
      }
    },
    { separator: true },
    {
      icon: icons.contact,
      label: 'Contact',
      active: false,
      onClick: () => {
        if (typeof window.NexrenCloseMenu === 'function') window.NexrenCloseMenu();
        if (typeof window.NexrenOnContactClick === 'function') {
          window.NexrenOnContactClick();
        } else {
          console.log('Contact clicked');
        }
      }
    }
  ];

  function createDock(container, config = {}) {
    const {
      items = defaultItems,
      position = 'bottom',
      theme = 'dark',
      baseItemSize = 52,
      magnification = 74,
      distance = 200,
      panelHeight = 70,
      gap = 10,
      roundness = 0.5,
      spring = { mass: 0.1, stiffness: 150, damping: 12 },
      bounce = true,
      autoHide = false,
      tiles = true,
      showLabels = true,
      showIndicators = true,
      showBadges = true,
      badgeColor = '#ff453a',
      accentColor = '#0a84ff'
    } = config;

    const side = SIDES.includes(position) ? position : 'bottom';
    const vertical = side === 'left' || side === 'right';
    const rawBase = Math.max(16, baseItemSize);
    const rawPeak = Math.max(rawBase, magnification);
    const rawThickness = Math.max(rawBase, panelHeight);
    const rawGap = Math.max(0, gap);

    const dock = document.createElement('div');
    dock.className = `dock dock--${side}${tiles ? '' : ' dock--bare'}`;
    dock.setAttribute('role', 'toolbar');
    dock.setAttribute('aria-label', 'Dock');
    dock.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');

    const themeTokens = { ...(THEMES[theme] ?? THEMES.dark), '--dock-accent': accentColor, '--dock-badge': badgeColor };
    Object.entries(themeTokens).forEach(([k, v]) => dock.style.setProperty(k, v));

    let fit = 1;
    let base = rawBase * fit;
    let peak = rawPeak * fit;
    let thickness = rawThickness * fit;

    const updateDockStyles = () => {
      base = rawBase * fit;
      peak = rawPeak * fit;
      thickness = rawThickness * fit;
      dock.style.setProperty('--dock-base', `${base}px`);
      dock.style.setProperty('--dock-thickness', `${thickness}px`);
      dock.style.setProperty('--dock-gap', `${rawGap * fit}px`);
      dock.style.setProperty('--dock-pad', `${(thickness - base) / 2}px`);
      dock.style.setProperty('--dock-reach', `${peak - base}px`);
      dock.style.setProperty('--dock-round', clamp(roundness, 0, 1));
    };
    updateDockStyles();

    const itemNodes = [];
    items.forEach((item, index) => {
      if (item.separator) {
        const sep = document.createElement('span');
        sep.className = 'dock-separator';
        sep.setAttribute('aria-hidden', 'true');
        dock.appendChild(sep);
        itemNodes.push(null);
        return;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dock-item${item.className ? ` ${item.className}` : ''}`;
      btn.setAttribute('aria-label', item.label);
      if (item.menu?.length) btn.setAttribute('aria-haspopup', 'menu');

      const tile = document.createElement('span');
      tile.className = 'dock-tile';

      const face = document.createElement('span');
      face.className = 'dock-face';
      face.innerHTML = item.icon || '';
      tile.appendChild(face);

      if (showBadges && item.badge !== undefined && item.badge !== null && item.badge !== false) {
        const badge = document.createElement('span');
        badge.className = 'dock-badge';
        if (item.badge !== true) badge.textContent = item.badge;
        tile.appendChild(badge);
      }

      btn.appendChild(tile);

      if (showIndicators && item.active) {
        const dot = document.createElement('span');
        dot.className = 'dock-dot';
        dot.setAttribute('aria-hidden', 'true');
        btn.appendChild(dot);
      }

      if (showLabels && item.label) {
        const label = document.createElement('span');
        label.className = 'dock-label';
        label.setAttribute('aria-hidden', 'true');
        label.textContent = item.label;
        btn.appendChild(label);
      }

      dock.appendChild(btn);
      itemNodes.push(btn);
    });

    container.appendChild(dock);

    // Dynamic Physics & Magnification Loop
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const motion = new Map();
    const pointer = { x: 0, y: 0, inside: false };
    let focused = -1;
    let held = null;
    let lastFocus = null;
    let lastRest = [];
    let lastBase = base;
    let hidden = false;
    let hideTimer = 0;
    let raf = 0;
    let last = 0;
    let activeMenu = null;

    const entry = index => {
      let state = motion.get(index);
      if (!state) {
        state = {
          size: base,
          velocity: 0,
          lift: 0,
          rise: 0,
          launch: 0,
          gravity: 0,
          hopping: false,
          drawn: '',
          node: null
        };
        motion.set(index, state);
      }
      return state;
    };

    const tick = now => {
      raf = 0;
      const dt = Math.min(1 / 30, Math.max(0.001, (now - last) / 1000));
      last = now;

      if (base !== lastBase) {
        const ratio = base / lastBase;
        motion.forEach(state => {
          state.size *= ratio;
          state.velocity *= ratio;
        });
        lastBase = base;
      }

      const rect = dock.getBoundingClientRect();
      const center = vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
      const spans = items.map(item => (item?.separator ? 1 : base));
      let cursor = -(spans.reduce((sum, span) => sum + span, 0) + (rawGap * fit) * Math.max(0, spans.length - 1)) / 2;
      const rest = spans.map(span => {
        const middle = cursor + span / 2;
        cursor += span + (rawGap * fit);
        return middle;
      });

      let focus = null;
      if (held !== null) focus = held;
      else if (pointer.inside) focus = (vertical ? pointer.y : pointer.x) - center;
      else if (rest[focused] !== undefined) focus = rest[focused];
      lastFocus = focus;
      lastRest = rest;

      const steps = Math.max(1, Math.ceil(dt * 240));
      const h = dt / steps;
      const k = spring.stiffness / spring.mass;
      const c = spring.damping / spring.mass;
      let moving = false;

      items.forEach((item, index) => {
        const node = itemNodes[index];
        if (!node || item?.separator) return;
        const state = entry(index);
        const reach = focus === null ? 1 : Math.abs(focus - rest[index]) / (distance * fit);
        const target = base + (peak - base) * (reach < 1 ? Math.cos((reach * Math.PI) / 2) ** 2 : 0);

        if (reduce) {
          state.size = target;
          state.velocity = 0;
        } else {
          for (let i = 0; i < steps; i++) {
            state.velocity = (state.velocity + h * k * (target - state.size)) / (1 + h * c + h * h * k);
            state.size += state.velocity * h;
            if (!state.hopping) continue;
            state.rise -= state.gravity * h;
            state.lift += state.rise * h;
            if (state.lift > 0) continue;
            state.lift = 0;
            state.rise *= -0.36;
            if (state.rise < state.launch * 0.2) {
              state.rise = 0;
              state.hopping = false;
              node.removeAttribute('data-hop');
            }
          }
        }

        if (Math.abs(state.velocity) < 0.01 && Math.abs(target - state.size) < 0.01) {
          state.size = target;
          state.velocity = 0;
        } else {
          moving = true;
        }
        if (state.hopping) moving = true;

        const size = Math.max(1, state.size);
        const drawn = `${size.toFixed(2)} ${state.lift.toFixed(2)} ${side}`;
        if (drawn === state.drawn && node === state.node) return;
        state.drawn = drawn;
        state.node = node;
        const lift = side === 'bottom' || side === 'right' ? -state.lift : state.lift;
        const tile = node.firstElementChild;
        node.style.width = `${size}px`;
        node.style.height = `${size}px`;
        if (tile) {
          tile.style.transform = `translate(${vertical ? `${lift}px, 0` : `0, ${lift}px`}) scale(${size / base})`;
        }
      });

      if (moving) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const hop = index => {
      const node = itemNodes[index];
      if (reduce || !bounce || !node) return;
      const state = entry(index);
      if (state.hopping) return;
      const height = state.size * HOP;
      state.gravity = (8 * height) / (HOP_TIME * HOP_TIME);
      state.launch = (state.gravity * HOP_TIME) / 2;
      state.rise = state.launch;
      state.hopping = true;
      node.setAttribute('data-hop', '');
      wake();
    };

    // Menu Implementation
    function menuPath(width, height, s, at) {
      const r = MENU_RADIUS;
      const p = (x, y) => `${(x + TAIL).toFixed(2)} ${(y + TAIL).toFixed(2)}`;
      const tail = (x, y, dx, dy, nx, ny) => {
        const q = (u, v) => p(x + dx * u + nx * v, y + dy * u + ny * v);
        return `L ${q(-TAIL_HALF, 0)} L ${q(-TAIL_HALF * 0.18, TAIL * 0.82)} Q ${q(0, TAIL)} ${q(TAIL_HALF * 0.18, TAIL * 0.82)} L ${q(TAIL_HALF, 0)}`;
      };
      return [
        `M ${p(r, 0)}`,
        s === 'top' ? tail(at, 0, 1, 0, 0, -1) : '',
        `L ${p(width - r, 0)} A ${r} ${r} 0 0 1 ${p(width, r)}`,
        s === 'right' ? tail(width, at, 0, 1, 1, 0) : '',
        `L ${p(width, height - r)} A ${r} ${r} 0 0 1 ${p(width - r, height)}`,
        s === 'bottom' ? tail(at, height, -1, 0, 0, 1) : '',
        `L ${p(r, height)} A ${r} ${r} 0 0 1 ${p(0, height - r)}`,
        s === 'left' ? tail(0, at, 0, -1, -1, 0) : '',
        `L ${p(0, r)} A ${r} ${r} 0 0 1 ${p(r, 0)} Z`
      ].join(' ');
    }

    function closeCurrentMenu() {
      if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
        held = null;
        wake();
      }
    }

    function openDockMenu(index) {
      closeCurrentMenu();
      const node = itemNodes[index];
      const item = items[index];
      if (!node || !item?.menu?.length) return;

      held = lastFocus ?? lastRest[index] ?? 0;
      wake();

      const menuWrap = document.createElement('div');
      menuWrap.className = 'dock-menu';
      menuWrap.setAttribute('data-dock-menu', '');
      Object.entries(themeTokens).forEach(([k, v]) => menuWrap.style.setProperty(k, v));

      const shadow = document.createElement('span');
      shadow.className = 'dock-menu-shadow';
      const glass = document.createElement('span');
      glass.className = 'dock-menu-glass';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'dock-menu-shape');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);

      const list = document.createElement('div');
      list.className = 'dock-menu-list';
      list.setAttribute('role', 'menu');
      list.tabIndex = -1;

      const highlight = document.createElement('span');
      highlight.className = 'dock-menu-highlight';
      list.appendChild(highlight);

      item.menu.forEach((row, rIdx) => {
        if (row.separator) {
          const sep = document.createElement('span');
          sep.className = 'dock-menu-separator';
          sep.setAttribute('role', 'separator');
          list.appendChild(sep);
          return;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dock-menu-row';
        btn.setAttribute('role', 'menuitem');
        btn.tabIndex = -1;

        const text = document.createElement('span');
        text.className = 'dock-menu-text';
        text.textContent = row.label;
        btn.appendChild(text);

        btn.addEventListener('pointerenter', () => {
          highlight.style.opacity = '1';
          highlight.style.transform = `translateY(${btn.offsetTop}px)`;
          highlight.style.height = `${btn.offsetHeight}px`;
          btn.setAttribute('data-active', '');
        });

        btn.addEventListener('pointerleave', () => {
          btn.removeAttribute('data-active');
        });

        btn.addEventListener('click', () => {
          closeCurrentMenu();
          row.onClick?.();
        });

        list.appendChild(btn);
      });

      menuWrap.appendChild(shadow);
      menuWrap.appendChild(glass);
      menuWrap.appendChild(svg);
      menuWrap.appendChild(list);
      document.body.appendChild(menuWrap);
      activeMenu = menuWrap;

      // Position menu
      const rect = node.getBoundingClientRect();
      const width = list.offsetWidth;
      const height = list.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const x = rect.left + rect.width / 2;
      const y = rect.top - MENU_GAP;
      const left = clamp(x - width / 2, MARGIN, vw - MARGIN - width);
      const top = y - TAIL - height;
      const at = clamp(x - left, MENU_RADIUS + TAIL_HALF, width - MENU_RADIUS - TAIL_HALF);
      const pD = menuPath(width, height, side, at);

      menuWrap.style.left = `${left}px`;
      menuWrap.style.top = `${top}px`;
      menuWrap.style.transformOrigin = `${at}px ${height + TAIL}px`;
      menuWrap.style.visibility = 'visible';
      glass.style.clipPath = `path('${pD}')`;
      path.setAttribute('d', pD);

      if (!reduce) {
        menuWrap.animate([{ transform: 'scale(0.82)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], {
          duration: 220,
          easing: POP
        });
      }
    }

    // Bind item click / contextmenu events
    items.forEach((item, index) => {
      const node = itemNodes[index];
      if (!node) return;

      node.addEventListener('click', () => {
        hop(index);
        item.onClick?.();
      });

      node.addEventListener('contextmenu', e => {
        if (!item.menu?.length) return;
        e.preventDefault();
        openDockMenu(index);
      });
    });

    document.addEventListener('pointerdown', e => {
      if (activeMenu && !activeMenu.contains(e.target) && !dock.contains(e.target)) {
        closeCurrentMenu();
      }
    });

    dock.addEventListener('pointermove', e => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.inside = true;
      wake();
    });

    dock.addEventListener('pointerleave', () => {
      pointer.inside = false;
      wake();
    });

    const measure = () => {
      const room = (vertical ? window.innerHeight : window.innerWidth) - EDGE * 2;
      const length = items.reduce((sum, item) => sum + (item?.separator ? 1 : rawBase), 0) +
        rawGap * Math.max(0, items.length - 1) + rawThickness - rawBase;
      const next = length > 0 ? Math.min(1, Math.max(0.4, room / length)) : 1;
      fit = Math.round(next * 1000) / 1000;
      updateDockStyles();
      wake();
    };

    window.addEventListener('resize', measure);
    measure();
    wake();
  }

  // Initialize Dock on #dock-container
  const dockContainer = document.getElementById('dock-container');
  if (dockContainer) {
    createDock(dockContainer, {
      position: 'bottom',
      baseItemSize: 52,
      magnification: 74,
      panelHeight: 70,
      gap: 10,
      roundness: 0.5,
      bounce: true
    });
  }
})();


// ====================================================
// Nexren Store - StaggeredMenu Component (Vanilla JS)
// ====================================================
(function initStaggeredMenu() {
  const mount = document.getElementById('staggered-menu-mount');
  if (!mount || typeof gsap === 'undefined') return;

  const config = {
    position: 'right',
    colors: ['#38bdf8', '#818cf8', '#6366f1'],
    accentColor: '#38bdf8',
    menuButtonColor: '#e9e9ef',
    openMenuButtonColor: '#fff',
    displaySocials: false,
    displayItemNumbering: true,
    items: [
      {
        label: 'Apps',
        ariaLabel: 'Open Apps Showcase',
        action: () => {
          closeMenu();
          if (typeof window.NexrenShowMyApps === 'function') window.NexrenShowMyApps();
        }
      },
      {
        label: 'Downloads',
        ariaLabel: 'Open Downloads',
        action: () => {
          closeMenu();
          if (typeof window.NexrenOnDownloadsClick === 'function') window.NexrenOnDownloadsClick();
        }
      },
      {
        label: 'Support',
        ariaLabel: 'Open Support & Contact',
        action: () => {
          closeMenu();
          if (typeof window.NexrenOnContactClick === 'function') window.NexrenOnContactClick();
        }
      },
      {
        label: 'Github',
        ariaLabel: 'Open GitHub Profile',
        action: () => {
          closeMenu();
          window.open('https://github.com/NotShubh28', '_blank');
        }
      }
    ]
  };

  let open = false;
  let busy = false;
  let openTl = null;
  let closeTween = null;
  let spinTween = null;
  let textCycleTween = null;

  // Build HTML DOM
  const wrapper = document.createElement('div');
  wrapper.className = 'staggered-menu-wrapper';
  wrapper.setAttribute('data-position', config.position);
  wrapper.style.setProperty('--sm-accent', config.accentColor);

  // Prelayers
  const preLayersContainer = document.createElement('div');
  preLayersContainer.className = 'sm-prelayers';
  preLayersContainer.setAttribute('aria-hidden', 'true');
  config.colors.forEach(col => {
    const pl = document.createElement('div');
    pl.className = 'sm-prelayer';
    pl.style.background = col;
    preLayersContainer.appendChild(pl);
  });
  wrapper.appendChild(preLayersContainer);

  // Header (Logo + Toggle button)
  const header = document.createElement('header');
  header.className = 'staggered-menu-header';
  header.setAttribute('aria-label', 'Main navigation header');

  const logo = document.createElement('div');
  logo.className = 'sm-logo';
  logo.innerHTML = `
    <div class="sm-logo-icon">▲</div>
    <span>Nexren Store</span>
  `;

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'sm-toggle';
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-label', 'Open menu');
  toggleBtn.setAttribute('aria-expanded', 'false');

  const textWrap = document.createElement('span');
  textWrap.className = 'sm-toggle-textWrap';
  textWrap.setAttribute('aria-hidden', 'true');

  const textInner = document.createElement('span');
  textInner.className = 'sm-toggle-textInner';
  textInner.innerHTML = `<span class="sm-toggle-line">Menu</span>`;
  textWrap.appendChild(textInner);

  const icon = document.createElement('span');
  icon.className = 'sm-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `
    <span class="sm-icon-line"></span>
    <span class="sm-icon-line sm-icon-line-v"></span>
  `;

  toggleBtn.appendChild(textWrap);
  toggleBtn.appendChild(icon);
  header.appendChild(logo);
  header.appendChild(toggleBtn);
  wrapper.appendChild(header);

  // Panel
  const panel = document.createElement('aside');
  panel.className = 'staggered-menu-panel';
  panel.setAttribute('aria-hidden', 'true');

  const panelInner = document.createElement('div');
  panelInner.className = 'sm-panel-inner';

  const list = document.createElement('ul');
  list.className = 'sm-panel-list';
  if (config.displayItemNumbering) list.setAttribute('data-numbering', '');

  config.items.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'sm-panel-itemWrap';
    li.innerHTML = `
      <a class="sm-panel-item" href="javascript:void(0)" aria-label="${item.ariaLabel}">
        <span class="sm-panel-itemLabel">${item.label}</span>
      </a>
    `;
    const link = li.querySelector('.sm-panel-item');
    link.addEventListener('click', e => {
      e.preventDefault();
      item.action?.();
    });
    list.appendChild(li);
  });
  panelInner.appendChild(list);

  if (config.displaySocials && config.socialItems?.length) {
    const socials = document.createElement('div');
    socials.className = 'sm-socials';
    socials.innerHTML = `
      <h3 class="sm-socials-title">Community</h3>
      <ul class="sm-socials-list" role="list">
        ${config.socialItems.map(s => `
          <li class="sm-socials-item">
            <a href="${s.link}" target="_blank" rel="noopener noreferrer" class="sm-socials-link">${s.label}</a>
          </li>
        `).join('')}
      </ul>
    `;
    panelInner.appendChild(socials);
  }

  panel.appendChild(panelInner);
  wrapper.appendChild(panel);
  mount.appendChild(wrapper);

  // Setup GSAP Initial States
  const preLayers = Array.from(preLayersContainer.querySelectorAll('.sm-prelayer'));
  const plusH = icon.querySelector('.sm-icon-line:not(.sm-icon-line-v)');
  const plusV = icon.querySelector('.sm-icon-line-v');
  const offscreen = config.position === 'left' ? -100 : 100;

  gsap.set([panel, ...preLayers], { xPercent: offscreen, opacity: 1 });
  gsap.set(preLayersContainer, { xPercent: 0, opacity: 1 });
  gsap.set(plusH, { transformOrigin: '50% 50%', rotate: 0 });
  gsap.set(plusV, { transformOrigin: '50% 50%', rotate: 90 });
  gsap.set(icon, { rotate: 0, transformOrigin: '50% 50%' });

  // Timeline construction
  function buildOpenTimeline() {
    openTl?.kill();
    closeTween?.kill();

    const itemEls = Array.from(panel.querySelectorAll('.sm-panel-itemLabel'));
    const numberEls = Array.from(panel.querySelectorAll('.sm-panel-list[data-numbering] .sm-panel-item'));
    const socialTitle = panel.querySelector('.sm-socials-title');
    const socialLinks = Array.from(panel.querySelectorAll('.sm-socials-link'));

    if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });
    if (numberEls.length) gsap.set(numberEls, { '--sm-num-opacity': 0 });
    if (socialTitle) gsap.set(socialTitle, { opacity: 0 });
    if (socialLinks.length) gsap.set(socialLinks, { y: 25, opacity: 0 });

    const tl = gsap.timeline({ paused: true });

    preLayers.forEach((layer, i) => {
      tl.fromTo(layer, { xPercent: offscreen }, { xPercent: 0, duration: 0.5, ease: 'power4.out' }, i * 0.07);
    });

    const lastTime = preLayers.length ? (preLayers.length - 1) * 0.07 : 0;
    const panelInsertTime = lastTime + (preLayers.length ? 0.08 : 0);
    const panelDuration = 0.65;

    tl.fromTo(panel, { xPercent: offscreen }, { xPercent: 0, duration: panelDuration, ease: 'power4.out' }, panelInsertTime);

    if (itemEls.length) {
      const itemsStart = panelInsertTime + panelDuration * 0.15;
      tl.to(itemEls, {
        yPercent: 0,
        rotate: 0,
        duration: 0.9,
        ease: 'power4.out',
        stagger: { each: 0.08, from: 'start' }
      }, itemsStart);

      if (numberEls.length) {
        tl.to(numberEls, {
          duration: 0.6,
          ease: 'power2.out',
          '--sm-num-opacity': 1,
          stagger: { each: 0.08, from: 'start' }
        }, itemsStart + 0.1);
      }
    }

    if (socialTitle || socialLinks.length) {
      const socialsStart = panelInsertTime + panelDuration * 0.4;
      if (socialTitle) tl.to(socialTitle, { opacity: 1, duration: 0.5, ease: 'power2.out' }, socialsStart);
      if (socialLinks.length) {
        tl.to(socialLinks, {
          y: 0,
          opacity: 1,
          duration: 0.55,
          ease: 'power3.out',
          stagger: { each: 0.08, from: 'start' }
        }, socialsStart + 0.04);
      }
    }

    openTl = tl;
    return tl;
  }

  function animateIcon(opening) {
    spinTween?.kill();
    spinTween = gsap.to(icon, {
      rotate: opening ? 225 : 0,
      duration: opening ? 0.75 : 0.35,
      ease: opening ? 'power4.out' : 'power3.inOut'
    });
  }

  function animateText(opening) {
    textCycleTween?.kill();
    const currentLabel = opening ? 'Menu' : 'Close';
    const targetLabel = opening ? 'Close' : 'Menu';
    const seq = [currentLabel, targetLabel, currentLabel, targetLabel];

    textInner.innerHTML = seq.map(line => `<span class="sm-toggle-line">${line}</span>`).join('');
    gsap.set(textInner, { yPercent: 0 });

    const finalShift = ((seq.length - 1) / seq.length) * 100;
    textCycleTween = gsap.to(textInner, {
      yPercent: -finalShift,
      duration: 0.55,
      ease: 'power4.out'
    });
  }

  function playOpen() {
    if (busy) return;
    busy = true;
    panel.setAttribute('aria-hidden', 'false');
    const tl = buildOpenTimeline();
    tl.eventCallback('onComplete', () => { busy = false; });
    tl.play(0);
  }

  function playClose() {
    openTl?.kill();
    const all = [...preLayers, panel];
    closeTween?.kill();

    closeTween = gsap.to(all, {
      xPercent: offscreen,
      duration: 0.32,
      ease: 'power3.in',
      overwrite: 'auto',
      onComplete: () => {
        panel.setAttribute('aria-hidden', 'true');
        busy = false;
      }
    });
  }

  function closeMenu() {
    if (!open) return;
    open = false;
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-label', 'Open menu');
    wrapper.removeAttribute('data-open');
    playClose();
    animateIcon(false);
    animateText(false);
  }

  function openMenu() {
    if (open) return;
    open = true;
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.setAttribute('aria-label', 'Close menu');
    wrapper.setAttribute('data-open', '');
    playOpen();
    animateIcon(true);
    animateText(true);
  }

  function toggleMenu() {
    if (open) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  // Expose toggle and close globally for dock shortcuts
  window.NexrenToggleMenu = toggleMenu;
  window.NexrenCloseMenu = closeMenu;

  toggleBtn.addEventListener('click', toggleMenu);

  document.addEventListener('mousedown', e => {
    if (!open) return;
    if (!panel.contains(e.target) && !toggleBtn.contains(e.target)) {
      closeMenu();
    }
  });

  // Close menu if opened whenever user clicks anywhere on the dock
  const dockContainer = document.getElementById('dock-container');
  dockContainer?.addEventListener('click', e => {
    const isMenuToggle = e.target.closest('.dock-item[aria-label="Menu"]');
    if (!isMenuToggle && open) {
      closeMenu();
    }
  }, true);
})();


// ====================================================
// Nexren Store - SpotlightCard Component (Vanilla JS)
// ====================================================
(function initSpotlightCard() {
  const root = document.getElementById('contact-spotlight-card');
  const modal = document.getElementById('contact-modal');
  const closeBtn = document.getElementById('contact-close-btn');
  const backdrop = modal?.querySelector('.contact-modal-backdrop');
  if (!root || !modal) return;

  const light = root.querySelector('.spotlight-card__light');
  const edge = root.querySelector('.spotlight-card__edge');
  const noise = root.querySelector('.spotlight-card__grain');
  if (!light || !edge || !noise) return;

  const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
  noise.style.backgroundImage = NOISE;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const falloff = (color, softness) => {
    const soft = clamp(softness, 0, 1);
    const core = (1 - soft) ** 1.5 * 0.85;
    const stop = (alpha, at) => `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(2)}%, transparent) ${(at * 100).toFixed(2)}%`;
    const list = [stop(1, 0)];
    for (let i = 0; i <= 14; i++) {
      const t = core + ((1 - core) * i) / 14;
      const g = (t - core) / (1 - core);
      const smooth = 1 - g * g * (3 - 2 * g);
      const glow = Math.exp(-4.6 * g * g) * (1 - g ** 6);
      list.push(stop(smooth + (glow - smooth) * soft, t));
    }
    return list.join(', ');
  };

  const color = '#ffffff';
  const settings = {
    shape: 'circle',
    fill: falloff(color, 0.7),
    edge: falloff(color, 1),
    size: 240,
    intensity: 0.15,
    borderGlow: 0.6,
    proximity: 80,
    smoothing: 0.3,
    ambient: false,
    flare: true,
    grain: 0
  };

  const state = { x: 0, y: 0, presence: 0, flare: 0, time: Math.random() * 60, pressed: false, visible: true };
  const pointer = { x: 0, y: 0, active: false };
  const drawn = { light: '', edge: '', noise: '' };
  let raf = 0;
  let last = 0;

  const gradient = (s, size, x, y, stops) => {
    return `radial-gradient(circle ${size.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px, ${stops})`;
  };

  const paint = s => {
    const size = s.size * (1 + 0.2 * state.flare);
    const boost = 1 + 0.7 * state.flare;
    const fill = gradient(s, size, state.x, state.y, s.fill);
    const rim = gradient(s, size * 0.6, state.x, state.y, s.edge);
    if (fill !== drawn.light) {
      drawn.light = fill;
      light.style.background = fill;
    }
    if (rim !== drawn.edge) {
      drawn.edge = rim;
      edge.style.background = rim;
    }
    light.style.opacity = String(Math.min(1, state.presence * s.intensity * boost));
    edge.style.opacity = String(Math.min(1, state.presence * s.borderGlow * boost));

    const grainy = s.grain > 0 ? gradient(s, size, state.x, state.y, '#000 0%, transparent 100%') : 'none';
    if (grainy !== drawn.noise) {
      drawn.noise = grainy;
      noise.style.webkitMaskImage = grainy;
      noise.style.maskImage = grainy;
    }
    noise.style.opacity = String(state.presence * s.grain);
  };

  const tick = now => {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const rect = root.getBoundingClientRect();
    let tx = state.x;
    let ty = state.y;
    let target = 0;

    if (pointer.active) {
      tx = pointer.x - rect.left;
      ty = pointer.y - rect.top;
      const gap = Math.hypot(Math.max(0, -tx, tx - rect.width), Math.max(0, -ty, ty - rect.height));
      if (gap === 0) target = 1;
      else if (settings.proximity > 0) target = Math.max(0, 1 - gap / settings.proximity) ** 2;
    }

    if (target < 0.6 && settings.ambient && state.visible) {
      state.time += dt;
      const drift = 0.6 - target;
      tx += (rect.width * (0.5 + 0.34 * Math.sin(state.time * 0.43)) - tx) * (drift / 0.6);
      ty += (rect.height * (0.5 + 0.3 * Math.sin(state.time * 0.61 + 1.3)) - ty) * (drift / 0.6);
      target = 0.6;
    }

    if (state.presence < 0.02 && target > 0 && !settings.ambient) {
      state.x = tx;
      state.y = ty;
    }

    const follow = 1 - Math.exp(-dt / (0.015 + settings.smoothing * 0.22));
    state.x += (tx - state.x) * follow;
    state.y += (ty - state.y) * follow;
    const fade = 1 - Math.exp(-dt / (target > state.presence ? 0.1 : 0.32));
    state.presence += (target - state.presence) * fade;
    if (Math.abs(target - state.presence) < 0.002) state.presence = target;

    const press = state.pressed && settings.flare ? 1 : 0;
    state.flare += (press - state.flare) * (1 - Math.exp(-dt / (press ? 0.05 : 0.28)));
    if (Math.abs(press - state.flare) < 0.002) state.flare = press;

    paint(settings);

    const moving = Math.abs(tx - state.x) > 0.1 || Math.abs(ty - state.y) > 0.1;
    const settled = !moving && state.presence === target && state.flare === press;
    if (!settled || (settings.ambient && state.visible)) raf = requestAnimationFrame(tick);
  };

  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  window.addEventListener('pointermove', e => {
    if (!modal.hasAttribute('data-open')) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    wake();
  }, { passive: true });

  root.addEventListener('pointerdown', () => {
    state.pressed = true;
    wake();
  });

  window.addEventListener('pointerup', () => {
    state.pressed = false;
    wake();
  });

  // Modal Open / Close Logic
  function openContactModal() {
    modal.setAttribute('data-open', '');
    modal.setAttribute('aria-hidden', 'false');
    state.visible = true;
    wake();
  }

  function closeContactModal() {
    modal.removeAttribute('data-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  // Hook into Dock's Contact click
  window.NexrenOnContactClick = openContactModal;

  const supportBtn = root.querySelector('.sc-touch-btn') || document.getElementById('contact-support-btn');
  supportBtn?.addEventListener('click', () => {
    window.open('https://github.com/NotShubh28', '_blank');
  });

  closeBtn?.addEventListener('click', closeContactModal);
  backdrop?.addEventListener('click', closeContactModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.hasAttribute('data-open')) {
      closeContactModal();
    }
  });
})();


// ====================================================
// Nexren Store - BounceCards Component & Apps Manager
// ====================================================
(function initBounceCardsShowcase() {
  const mount = document.getElementById('bounce-cards-mount');
  const modal = document.getElementById('app-detail-modal');
  const modalClose = document.getElementById('app-modal-close');
  const modalBackdrop = modal?.querySelector('.app-modal-backdrop');
  if (!mount || !modal) return;

  // User Apps data for BounceCards: Nexren (front & center), StreaX (left), and Arc (right)
  const demoApps = [
    {
      key: 'nexren',
      name: 'Nexren',
      category: 'Running & GPS Tracker',
      author: 'by Shobhit Pandey',
      version: 'v1.0.0',
      size: '34 MB',
      downloads: '38.5k',
      downloads_raw: 38500,
      preview: true,
      apk_link: 'https://github.com/NotShubh28/nexren/releases/download/v1.0.0/nexren.apk',
      img: 'nexren-icon.png',
      desc: 'Precision GPS running companion built for speed, tracking real-time route telemetry and performance milestones.',
      screenshots: [
        { image: 'nexren-screen-1.jpg', alt: 'Nexren Outdoor Run & Weekly Goal' },
        { image: 'nexren-screen-2.jpg', alt: 'Nexren Live Route GPS Tracking' }
      ]
    },
    {
      key: 'streax',
      name: 'StreaX',
      category: 'Habit & Daily Tracker',
      author: 'by Shobhit Pandey',
      version: 'v1.4.0',
      size: '28 MB',
      downloads: '14.2k',
      downloads_raw: 14200,
      preview: false,
      apk_link: '',
      img: 'streax.jpg',
      desc: 'A daily habit counter designed with an energetic fire-theme streak system. Keep your momentum alive, build unstoppable daily discipline, and track your streaks with dynamic flame animations.',
      screenshots: [
        { image: 'streax.jpg', alt: 'StreaX Habit Streaks' },
        { image: 'mountain.jpg', alt: 'Consistency Milestones' }
      ]
    },
    {
      key: 'arc',
      name: 'Arc',
      category: 'Study & Productivity',
      author: 'by Shobhit Pandey',
      version: 'v2.1.0',
      size: '42 MB',
      downloads: '26.8k',
      downloads_raw: 26800,
      preview: false,
      apk_link: '',
      img: 'arc.jpg',
      desc: 'Minimalist Pomodoro self-study workstation and task tracker. Features collaborative study groups, deep-focus timers, and competitive leaderboard rankings to stay accountable together.',
      screenshots: [
        { image: 'arc.jpg', alt: 'Arc Pomodoro Station' },
        { image: 'mountain.jpg', alt: 'Focus Workstation' }
      ]
    }
  ];

  const PATTERN = [-0.8, 0, 0.8];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function createBounceCards(container, options = {}) {
    const {
      images = [],
      rotation = 8,
      arc = 10,
      animationDelay = 0.3,
      animationStagger = 0.08,
      bounciness = 0.65,
      borderColor = '#1e293b',
      shadow = true,
      onCardClick,
      onActiveChange
    } = options;

    function getResponsiveConfig() {
      const w = window.innerWidth;
      if (w < 400) {
        // Small Mobile
        return {
          cardSize: 120,
          spread: 58,
          pushDistance: 44,
          containerWidth: Math.min(w - 20, 280),
          containerHeight: 155,
          radius: 16,
          borderWidth: 2.5,
          hoverScale: 1.06
        };
      } else if (w < 600) {
        // Standard Mobile
        return {
          cardSize: 135,
          spread: 66,
          pushDistance: 50,
          containerWidth: Math.min(w - 28, 320),
          containerHeight: 170,
          radius: 18,
          borderWidth: 3,
          hoverScale: 1.07
        };
      } else if (w < 900) {
        // Tablet
        return {
          cardSize: 155,
          spread: 82,
          pushDistance: 75,
          containerWidth: 380,
          containerHeight: 200,
          radius: 20,
          borderWidth: 3,
          hoverScale: 1.08
        };
      } else {
        // Desktop (refined down from old 230 to 180)
        return {
          cardSize: 180,
          spread: 105,
          pushDistance: 105,
          containerWidth: 460,
          containerHeight: 235,
          radius: 22,
          borderWidth: 3.5,
          hoverScale: 1.08
        };
      }
    }

    let currentConfig = getResponsiveConfig();

    const root = document.createElement('div');
    root.className = 'bounce-cards';

    const applyResponsiveStyles = () => {
      root.style.width = `${currentConfig.containerWidth}px`;
      root.style.height = `${currentConfig.containerHeight}px`;
      root.style.setProperty('--bounce-cards-size', `${currentConfig.cardSize}px`);
      root.style.setProperty('--bounce-cards-border', `${currentConfig.borderWidth}px`);
      root.style.setProperty('--bounce-cards-border-color', borderColor);
      root.style.setProperty('--bounce-cards-radius', `${currentConfig.radius}px`);
    };
    applyResponsiveStyles();

    root.style.setProperty(
      '--bounce-cards-shadow',
      shadow ? '0 10px 30px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)' : 'none'
    );
    root.style.setProperty(
      '--bounce-cards-shadow-active',
      shadow ? '0 25px 50px -12px rgba(56, 189, 248, 0.38), 0 0 0 2px #38bdf8' : 'none'
    );

    const count = images.length;
    const middle = (count - 1) / 2;
    const reach = Math.max(1, middle);

    function computeSlots(cfg) {
      const { spread } = cfg;
      return images.map((_, i) => {
        // 3 Apps fan layout: index 0 (Nexren) front & center, index 1 (StreaX) left, index 2 (Arc) right
        if (count === 3) {
          if (i === 0) return { x: 0, y: 0, rotate: 0 };
          if (i === 1) return { x: -spread, y: arc, rotate: -rotation };
          if (i === 2) return { x: spread, y: arc, rotate: rotation };
        }
        const offset = i - middle;
        return {
          x: offset * spread,
          y: arc * (offset / reach) ** 2,
          rotate: rotation * PATTERN[i % PATTERN.length]
        };
      });
    }

    let slots = computeSlots(currentConfig);

    const cardElements = [];
    images.forEach((app, i) => {
      const card = document.createElement('div');
      card.className = 'bounce-cards__card bounce-cards__card--clickable';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${app.name} - ${app.category}`);
      // Nexren (index 0) has highest resting z-index so it's always in front
      const restingZ = i === 0 ? 10 : (i === 1 ? 5 : 4);
      card.style.zIndex = String(restingZ);

      const img = document.createElement('img');
      img.src = app.img;
      img.alt = app.name;
      img.draggable = false;
      card.appendChild(img);

      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (state.hovered !== i) {
            setActive(i);
          } else {
            onCardClick?.(i);
          }
        }
      });

      root.appendChild(card);
      cardElements.push(card);
    });

    container.appendChild(root);

    // Indicators / Dots for Carousel Navigation
    const indicators = document.createElement('div');
    indicators.className = 'bounce-cards-indicators';
    indicators.setAttribute('role', 'tablist');
    indicators.setAttribute('aria-label', 'Apps showcase navigation');

    // Physical left-to-right order: 1 (StreaX), 0 (Nexren), 2 (Arc)
    const dotOrder = [1, 0, 2];
    const dotElements = [];

    dotOrder.forEach(appIdx => {
      const app = images[appIdx];
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'bounce-cards-dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Select ${app?.name || 'app'}`);
      dot.addEventListener('click', e => {
        e.stopPropagation();
        setActive(appIdx);
        if (bodies[appIdx]) bodies[appIdx].vs -= 2.0;
        wake();
      });
      indicators.appendChild(dot);
      dotElements.push({ appIdx, dot });
    });

    container.appendChild(indicators);

    function updateIndicators(activeIdx) {
      dotElements.forEach(({ appIdx, dot }) => {
        const isActive = (activeIdx === appIdx) || (activeIdx === -1 && appIdx === 0);
        dot.classList.toggle('bounce-cards-dot--active', isActive);
        dot.setAttribute('aria-selected', String(isActive));
      });
    }
    updateIndicators(-1);

    // Physics Engine matching React Bits component
    const bodies = [];
    const state = { hovered: -1, time: 0, layer: -1 };
    let raf = 0;
    let last = performance.now();
    let alive = true;

    const body = i => {
      if (!bodies[i]) {
        const slot = slots[i] ?? { x: 0, y: 0, rotate: 0 };
        bodies[i] = {
          x: slot.x,
          y: slot.y,
          rotate: slot.rotate,
          scale: 0,
          vx: 0,
          vy: 0,
          vr: 0,
          vs: 0,
          born: state.time
        };
      }
      return bodies[i];
    };

    const step = (value, velocity, target, stiffness, damping, dt) => {
      const next = velocity + ((target - value) * stiffness - velocity * damping) * dt;
      return [value + next * dt, next];
    };

    const frame = now => {
      raf = 0;
      if (!alive) return;
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      state.time += dt;

      const hovered = state.hovered;
      const popStiffness = 170;
      const popDamping = 2 * (1 - 0.85 * bounciness) * Math.sqrt(popStiffness);
      const moveStiffness = 210;
      const moveDamping = 2 * 0.72 * Math.sqrt(moveStiffness);
      const substeps = Math.ceil(dt / (1 / 240));
      const h = dt / substeps;
      let moving = 0;

      for (let i = 0; i < slots.length; i++) {
        const el = cardElements[i];
        if (!el) continue;
        const card = body(i);
        const slot = slots[i];
        const appeared = state.time - card.born >= animationDelay + i * animationStagger;

        let targetX = slot.x;
        let targetY = slot.y;
        let targetRotate = slot.rotate;
        let targetScale = appeared ? 1 : 0;

        if (hovered >= 0 && appeared) {
          if (i === hovered) {
            targetY = slot.y - currentConfig.cardSize * 0.05;
            targetRotate = 0;
            targetScale = currentConfig.hoverScale;
          } else {
            const dir = slot.x !== slots[hovered].x
              ? Math.sign(slot.x - slots[hovered].x)
              : (i > hovered ? 1 : -1);
            targetX = slot.x + dir * currentConfig.pushDistance;
          }
        }

        for (let k = 0; k < substeps; k++) {
          [card.x, card.vx] = step(card.x, card.vx, targetX, moveStiffness, moveDamping, h);
          [card.y, card.vy] = step(card.y, card.vy, targetY, moveStiffness, moveDamping, h);
          [card.rotate, card.vr] = step(card.rotate, card.vr, targetRotate, moveStiffness, moveDamping, h);
          [card.scale, card.vs] = step(card.scale, card.vs, targetScale, popStiffness, popDamping, h);
        }

        moving +=
          Math.abs(card.vx) +
          Math.abs(card.vy) +
          Math.abs(card.vr) +
          Math.abs(card.vs) * 100 +
          Math.abs(targetX - card.x) +
          Math.abs(targetY - card.y) +
          Math.abs(targetRotate - card.rotate) +
          Math.abs(targetScale - card.scale) * 100 +
          (appeared ? 0 : 1);

        el.style.transform = `translate(-50%, -50%) translate3d(${card.x.toFixed(2)}px, ${card.y.toFixed(2)}px, 0) rotate(${card.rotate.toFixed(3)}deg) scale(${Math.max(0, card.scale).toFixed(4)})`;
      }

      if (state.layer !== hovered) {
        state.layer = hovered;
        cardElements.forEach((el, i) => {
          if (!el) return;
          const restingZ = i === 0 ? 10 : (i === 1 ? 5 : 4);
          el.style.zIndex = i === hovered ? '20' : String(restingZ);
          el.toggleAttribute('data-active', i === hovered);
        });
      }

      if (moving > 0.02) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const setActive = (nextIndex, triggerCallback = true) => {
      if (state.hovered === nextIndex) return;
      state.hovered = nextIndex;
      updateIndicators(nextIndex);
      if (triggerCallback) {
        onActiveChange?.(nextIndex);
      }
      wake();
    };

    const pick = event => {
      const cardEl = event.target?.closest?.('.bounce-cards__card');
      if (cardEl) {
        const found = cardElements.indexOf(cardEl);
        if (found >= 0) return found;
      }

      const rect = root.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      let best = -1;
      let distance = Infinity;

      slots.forEach((slot, i) => {
        const cardX = bodies[i]?.x ?? slot.x;
        const cardY = bodies[i]?.y ?? slot.y;
        const gap = Math.hypot(px - cardX, py - cardY);
        if (gap < distance) {
          distance = gap;
          best = i;
        }
      });

      if (best < 0) return -1;
      const half = currentConfig.cardSize / 2;
      if (distance > half + 24) return -1;
      return best;
    };

    const isHoverDevice = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let lastTouchTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isSwiping = false;

    root.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || !isHoverDevice()) return;
      const next = pick(e);
      if (next !== state.hovered) {
        setActive(next);
      }
    });

    root.addEventListener('pointerleave', e => {
      if (e.pointerType === 'touch' || !isHoverDevice()) return;
      if (state.hovered !== -1) {
        setActive(-1);
      }
    });

    // Touch Swipe Support
    root.addEventListener('touchstart', e => {
      lastTouchTime = performance.now();
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = performance.now();
      isSwiping = false;
    }, { passive: true });

    root.addEventListener('touchmove', e => {
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
        isSwiping = true;
      }
    }, { passive: true });

    root.addEventListener('touchend', e => {
      lastTouchTime = performance.now();
      if (!isSwiping) return;

      const touchEndX = e.changedTouches[0]?.clientX ?? touchStartX;
      const dx = touchEndX - touchStartX;
      const dt = performance.now() - touchStartTime;

      if (Math.abs(dx) > 28 && dt < 450) {
        const order = [1, 0, 2];
        const currentIdx = state.hovered >= 0 ? state.hovered : 0;
        let currentPos = order.indexOf(currentIdx);
        if (currentPos < 0) currentPos = 1;

        if (dx < 0) {
          const nextPos = Math.min(order.length - 1, currentPos + 1);
          const nextIdx = order[nextPos];
          setActive(nextIdx);
          if (bodies[nextIdx]) bodies[nextIdx].vs -= 2.0;
        } else {
          const prevPos = Math.max(0, currentPos - 1);
          const prevIdx = order[prevPos];
          setActive(prevIdx);
          if (bodies[prevIdx]) bodies[prevIdx].vs -= 2.0;
        }
      }
      setTimeout(() => { isSwiping = false; }, 50);
    }, { passive: true });

    // Click / Tap Handling
    root.addEventListener('click', e => {
      if (isSwiping) {
        isSwiping = false;
        return;
      }

      const isTouch = (performance.now() - lastTouchTime < 600) ||
                      e.pointerType === 'touch' ||
                      !isHoverDevice();

      const index = pick(e);
      if (index < 0) {
        if (isTouch && state.hovered !== -1) {
          setActive(-1);
        }
        return;
      }

      const card = bodies[index];
      if (card) card.vs -= 2.2;
      wake();

      if (isTouch) {
        // Mobile Touch interaction:
        // First tap brings card into focus/active preview
        // Second tap on the already focused card opens details modal
        if (state.hovered !== index) {
          setActive(index);
          return;
        }
        onCardClick?.(index);
      } else {
        // Desktop with cursor: direct click opens details
        onCardClick?.(index);
      }
    });

    // Window Resize Handler
    let resizeTimer = 0;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        currentConfig = getResponsiveConfig();
        slots = computeSlots(currentConfig);
        applyResponsiveStyles();
        wake();
      }, 100);
    };
    window.addEventListener('resize', handleResize);

    wake();
    return {
      wake,
      setActive,
      resetAnimation: () => {
        state.time = 0;
        bodies.forEach(b => { b.scale = 0; b.born = 0; });
        wake();
      },
      destroy: () => {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', handleResize);
        container.innerHTML = '';
      }
    };
  }

  // App Modal Presentation
  let installedApps = new Set();
  let currentActiveAppIndex = 0;
  const modalInstallMount = document.getElementById('modal-install-btn-mount');
  let modalSpecularBtn = null;

  function updateModalInstallButtonState() {
    if (!modalSpecularBtn) return;
    const isInstalled = installedApps.has(currentActiveAppIndex);
    const labelSpan = modalSpecularBtn.button.querySelector('.specular-button__label');
    if (!labelSpan) return;

    if (isInstalled) {
      modalSpecularBtn.button.classList.add('installed');
      labelSpan.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.4" width="18" height="18" style="vertical-align: middle;">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>Installed</span>
      `;
    } else {
      modalSpecularBtn.button.classList.remove('installed');
      labelSpan.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18" style="vertical-align: middle;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" x2="12" y1="15" y2="3"/>
        </svg>
        <span>Install App</span>
      `;
    }
  }

  // ========================================================
  // Firebase Realtime Database Integration
  // ========================================================
  const FIREBASE_RTDB_BASE = 'https://nexren-5f350-default-rtdb.firebaseio.com';

  function formatDownloads(count) {
    if (typeof count === 'string') {
      if (/^[0-9]+(\.[0-9]+)?[kKmM]$/.test(count)) return count;
      const parsed = parseFloat(count);
      if (isNaN(parsed)) return count;
      count = parsed;
    }
    if (typeof count !== 'number' || isNaN(count)) return '0';
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return count.toLocaleString();
  }

  function applyFirebaseAppData(key, data) {
    if (!data) return;
    const app = demoApps.find(a => (a.key || a.name.toLowerCase()) === key.toLowerCase());
    if (!app) return;

    if (data.size) app.size = data.size;
    const link = data.apk_link ?? data.apkLink ?? data.download_url ?? data.apkUrl;
    if (link !== undefined) app.apk_link = link;
    if (data.version) app.version = data.version;
    if (data.downloads !== undefined) {
      app.downloads_raw = Number(data.downloads) || 0;
      app.downloads = formatDownloads(app.downloads_raw);
    }
    if (data.preview !== undefined) {
      app.preview = Boolean(data.preview);
    }

    // Live update open app modal
    if (modal?.hasAttribute('data-open') && currentActiveAppIndex === demoApps.indexOf(app)) {
      const sizeEl = document.getElementById('modal-app-size');
      if (sizeEl) sizeEl.textContent = app.size;
      const dlEl = document.getElementById('modal-app-downloads');
      if (dlEl) dlEl.textContent = app.downloads;
      const verEl = document.getElementById('modal-app-version');
      if (verEl) verEl.textContent = app.version;
      const previewWrapper = document.getElementById('modal-preview-wrapper');
      if (previewWrapper) {
        previewWrapper.style.display = app.preview === true ? 'block' : 'none';
      }
    }
  }

  async function fetchFirebaseApps() {
    try {
      const res = await fetch(`${FIREBASE_RTDB_BASE}/apps.json`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(k => applyFirebaseAppData(k, data[k]));
      }
    } catch (err) {
      console.warn('Firebase RTDB initial fetch warning:', err);
    }
  }

  function initFirebaseRealtimeStream() {
    if (typeof EventSource === 'undefined') return;
    try {
      const es = new EventSource(`${FIREBASE_RTDB_BASE}/apps.json`);
      es.addEventListener('put', e => {
        try {
          const payload = JSON.parse(e.data);
          if (!payload) return;
          const { path, data } = payload;
          if (path === '/' && data) {
            Object.keys(data).forEach(k => applyFirebaseAppData(k, data[k]));
          } else if (path && path !== '/') {
            const parts = path.replace(/^\//, '').split('/');
            const appKey = parts[0];
            if (parts.length === 1 && data) {
              applyFirebaseAppData(appKey, data);
            } else if (parts.length === 2 && data !== undefined) {
              applyFirebaseAppData(appKey, { [parts[1]]: data });
            }
          }
        } catch (err) {
          console.warn('Firebase SSE parse error:', err);
        }
      });
      es.addEventListener('patch', e => {
        try {
          const payload = JSON.parse(e.data);
          if (!payload) return;
          const { path, data } = payload;
          const appKey = path.replace(/^\//, '').split('/')[0];
          if (appKey && data) applyFirebaseAppData(appKey, data);
        } catch (err) {
          console.warn('Firebase SSE patch error:', err);
        }
      });
    } catch (err) {
      console.warn('Firebase EventSource error:', err);
    }
  }

  async function incrementAppDownload(appKey) {
    const app = demoApps.find(a => (a.key || a.name.toLowerCase()) === appKey.toLowerCase());
    if (!app) return;

    // 1. Optimistic local increment
    const current = typeof app.downloads_raw === 'number'
      ? app.downloads_raw
      : (parseInt(String(app.downloads).replace(/[^0-9]/g, '')) || 0);
    const nextVal = current + 1;
    app.downloads_raw = nextVal;
    app.downloads = formatDownloads(nextVal);

    const dlEl = document.getElementById('modal-app-downloads');
    if (dlEl && currentActiveAppIndex === demoApps.indexOf(app)) {
      dlEl.textContent = app.downloads;
    }

    // 2. Trigger APK download if link is provided
    if (app.apk_link && typeof app.apk_link === 'string' && app.apk_link.trim().length > 0) {
      const a = document.createElement('a');
      a.href = app.apk_link;
      a.setAttribute('download', `${app.name}.apk`);
      a.setAttribute('target', '_blank');
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // 3. Atomically persist to Firebase RTDB
    try {
      const getRes = await fetch(`${FIREBASE_RTDB_BASE}/apps/${appKey}/downloads.json`);
      const val = await getRes.json();
      const liveCount = (typeof val === 'number' ? val : (Number(val) || nextVal - 1)) + 1;
      await fetch(`${FIREBASE_RTDB_BASE}/apps/${appKey}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloads: liveCount })
      });
      app.downloads_raw = liveCount;
      app.downloads = formatDownloads(liveCount);
      if (dlEl && currentActiveAppIndex === demoApps.indexOf(app)) {
        dlEl.textContent = app.downloads;
      }
    } catch (err) {
      console.warn('Failed to increment download count in Firebase:', err);
    }
  }

  // Start initial Firebase sync and real-time SSE stream
  fetchFirebaseApps();
  initFirebaseRealtimeStream();

  function handleModalInstallClick() {
    if (!installedApps.has(currentActiveAppIndex)) {
      const app = demoApps[currentActiveAppIndex];
      const labelSpan = modalSpecularBtn?.button.querySelector('.specular-button__label');
      if (labelSpan) {
        labelSpan.innerHTML = `
          <svg class="install-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18" style="vertical-align: middle;">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <span>Downloading...</span>
        `;
      }

      // Live increment in Firebase RTDB and initiate APK download
      incrementAppDownload(app.key || app.name.toLowerCase());

      setTimeout(() => {
        installedApps.add(currentActiveAppIndex);
        updateModalInstallButtonState();
        if (typeof renderDownloadsView === 'function') {
          renderDownloadsView();
        }
        if (typeof updateDownloadsDockBadge === 'function') {
          updateDownloadsDockBadge();
        }
      }, 700);
    } else {
      const app = demoApps[currentActiveAppIndex];
      if (app.apk_link && typeof app.apk_link === 'string' && app.apk_link.trim().length > 0) {
        window.open(app.apk_link, '_blank');
      } else {
        alert(`Launching ${app.name}...`);
      }
    }
  }

  if (modalInstallMount && typeof window.createSpecularButton === 'function') {
    modalSpecularBtn = window.createSpecularButton(modalInstallMount, {
      label: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18" style="vertical-align: middle;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" x2="12" y1="15" y2="3"/>
        </svg>
        <span>Install App</span>
      `,
      size: 'lg',
      radius: 16,
      tint: '#ffffff',
      tintOpacity: 0.05,
      blur: 10,
      textColor: '#f5f5f5',
      lineColor: '#ffffff',
      baseColor: '#525252',
      intensity: 1,
      idleIntensity: 0.35,
      shineSize: 10,
      shineFade: 34,
      thickness: 1.2,
      glow: 1,
      followMouse: true,
      proximity: 250,
      className: 'modal-specular-install-btn',
      onClick: handleModalInstallClick
    });
  }

  // Modal DepthCarousel reference (lazily initialized on first modal open)
  let modalDepthCarousel = null;

  function getOrInitModalCarousel(app) {
    if (modalDepthCarousel) return modalDepthCarousel;
    const modalCarouselMount = document.getElementById('modal-carousel-mount');
    if (!modalCarouselMount || typeof window.createDepthCarousel !== 'function') return null;
    try {
      const initialScreenshots = app && app.screenshots && app.screenshots.length > 0
        ? app.screenshots
        : (demoApps[0].screenshots || []);

      modalDepthCarousel = window.createDepthCarousel(modalCarouselMount, {
        items: initialScreenshots,
        cardWidth: 175,
        cardHeight: 340,
        radius: 16,
        depth: 140,
        spread: 60,
        tilt: 20,
        tiltDirection: 'right',
        perspective: 1100,
        visibleCards: 3,
        falloff: 0.22,
        blur: 4,
        duration: 600,
        ease: 'power3.out',
        autoplay: false,
        loop: true,
        showControls: true,
        showIndicators: true
      });
      return modalDepthCarousel;
    } catch (err) {
      console.warn('Modal DepthCarousel init notice:', err);
      return null;
    }
  }

  function showAppDetails(index) {
    const app = demoApps[index];
    if (!app) return;
    currentActiveAppIndex = index;

    const miniIcon = document.getElementById('modal-app-mini-icon');
    if (miniIcon) miniIcon.src = app.img;
    const bannerImg = document.getElementById('modal-app-img');
    if (bannerImg) bannerImg.src = app.img;
    const catEl = document.getElementById('modal-app-category');
    if (catEl) catEl.textContent = app.category;
    const nameEl = document.getElementById('modal-app-name');
    if (nameEl) nameEl.textContent = app.name;
    const authorEl = document.getElementById('modal-app-author');
    if (authorEl) authorEl.textContent = app.author;
    const descEl = document.getElementById('modal-app-desc');
    if (descEl) descEl.textContent = app.desc;
    const verEl = document.getElementById('modal-app-version');
    if (verEl) verEl.textContent = app.version;
    const sizeEl = document.getElementById('modal-app-size');
    if (sizeEl) sizeEl.textContent = app.size;
    const dlEl = document.getElementById('modal-app-downloads');
    if (dlEl) dlEl.textContent = app.downloads;

    updateModalInstallButtonState();

    // Check Firebase preview tag: if true, user sees the expand button; if false, they cannot
    const previewWrapper = document.getElementById('modal-preview-wrapper');
    const toggleBtn = document.getElementById('modal-preview-toggle-btn');
    const collapse = document.getElementById('modal-preview-collapse');
    const badge = document.getElementById('preview-toggle-badge');

    const canPreview = app.preview === true;
    if (previewWrapper) {
      previewWrapper.style.display = canPreview ? 'block' : 'none';
    }

    // Always reset collapse state to closed on opening an app modal
    if (toggleBtn && collapse && badge) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      collapse.classList.remove('is-expanded');
      collapse.setAttribute('aria-hidden', 'true');
      badge.textContent = 'Expand';
    }

    modal.setAttribute('data-open', '');
    modal.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
      modalSpecularBtn?.wake();
    }, 60);
  }

  // Handle "Expand to see screenshots" toggle
  const previewToggleBtn = document.getElementById('modal-preview-toggle-btn');
  const previewCollapse = document.getElementById('modal-preview-collapse');
  const previewBadge = document.getElementById('preview-toggle-badge');

  previewToggleBtn?.addEventListener('click', () => {
    const isExpanded = previewToggleBtn.getAttribute('aria-expanded') === 'true';
    const nextState = !isExpanded;
    previewToggleBtn.setAttribute('aria-expanded', String(nextState));
    if (previewBadge) previewBadge.textContent = nextState ? 'Collapse' : 'Expand';

    if (nextState) {
      previewCollapse?.classList.add('is-expanded');
      previewCollapse?.setAttribute('aria-hidden', 'false');
      const app = demoApps[currentActiveAppIndex];
      const carousel = getOrInitModalCarousel(app);
      if (carousel) {
        const screenshots = app?.screenshots && app.screenshots.length > 0 ? app.screenshots : [
          { image: app.img, alt: app.name }
        ];
        carousel.setItems(screenshots);
        setTimeout(() => carousel.resize(), 50);
        setTimeout(() => carousel.resize(), 200);
      }
    } else {
      previewCollapse?.classList.remove('is-expanded');
      previewCollapse?.setAttribute('aria-hidden', 'true');
    }
  });

  function closeAppModal() {
    modal.removeAttribute('data-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  modalClose?.addEventListener('click', closeAppModal);
  modalBackdrop?.addEventListener('click', closeAppModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.hasAttribute('data-open')) closeAppModal();
  });

  let activeShowcaseAppIndex = 0;
  let showcaseSpecularBtn = null;

  function updateShowcaseButton(appIndex) {
    if (!showcaseSpecularBtn) return;
    const labelSpan = showcaseSpecularBtn.button?.querySelector('.specular-button__label');
    if (!labelSpan) return;

    const actualIdx = (appIndex >= 0 && appIndex < demoApps.length) ? appIndex : 0;
    activeShowcaseAppIndex = actualIdx;
    const app = demoApps[actualIdx];

    if (actualIdx === 0) {
      const downloadIconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18" style="vertical-align: middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
      labelSpan.innerHTML = `${downloadIconSvg}<span>Download Nexren</span>`;
    } else {
      const infoIconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18" style="vertical-align: middle;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
      labelSpan.innerHTML = `${infoIconSvg}<span>View ${app?.name || 'App'}</span>`;
    }
    showcaseSpecularBtn.wake();
  }

  // Mount BounceCards with responsive sizing & mobile touch support
  const bounceController = createBounceCards(mount, {
    images: demoApps,
    rotation: 8,
    arc: 10,
    bounciness: 0.65,
    onCardClick: showAppDetails,
    onActiveChange: updateShowcaseButton
  });

  // Mount Direct SpecularButton below BounceCards
  const specularMount = document.getElementById('specular-btn-mount');
  if (specularMount && typeof window.createSpecularButton === 'function') {
    const downloadIconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18" style="vertical-align: middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
    showcaseSpecularBtn = window.createSpecularButton(specularMount, {
      label: `${downloadIconSvg}<span>Download Nexren</span>`,
      size: 'lg',
      radius: 18,
      tint: '#ffffff',
      tintOpacity: 0.05,
      blur: 10,
      textColor: '#f5f5f5',
      lineColor: '#ffffff',
      baseColor: '#525252',
      intensity: 1,
      idleIntensity: 0.35,
      shineSize: 10,
      shineFade: 34,
      thickness: 1.2,
      glow: 1,
      followMouse: true,
      proximity: 250,
      onClick: () => {
        showAppDetails(activeShowcaseAppIndex);
      }
    });
  }

  // Navigation Switching: Nexren Store Main Screen vs Apps Showcase
  const mainScreen = document.getElementById('nexren-main-screen');
  const appsShowcase = document.getElementById('apps-showcase');

  window.NexrenShowMainScreen = () => {
    closeAppModal();
    if (appsShowcase) appsShowcase.style.display = 'none';
    if (mainScreen) mainScreen.style.display = 'flex';
  };

  // Connect "Apps" in the Dock to switch to Apps Showcase
  window.NexrenShowMyApps = () => {
    closeAppModal();
    if (mainScreen) mainScreen.style.display = 'none';
    if (appsShowcase) {
      appsShowcase.style.display = 'flex';
      bounceController?.resetAnimation();
    }
  };

  /* ========================================================
     React Bits - AnimatedList Component (Vanilla JS)
     ======================================================== */
  const THEMES_AL = {
    dark: {
      '--al-frame': 'rgba(38, 35, 46, 0.66)',
      '--al-frame-edge': 'rgba(255, 255, 255, 0.08)',
      '--al-frame-highlight': 'rgba(255, 255, 255, 0.07)',
      '--al-frame-shadow': '0 22px 44px -20px rgba(0, 0, 0, 0.8), 0 6px 16px -8px rgba(0, 0, 0, 0.5)',
      '--al-tile': 'linear-gradient(180deg, #3a3644 0%, #27242f 100%)',
      '--al-tile-edge': 'rgba(255, 255, 255, 0.07)',
      '--al-tile-highlight': 'rgba(255, 255, 255, 0.12)',
      '--al-tile-shadow': '0 4px 10px -4px rgba(0, 0, 0, 0.7)',
      '--al-well': 'rgba(255, 255, 255, 0.08)',
      '--al-ink': '#f4f4f5',
      '--al-muted': 'rgba(244, 244, 245, 0.55)',
      '--al-thumb': 'rgba(255, 255, 255, 0.16)',
      '--al-ring': 'rgba(244, 244, 245, 0.3)',
      '--al-ring-fill': 'rgba(244, 244, 245, 0.05)',
      '--al-hover': 'brightness(1.12)',
      '--al-press': 'brightness(0.85)',
      '--al-active': 'brightness(1.16)'
    },
    light: {
      '--al-frame': 'rgba(240, 240, 243, 0.8)',
      '--al-frame-edge': 'rgba(24, 24, 27, 0.07)',
      '--al-frame-highlight': 'rgba(255, 255, 255, 0.95)',
      '--al-frame-shadow': '0 22px 44px -22px rgba(24, 24, 27, 0.3), 0 6px 16px -10px rgba(24, 24, 27, 0.16)',
      '--al-tile': 'linear-gradient(180deg, #ffffff 0%, #f6f6f8 100%)',
      '--al-tile-edge': 'rgba(24, 24, 27, 0.08)',
      '--al-tile-highlight': 'rgba(255, 255, 255, 1)',
      '--al-tile-shadow': '0 4px 10px -5px rgba(24, 24, 27, 0.25)',
      '--al-well': 'rgba(24, 24, 27, 0.05)',
      '--al-ink': '#27272a',
      '--al-muted': 'rgba(39, 39, 42, 0.55)',
      '--al-thumb': 'rgba(24, 24, 27, 0.16)',
      '--al-ring': 'rgba(24, 24, 27, 0.28)',
      '--al-ring-fill': 'transparent',
      '--al-hover': 'brightness(0.97)',
      '--al-press': 'brightness(0.92)',
      '--al-active': 'none'
    }
  };

  const HIDDEN_AL = {
    pop: { above: 'translate3d(0, -12px, 0) scale(0.8)', below: 'translate3d(0, 12px, 0) scale(0.8)' },
    slide: { above: 'translate3d(0, -28px, 0) scale(0.98)', below: 'translate3d(0, 28px, 0) scale(0.98)' },
    fade: { above: 'translate3d(0, -4px, 0)', below: 'translate3d(0, 4px, 0)' }
  };

  const SPRING_AL =
    'linear(0, 0.0603, 0.2033, 0.3821, 0.5633, 0.7258, 0.8584, 0.9574, 1.0242, 1.0634, 1.0809, 1.0828, 1.0747, 1.0613, 1.046, 1.0313, 1.0186, 1.0085, 1.0012, 0.9965, 0.994, 0.9931, 0.9933, 0.9941, 0.9953, 0.9966, 0.9978, 0.9988, 1)';

  const smootherstep = t => t * t * t * (t * (t * 6 - 15) + 10);

  const FADE_MASK = (() => {
    const steps = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
    const top = steps.map(t => `rgba(0, 0, 0, ${smootherstep(t).toFixed(3)}) calc(var(--al-fade-top) * ${t})`);
    const bottom = [...steps]
      .reverse()
      .map(t => `rgba(0, 0, 0, ${smootherstep(t).toFixed(3)}) calc(100% - var(--al-fade-bottom) * ${t})`);
    return `linear-gradient(to bottom, ${[...top, ...bottom].join(', ')})`;
  })();

  const sizeVal = value => (typeof value === 'number' ? `${value}px` : value);

  function createAnimatedList(container, options = {}) {
    const {
      items = [],
      onItemSelect,
      initialSelectedIndex = -1,
      selectOnHover = true,
      enableArrowNavigation = true,
      loop = false,
      animation = 'pop',
      animateOnce = false,
      stagger = 0.05,
      showGradients = true,
      fadeSize = 56,
      displayScrollbar = true,
      frame = true,
      theme = 'dark',
      accentColor = '#38bdf8',
      radius = 14,
      gap = 8,
      width = '100%',
      maxHeight = 360,
      className = '',
      itemClassName = ''
    } = options;

    let selected = initialSelectedIndex;
    const itemElements = [];
    let boxes = [];
    let currentMode = animation;
    let engaged = false;
    let pointer = [0, 0];
    let raf = 0;
    let last = 0;
    const motion = { y: 0, h: 0, vy: 0, vh: 0, ty: 0, th: 0, ready: false };
    const fades = { top: '', bottom: '' };

    const root = document.createElement('div');
    root.className = `animated-list${frame ? ' animated-list--framed' : ''} ${className}`.trim();
    if (animation !== 'none') root.setAttribute('data-animated', '');

    const themeObj = THEMES_AL[theme] ?? THEMES_AL.dark;
    Object.entries(themeObj).forEach(([k, v]) => root.style.setProperty(k, v));
    root.style.setProperty('--al-radius', `${Math.max(0, radius)}px`);
    root.style.setProperty('--al-gap', `${Math.max(0, gap)}px`);
    root.style.setProperty('--al-width', sizeVal(width));
    root.style.setProperty('--al-accent', accentColor || 'var(--al-ink)');
    if (accentColor) {
      root.style.setProperty('--al-ring', accentColor);
      root.style.setProperty('--al-ring-fill', `color-mix(in srgb, ${accentColor} 8%, transparent)`);
    }

    const viewport = document.createElement('div');
    viewport.className = `animated-list__viewport${displayScrollbar ? '' : ' animated-list__viewport--bare'}`;
    viewport.setAttribute('role', 'listbox');
    viewport.setAttribute('tabindex', '0');
    viewport.style.maxHeight = sizeVal(maxHeight);
    if (showGradients) {
      viewport.style.maskImage = FADE_MASK;
      viewport.style.webkitMaskImage = FADE_MASK;
    }

    const track = document.createElement('div');
    track.className = 'animated-list__track';

    items.forEach((item, index) => {
      const entry = typeof item === 'string' ? { title: item } : item;
      const el = document.createElement('div');
      el.className = `animated-list__item ${itemClassName}`.trim();
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(index === selected));
      el.dataset.index = String(index);
      if (index === selected) el.setAttribute('data-selected', '');

      if (entry.image || entry.icon) {
        const lead = document.createElement('span');
        lead.className = 'animated-list__lead';
        if (entry.image) {
          const img = document.createElement('img');
          img.src = entry.image;
          img.alt = '';
          img.draggable = false;
          lead.appendChild(img);
        } else if (entry.icon) {
          lead.innerHTML = entry.icon;
        }
        el.appendChild(lead);
      }

      const text = document.createElement('span');
      text.className = 'animated-list__text';
      const title = document.createElement('span');
      title.className = 'animated-list__title';
      title.textContent = entry.title || '';
      text.appendChild(title);

      if (entry.description) {
        const desc = document.createElement('span');
        desc.className = 'animated-list__description';
        desc.textContent = entry.description;
        text.appendChild(desc);
      }
      el.appendChild(text);

      if (entry.meta) {
        const meta = document.createElement('span');
        meta.className = 'animated-list__meta';
        meta.textContent = entry.meta;
        el.appendChild(meta);
      }

      const rim = document.createElement('span');
      rim.className = 'animated-list__rim';
      rim.setAttribute('aria-hidden', 'true');
      el.appendChild(rim);

      if (selectOnHover) {
        el.addEventListener('pointerenter', () => setSelected(index));
      }

      el.addEventListener('click', () => {
        setSelected(index);
        onItemSelect?.(item, index);
      });

      track.appendChild(el);
      itemElements.push(el);
    });

    const indicator = document.createElement('span');
    indicator.className = 'animated-list__indicator';
    indicator.setAttribute('aria-hidden', 'true');
    const ring = document.createElement('span');
    ring.className = 'animated-list__ring';
    indicator.appendChild(ring);
    track.appendChild(indicator);

    viewport.appendChild(track);
    root.appendChild(viewport);

    if (frame) {
      const frameRim = document.createElement('span');
      frameRim.className = 'animated-list__frame-rim';
      frameRim.setAttribute('aria-hidden', 'true');
      root.appendChild(frameRim);
    }

    container.appendChild(root);

    // Physics Engine & Transitions
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const springEase = CSS.supports?.('transition-timing-function', 'linear(0, 1)')
      ? SPRING_AL
      : 'cubic-bezier(0.34, 1.4, 0.64, 1)';
    const transition = `transform 620ms ${springEase}, opacity 300ms cubic-bezier(0.22, 1, 0.36, 1), filter 200ms ease`;

    const getMode = () => {
      if (animation === 'none' || !HIDDEN_AL[animation]) return 'none';
      return reduced ? 'fade' : animation;
    };

    const apply = (element, state) => {
      element.dataset.state = state;
      const pose = currentMode && currentMode !== 'none' && state !== 'in' ? HIDDEN_AL[currentMode][state] : '';
      element.style.transform = pose;
      element.style.opacity = pose ? '0' : '';
    };

    const syncRing = () => {
      const item = itemElements[selected];
      if (!item) return;
      const state = item.dataset.state || 'in';
      if (state === ring.dataset.state) return;
      ring.style.transitionDelay = item.style.transitionDelay;
      apply(ring, state);
    };

    const write = () => {
      indicator.style.transform = `translate3d(0, ${motion.y.toFixed(2)}px, 0)`;
      indicator.style.height = `${motion.h.toFixed(2)}px`;
    };

    const frameLoop = now => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const omega = 30;
      const zeta = 0.78;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        motion.vy += (omega * omega * (motion.ty - motion.y) - 2 * zeta * omega * motion.vy) * h;
        motion.vh += (omega * omega * (motion.th - motion.h) - 2 * zeta * omega * motion.vh) * h;
        motion.y += motion.vy * h;
        motion.h += motion.vh * h;
      }
      const moving =
        Math.abs(motion.ty - motion.y) > 0.05 ||
        Math.abs(motion.th - motion.h) > 0.05 ||
        Math.abs(motion.vy) + Math.abs(motion.vh) > 0.5;
      if (!moving) {
        motion.y = motion.ty;
        motion.h = motion.th;
        motion.vy = motion.vh = 0;
      }
      write();
      if (moving) raf = requestAnimationFrame(frameLoop);
    };

    const place = snap => {
      const item = itemElements[selected];
      if (!item) {
        indicator.style.opacity = '0';
        motion.ready = false;
        return;
      }
      indicator.style.opacity = '1';
      motion.ty = item.offsetTop;
      motion.th = item.offsetHeight;
      if (snap || reduced || !motion.ready) {
        motion.y = motion.ty;
        motion.h = motion.th;
        motion.vy = motion.vh = 0;
        motion.ready = true;
        write();
        return;
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frameLoop);
      }
    };

    const updateFades = () => {
      const span = Math.max(1, fadeSize);
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const top = showGradients ? Math.min(span, Math.max(0, scrollTop)) : 0;
      const bottom = showGradients ? Math.min(span, Math.max(0, scrollHeight - clientHeight - scrollTop)) : 0;
      const nextTop = `${top.toFixed(1)}px`;
      const nextBottom = `${bottom.toFixed(1)}px`;
      if (nextTop !== fades.top) {
        fades.top = nextTop;
        viewport.style.setProperty('--al-fade-top', nextTop);
      }
      if (nextBottom !== fades.bottom) {
        fades.bottom = nextBottom;
        viewport.style.setProperty('--al-fade-bottom', nextBottom);
      }
    };

    const measure = () => {
      const offset = track.offsetTop;
      boxes = itemElements.map(item => (item ? [offset + item.offsetTop, item.offsetHeight] : null));
    };

    const reveal = entrance => {
      const top = viewport.scrollTop;
      const view = viewport.clientHeight;
      let order = 0;
      itemElements.forEach((item, index) => {
        const box = boxes[index];
        if (!item || !box) return;
        const start = box[0] - top;
        const overlap = Math.min(view, start + box[1]) - Math.max(0, start);
        const hidden =
          currentMode !== 'none' && overlap < Math.min(box[1], view) * 0.5 && !(animateOnce && item.dataset.seen);
        const state = hidden ? (start + box[1] / 2 < view / 2 ? 'above' : 'below') : 'in';
        if (state === item.dataset.state) return;
        const delay = entrance && !hidden ? (order++ * Math.max(0, stagger)).toFixed(3) : 0;
        item.style.transitionDelay = delay ? `${delay}s, ${delay}s, 0s` : '';
        if (!hidden) item.dataset.seen = 'true';
        apply(item, state);
      });
      syncRing();
    };

    const sync = () => {
      currentMode = getMode();
      for (const el of [...itemElements, ring]) {
        el.style.transition = 'none';
      }
      for (const item of itemElements) {
        apply(item, currentMode === 'none' ? 'in' : item.dataset.state || 'below');
      }
      apply(ring, itemElements[selected]?.dataset.state || 'in');
      void root.offsetHeight; // force reflow
      for (const el of [...itemElements, ring]) {
        el.style.transition = transition;
      }
      measure();
      reveal(true);
    };

    function setSelected(nextIndex) {
      if (selected === nextIndex) return;
      selected = nextIndex;
      itemElements.forEach((el, i) => {
        const isSel = i === selected;
        el.setAttribute('aria-selected', String(isSel));
        el.toggleAttribute('data-selected', isSel);
      });
      place(false);
      syncRing();
    }

    viewport.addEventListener('scroll', () => {
      updateFades();
      reveal(false);
    }, { passive: true });

    viewport.addEventListener('keydown', event => {
      if (!enableArrowNavigation || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const count = items.length;
      if (!count) return;
      let next = null;
      if (event.key === 'ArrowDown') next = selected < 0 ? 0 : selected + 1;
      else if (event.key === 'ArrowUp') next = selected < 0 ? count - 1 : selected - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = count - 1;
      else if ((event.key === 'Enter' || event.key === ' ') && selected >= 0 && selected < count) {
        event.preventDefault();
        onItemSelect?.(items[selected], selected);
        return;
      }
      if (next === null) return;
      event.preventDefault();
      next = loop ? (next + count) % count : Math.min(count - 1, Math.max(0, next));
      setSelected(next);

      // Auto-scroll selected item into view
      const item = itemElements[selected];
      if (item) {
        const top = track.offsetTop + item.offsetTop;
        const bottom = top + item.offsetHeight;
        const room = Math.max(0, (viewport.clientHeight - item.offsetHeight) / 2);
        const margin = Math.min(showGradients ? Math.max(12, fadeSize) : 12, room);
        if (top < viewport.scrollTop + margin) {
          viewport.scrollTo({ top: Math.max(0, top - margin), behavior: 'smooth' });
        } else if (bottom > viewport.scrollTop + viewport.clientHeight - margin) {
          viewport.scrollTo({ top: bottom - viewport.clientHeight + margin, behavior: 'smooth' });
        }
      }
    });

    root.addEventListener('pointerenter', () => { engaged = true; });
    root.addEventListener('pointerleave', () => { engaged = false; });
    root.addEventListener('pointermove', event => {
      pointer = [event.clientX, event.clientY];
    });

    setTimeout(() => {
      measure();
      sync();
      updateFades();
      if (selected >= 0) place(true);
    }, 50);

    return {
      root,
      viewport,
      setSelected,
      refresh: () => {
        viewport.scrollTop = 0;
        measure();
        sync();
        updateFades();
        if (selected >= 0) place(true);
      }
    };
  }

  // Downloads Modal Initialization & Dynamic List Linked to Installs
  const downloadsModal = document.getElementById('downloads-modal');
  const downloadsClose = document.getElementById('downloads-modal-close');
  const downloadsBackdrop = downloadsModal?.querySelector('.downloads-modal-backdrop');
  const downloadsMount = document.getElementById('downloads-list-mount');

  let animatedListInstance = null;

  function updateDownloadsDockBadge() {
    const dlTile = document.querySelector('.dock-item[aria-label="Downloads"] .dock-tile');
    if (!dlTile) return;
    let badgeEl = dlTile.querySelector('.dock-badge');
    if (installedApps.size > 0) {
      if (!badgeEl) {
        badgeEl = document.createElement('span');
        badgeEl.className = 'dock-badge';
        dlTile.appendChild(badgeEl);
      }
      badgeEl.textContent = String(installedApps.size);
    } else {
      badgeEl?.remove();
    }
  }

  function renderDownloadsView() {
    if (!downloadsMount) return;
    downloadsMount.innerHTML = '';

    const downloadedList = Array.from(installedApps).map(idx => {
      const app = demoApps[idx];
      return {
        id: app.name.toLowerCase(),
        image: app.img,
        title: `${app.name} ${app.version}`,
        description: app.category,
        meta: 'Installed'
      };
    });

    if (downloadedList.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'downloads-empty-state';
      empty.innerHTML = `
        <div class="downloads-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="30" height="30">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
        </div>
        <h4 class="downloads-empty-title">No Downloads Yet</h4>
        <p class="downloads-empty-desc">Apps and updates you download will appear here.</p>
      `;
      downloadsMount.appendChild(empty);
      animatedListInstance = null;
    } else {
      animatedListInstance = createAnimatedList(downloadsMount, {
        items: downloadedList,
        initialSelectedIndex: 0,
        animation: 'pop',
        theme: 'dark',
        accentColor: '#38bdf8',
        stagger: 0.05,
        selectOnHover: true,
        enableArrowNavigation: true,
        showGradients: true,
        fadeSize: 48,
        onItemSelect: (item, index) => {
          console.log('Selected download item:', item);
        }
      });
    }
  }

  // Initialize downloads view on page load
  renderDownloadsView();

  function openDownloadsModal() {
    if (!downloadsModal) return;
    renderDownloadsView();
    downloadsModal.setAttribute('data-open', '');
    downloadsModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      animatedListInstance?.refresh();
    }, 60);
  }

  function closeDownloadsModal() {
    if (!downloadsModal) return;
    downloadsModal.removeAttribute('data-open');
    downloadsModal.setAttribute('aria-hidden', 'true');
  }

  window.NexrenOnDownloadsClick = () => {
    if (downloadsModal && downloadsModal.hasAttribute('data-open')) {
      closeDownloadsModal();
    } else {
      openDownloadsModal();
    }
  };

  downloadsClose?.addEventListener('click', closeDownloadsModal);
  downloadsBackdrop?.addEventListener('click', closeDownloadsModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && downloadsModal?.hasAttribute('data-open')) {
      closeDownloadsModal();
    }
  });

  // ========================================================
  // User Feedback / Complaint / Feature Request System
  // ========================================================
  (function initReportFeedbackModal() {
    const reportBtn = document.getElementById('top-nav-report-btn');
    const modal = document.getElementById('report-modal');
    const backdrop = document.getElementById('report-modal-backdrop');
    const closeBtn = document.getElementById('report-modal-close');
    const form = document.getElementById('report-form');
    const mount = document.getElementById('report-specular-mount');
    const statusEl = document.getElementById('report-form-status');

    if (!modal) return;

    const FIREBASE_REPORTS_URL = 'https://nexren-5f350-default-rtdb.firebaseio.com/reports.json';

    let specularBtnInstance = null;
    let isSubmitting = false;

    // Create SpecularButton with glassmorphic WebGL refraction and light reflections
    if (mount && typeof window.createSpecularButton === 'function') {
      specularBtnInstance = window.createSpecularButton(mount, {
        label: `
          <span>Send to Developer</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="vertical-align: middle;">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        `,
        size: 'md',
        radius: 14,
        tint: '#38bdf8',
        tintOpacity: 0.08,
        blur: 10,
        textColor: '#f4f4f5',
        lineColor: '#38bdf8',
        glow: 1,
        speed: 0.35,
        type: 'submit',
        className: 'report-specular-btn'
      });
    }

    function openModal() {
      modal.setAttribute('data-open', '');
      modal.setAttribute('aria-hidden', 'false');
      // Wake SpecularButton WebGL shaders
      specularBtnInstance?.wake?.();
      setTimeout(() => {
        document.getElementById('report-subject')?.focus();
      }, 100);
    }

    function closeModal() {
      modal.removeAttribute('data-open');
      modal.setAttribute('aria-hidden', 'true');
    }

    reportBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.hasAttribute('data-open')) {
        closeModal();
      }
    });

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      if (isSubmitting) return;

      const typeEl = form.querySelector('input[name="reportType"]:checked');
      const subjectEl = document.getElementById('report-subject');
      const descEl = document.getElementById('report-description');
      const contactEl = document.getElementById('report-contact');

      const reportType = typeEl?.value || 'Bug / Issue';
      const subject = subjectEl?.value.trim() || '';
      const description = descEl?.value.trim() || '';
      const contact = contactEl?.value.trim() || '';

      if (!subject || !description) return;

      const payload = {
        type: reportType,
        subject: subject,
        description: description,
        contact: contact,
        timestamp: Date.now(),
        date: new Date().toISOString(),
        userAgent: navigator.userAgent || 'Unknown',
        screen: `${window.innerWidth}x${window.innerHeight}`
      };

      isSubmitting = true;
      if (specularBtnInstance?.button) {
        specularBtnInstance.button.disabled = true;
        const lbl = specularBtnInstance.button.querySelector('.specular-button__label');
        if (lbl) lbl.innerHTML = '<span>Submitting...</span>';
      }
      if (statusEl) {
        statusEl.className = 'report-form-status';
        statusEl.textContent = '';
      }

      try {
        const res = await fetch(FIREBASE_REPORTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}`);

        // Success state
        if (statusEl) {
          statusEl.className = 'report-form-status success';
          statusEl.textContent = '✓ Received! Thank you for your feedback.';
        }
        if (specularBtnInstance?.button) {
          const lbl = specularBtnInstance.button.querySelector('.specular-button__label');
          if (lbl) lbl.innerHTML = '<span>Sent!</span>';
        }

        form.reset();

        setTimeout(() => {
          closeModal();
          isSubmitting = false;
          if (specularBtnInstance?.button) {
            specularBtnInstance.button.disabled = false;
            const lbl = specularBtnInstance.button.querySelector('.specular-button__label');
            if (lbl) {
              lbl.innerHTML = `
                <span>Send to Developer</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="vertical-align: middle;">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              `;
            }
          }
          if (statusEl) {
            statusEl.className = 'report-form-status';
            statusEl.textContent = '';
          }
        }, 1600);
      } catch (err) {
        console.error('Failed to submit report to Firebase:', err);
        isSubmitting = false;
        if (statusEl) {
          statusEl.className = 'report-form-status error';
          statusEl.textContent = 'Could not send. Please try again.';
        }
        if (specularBtnInstance?.button) {
          specularBtnInstance.button.disabled = false;
          const lbl = specularBtnInstance.button.querySelector('.specular-button__label');
          if (lbl) {
            lbl.innerHTML = '<span>Retry</span>';
          }
        }
      }
    });
  })();
})();

