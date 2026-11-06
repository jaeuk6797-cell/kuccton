import * as THREE from 'three'

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform float uPhase;
  uniform float uOpacity;
  uniform vec3 uTint;
  varying vec2 vUv;

  float cellHash(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float drift = uTime * 0.035;
    float flow = 0.22 * sin(p.x * 2.2 + drift + uPhase)
      + 0.14 * sin(p.x * 4.3 - drift * 0.7 + uPhase);
    float distanceToFlow = p.y - flow;
    float veil = exp(-distanceToFlow * distanceToFlow * 7.5);
    float filamentDistance = distanceToFlow - 0.12 * sin(p.x * 7.0 + drift);
    float filament = exp(-filamentDistance * filamentDistance * 36.0);
    float patches = 0.3 + 0.7 * smoothstep(-0.4, 1.0, sin(p.x * 3.4 + drift * 0.6 + uPhase));

    // Broad falloff hides the finite plane and keeps the bands cloud-like.
    vec2 edge = smoothstep(vec2(0.0), vec2(0.22), vUv)
      * (1.0 - smoothstep(vec2(0.78), vec2(1.0), vUv));
    float fade = edge.x * edge.y;

    // Only a few cells shimmer, gently, inside the veil rather than across the sky.
    vec2 grid = vUv * vec2(46.0, 12.0);
    float seed = cellHash(floor(grid) + uPhase);
    float point = pow(max(0.0, 1.0 - length(fract(grid) - 0.5) * 3.2), 6.0);
    float pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 0.25 + seed * 31.0), 4.0);
    float shimmer = smoothstep(0.98, 1.0, seed) * point * pulse * veil;
    float alpha = uOpacity * fade * ((veil * 0.65 + filament * 0.12) * patches + shimmer * 0.08);
    gl_FragColor = vec4(uTint, alpha);
  }
`

export function createAuroraAtmosphere() {
  const group = new THREE.Group()
  group.name = 'Aurora sky wisps'
  const geometry = new THREE.PlaneGeometry(1, 1)
  const placements = [
    { x: -5.4, y: 3.5, depth: 9, width: 14, height: 7.5, tint: '#f2c1e6', phase: 0.4, opacity: 0.12 },
    { x: 5.8, y: 1.4, depth: 10, width: 15, height: 8, tint: '#b5e9ef', phase: 2.7, opacity: 0.1 },
  ]
  for (const placement of placements) {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: placement.phase },
        uOpacity: { value: placement.opacity },
        uTint: { value: new THREE.Color(placement.tint) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    })
    const plane = new THREE.Mesh(geometry, material)
    plane.name = `Aurora ${placement.phase === 0.4 ? 'rose' : 'aqua'} wisp`
    plane.scale.set(placement.width, placement.height, 1)
    // Opaque island surfaces occlude the wisps; other transparent crystals render afterward.
    plane.renderOrder = -10
    group.add(plane)
  }

  const center = new THREE.Vector3(0, -0.2, 0)
  const eye = new THREE.Vector3()
  const away = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const orientation = new THREE.Quaternion()
  group.userData.tick = (time, camera) => {
    camera.getWorldPosition(eye)
    camera.getWorldQuaternion(orientation)
    away.copy(center).sub(eye).normalize()
    right.set(1, 0, 0).applyQuaternion(orientation)
    up.set(0, 1, 0).applyQuaternion(orientation)
    for (let i = 0; i < group.children.length; i++) {
      const plane = group.children[i]
      const placement = placements[i]
      plane.position.copy(center).addScaledVector(away, placement.depth)
        .addScaledVector(right, placement.x + Math.sin(time * 0.025 + placement.phase) * 0.18)
        .addScaledVector(up, placement.y)
      plane.quaternion.copy(orientation)
      plane.material.uniforms.uTime.value = time
    }
  }
  return group
}
