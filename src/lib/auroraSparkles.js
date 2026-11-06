import * as THREE from 'three'

// Use the garden's existing 140 particles, with soft point contours and slow twinkle.
export function createAuroraSparkleMaterial(size) {
  const material = new THREE.PointsMaterial({
    color: '#ffffff', size, transparent: true, opacity: 0.8,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const time = { value: 0 }
  material.userData.time = time
  material.onBeforeCompile = shader => {
    shader.uniforms.auroraTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float auroraSeed;')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        auroraSeed = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
      `)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float auroraTime;\nvarying float auroraSeed;')
      .replace('#include <opaque_fragment>', `
        vec2 point = gl_PointCoord - 0.5;
        float radius = length(point);
        float core = exp(-radius * radius * 32.0);
        float glint = exp(-abs(point.x * point.y) * 500.0) * pow(max(0.0, 1.0 - radius * 2.0), 3.0);
        diffuseColor.a *= (core * 0.55 + glint * 0.35)
          * (0.55 + 0.45 * pow(sin(auroraTime * 0.35 + auroraSeed * 6.283) * 0.5 + 0.5, 2.0));
        outgoingLight *= mix(vec3(0.32, 0.84, 1.0), vec3(1.0, 0.44, 0.79), auroraSeed) * 1.6;
        #include <opaque_fragment>
      `)
  }
  material.customProgramCacheKey = () => 'sup-aurora-soft-sparkles-v1'
  return material
}
