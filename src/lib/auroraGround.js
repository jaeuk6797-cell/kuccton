// Fine mineral grains use the existing surface positions. Derivative filtering keeps
// distant grains quiet; camera direction changes which tiny facets catch the light.
export function applyAuroraGroundGrain(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vAuroraGroundPosition;')
    .replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vAuroraGroundPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    `)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `
      #include <common>
      varying vec3 vAuroraGroundPosition;
      float mineralHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
    `)
    .replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 grainUv = vAuroraGroundPosition.xz * 28.0;
      float grainFilter = 1.0 - smoothstep(0.8, 2.0, length(fwidth(grainUv)));
      float grain = mineralHash(floor(grainUv));
      float mineralVein = 0.5 + 0.5 * sin(vAuroraGroundPosition.x * 2.4
        + sin(vAuroraGroundPosition.z * 2.1)) * sin(vAuroraGroundPosition.z * 2.7);
      diffuseColor.rgb *= mix(vec3(0.58, 1.14, 1.32), vec3(1.36, 0.66, 1.16), mineralVein)
        * mix(1.0, 0.82 + 0.24 * grain, grainFilter);
    `)
    .replace('#include <opaque_fragment>', `
      vec2 mineralUv = vAuroraGroundPosition.xz * 28.0;
      vec2 mineralCell = floor(mineralUv);
      float mineralSeed = mineralHash(mineralCell);
      vec2 mineralCenter = vec2(mineralSeed, mineralHash(mineralCell + 19.7)) * 0.6 + 0.2;
      float mineralDistance = length(fract(mineralUv) - mineralCenter);
      float mineralFootprint = max(length(fwidth(mineralUv)), 0.01);
      float mineralFilter = 1.0 - smoothstep(0.8, 2.0, mineralFootprint);
      float mineralPoint = 1.0 - smoothstep(0.04, 0.04 + mineralFootprint * 0.55, mineralDistance);
      vec3 mineralView = normalize(cameraPosition - vAuroraGroundPosition);
      float mineralGlint = max(0.0, cos(mineralSeed * 6.28318 + mineralView.x * 5.0 + mineralView.z * 4.0));
      mineralGlint *= mineralGlint;
      mineralGlint *= mineralGlint;
      mineralGlint *= mineralGlint;
      vec3 mineralTint = mix(vec3(0.30, 0.90, 1.10), vec3(1.10, 0.45, 0.85), mineralSeed);
      outgoingLight *= 1.0 - 0.035 * mineralFilter * mineralSeed;
      outgoingLight += mineralTint * mineralPoint * mineralFilter
        * smoothstep(0.64, 0.98, mineralSeed) * (0.08 + 3.2 * mineralGlint);
      #include <opaque_fragment>
    `)
}
