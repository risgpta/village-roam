// A single shared wind field, evaluated identically in every vegetation shader.
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.6 } };

export const windGLSL = /* glsl */ `
uniform float uTime;
uniform float uWind;
vec2 windAt(vec2 p) {
  vec2 dir = vec2(0.87, 0.49);
  float w1 = sin(dot(p, dir) * 0.09 - uTime * 1.5) * 0.5 + 0.5;
  float w2 = sin(dot(p, vec2(-0.35, 0.94)) * 0.15 - uTime * 1.05 + 1.7) * 0.5 + 0.5;
  float w3 = sin(dot(p, dir) * 0.31 - uTime * 2.6) * 0.5 + 0.5;
  float gust = w1 * w1 * 0.65 + w2 * 0.25 + w3 * 0.1;
  float s = (0.12 + gust * 0.85) * uWind;
  float flutter = sin(uTime * 3.7 + p.x * 1.3 + p.y * 1.1) * 0.12;
  return dir * s + vec2(-dir.y, dir.x) * flutter * s;
}
`;

// Sway any (instanced or not) mesh with height above its origin. Works with Lambert/Standard.
export function applyFoliageWind(material, { height = 8, amp = 0.3, flutter = 0.04 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${windGLSL}\nconst float uSwayHeight = ${height.toFixed(3)};\nconst float uSwayAmp = ${amp.toFixed(3)};\nconst float uFlutter = ${flutter.toFixed(3)};`
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec3 swayOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 swayOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        vec4 wPos = modelMatrix * mvPosition;
        float hf = max(0.0, wPos.y - swayOrigin.y) / uSwayHeight;
        vec2 wv = windAt(swayOrigin.xz);
        wPos.xz += wv * hf * hf * uSwayAmp;
        float fl = uFlutter * hf * (0.35 + length(wv));
        wPos.xyz += fl * vec3(
          sin(uTime * 5.1 + wPos.x * 2.1 + wPos.z),
          sin(uTime * 6.3 + wPos.y * 2.3) * 0.6,
          cos(uTime * 5.5 + wPos.z * 1.9 + wPos.x));
        mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;
        `
      );
  };
  material.customProgramCacheKey = () => `sway-${height}-${amp}-${flutter}`;
  return material;
}

// Cloth / flag waving. mode 0: hangs from top edge (y=0 is top). mode 1: attached at left edge (x=0).
export function applyClothWave(material, { mode = 0, size = 1 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${windGLSL}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        vec2 origin = vec2(modelMatrix[3].x, modelMatrix[3].z);
        float gust = length(windAt(origin));
        ${
          mode === 0
            ? `float amt = clamp(-position.y / ${size.toFixed(3)}, 0.0, 1.0);
               transformed.z += amt * (gust * 0.45 + sin(uTime * 4.0 + position.x * 4.0 - amt * 3.0) * 0.07 * (0.4 + gust));
               transformed.y += amt * amt * gust * 0.12;`
            : `float amt = clamp(position.x / ${size.toFixed(3)}, 0.0, 1.0);
               transformed.z += amt * sin(uTime * 7.0 - position.x * 6.0) * 0.12 * (0.5 + gust);
               transformed.y -= amt * amt * (0.25 - gust * 0.2);`
        }
        `
      );
  };
  material.customProgramCacheKey = () => `cloth-${mode}-${size}`;
  return material;
}
