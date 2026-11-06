import * as THREE from 'three'

const COUNT = 72
const PALETTE = ['#fff8e5', '#e5f8ee', '#dcefff', '#fffdf8']

const vertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute vec4 aDrift;
  attribute vec3 aTint;
  varying vec3 vTint;
  varying float vOpacity;

  void main() {
    float life = fract(aDrift.x + uTime / aDrift.y);
    float phase = aDrift.z;
    vec3 point = position;
    point.y = mix(-2.4, 7.0, life);
    point.x += 0.24 * sin(uTime * 0.24 + phase);
    point.z += 0.13 * cos(uTime * 0.18 + phase);
    vec4 view = modelViewMatrix * vec4(point, 1.0);
    gl_Position = projectionMatrix * view;

    // CSS-sized grains stay tiny even when zoomed close to the island.
    float depthScale = sqrt(16.0 / max(4.0, -view.z));
    gl_PointSize = clamp(mix(3.2, 5.5, aDrift.w) * depthScale, 2.2, 5.6) * uPixelRatio;
    float envelope = smoothstep(0.0, 0.19, life) * (1.0 - smoothstep(0.79, 1.0, life));
    float breath = 0.76 + 0.24 * sin(uTime * (0.28 + aDrift.w * 0.13) + phase);
    vOpacity = 0.68 * envelope * breath;
    vTint = aTint;
  }
`

const fragmentShader = `
  varying vec3 vTint;
  varying float vOpacity;

  void main() {
    float radius = length(gl_PointCoord * 2.0 - 1.0);
    float falloff = 1.0 - smoothstep(0.05, 1.0, radius);
    gl_FragColor = vec4(vTint, vOpacity * falloff * falloff);
  }
`

// One static point batch. Time is the only per-frame update, and fade reaches
// zero at both ends of the rise so a wrapped particle never visibly jumps.
export function createBalancedMotes(random, pixelRatio) {
  const positions = new Float32Array(COUNT * 3)
  const drift = new Float32Array(COUNT * 4)
  const tints = new Float32Array(COUNT * 3)
  const colors = PALETTE.map(hex => new THREE.Color(hex))
  for (let i = 0; i < COUNT; i++) {
    positions.set([(random() - 0.5) * 13, 0, (random() - 0.5) * 10], i * 3)
    drift.set([random(), 76 + random() * 46, random() * Math.PI * 2, random()], i * 4)
    colors[i % colors.length].toArray(tints, i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aDrift', new THREE.BufferAttribute(drift, 4))
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 3))
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  const motes = new THREE.Points(geometry, material)
  motes.name = 'Balanced floating light'
  motes.frustumCulled = false // The shader moves particles outside their static bounds.
  return motes
}
