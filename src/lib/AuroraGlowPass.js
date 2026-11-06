import { HalfFloatType, NoBlending, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'

const VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

function material(name, uniforms, fragmentShader) {
  return new ShaderMaterial({
    name, uniforms, vertexShader: VERTEX, fragmentShader,
    depthTest: false, depthWrite: false, blending: NoBlending, toneMapped: false,
  })
}

// Four draws, two small ping-pong targets, and no extra scene render. Keep this
// before OutputPass so highlights are extracted from the linear HDR scene.
export class AuroraGlowPass extends Pass {
  constructor({ strength = 0.35, threshold = 0.85 } = {}) {
    super()
    this.strength = strength
    this.threshold = threshold
    const options = { type: HalfFloatType, depthBuffer: false, stencilBuffer: false }
    this.bright = new WebGLRenderTarget(1, 1, options)
    this.blur = new WebGLRenderTarget(1, 1, options)
    this.bright.texture.name = 'SUP Aurora highlights'
    this.blur.texture.name = 'SUP Aurora blur'
    this.bright.texture.generateMipmaps = false
    this.blur.texture.generateMipmaps = false

    this.extractMaterial = material('SUP Aurora highlight threshold', {
      tScene: { value: null }, threshold: { value: threshold },
    }, `
      uniform sampler2D tScene;
      uniform float threshold;
      varying vec2 vUv;
      void main() {
        vec4 scene = texture2D(tScene, vUv);
        float luminance = dot(scene.rgb, vec3(0.2126, 0.7152, 0.0722));
        float weight = smoothstep(threshold, threshold + 0.25, luminance);
        gl_FragColor = vec4(scene.rgb * weight * scene.a, 0.0);
      }
    `)
    this.blurMaterial = material('SUP Aurora five tap blur', {
      tInput: { value: null }, stepUv: { value: new Vector2() },
    }, `
      uniform sampler2D tInput;
      uniform vec2 stepUv;
      varying vec2 vUv;
      void main() {
        vec3 color = texture2D(tInput, vUv).rgb * 0.2270270270;
        color += texture2D(tInput, vUv + stepUv * 1.3846153846).rgb * 0.3162162162;
        color += texture2D(tInput, vUv - stepUv * 1.3846153846).rgb * 0.3162162162;
        color += texture2D(tInput, vUv + stepUv * 3.2307692308).rgb * 0.0702702703;
        color += texture2D(tInput, vUv - stepUv * 3.2307692308).rgb * 0.0702702703;
        gl_FragColor = vec4(color, 0.0);
      }
    `)
    this.combineMaterial = material('SUP Aurora glow composite', {
      tScene: { value: null }, tGlow: { value: this.bright.texture }, strength: { value: strength },
    }, `
      uniform sampler2D tScene;
      uniform sampler2D tGlow;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        vec4 scene = texture2D(tScene, vUv);
        vec3 glow = texture2D(tGlow, vUv).rgb * strength;
        // Opaque surfaces retain their alpha. Empty sky stays transparent except
        // for a faint halo immediately around a bright silhouette.
        float haloAlpha = clamp(max(glow.r, max(glow.g, glow.b)) * 0.25, 0.0, 0.18);
        gl_FragColor = vec4(scene.rgb + glow, scene.a + (1.0 - scene.a) * haloAlpha);
      }
    `)
    this.quad = new FullScreenQuad(null)
  }

  setSize(width, height) {
    const scale = Math.min(0.25, 384 / Math.max(1, width, height))
    const w = Math.max(1, Math.floor(width * scale))
    const h = Math.max(1, Math.floor(height * scale))
    this.bright.setSize(w, h)
    this.blur.setSize(w, h)
  }

  render(renderer, writeBuffer, readBuffer) {
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    try {
      this.extractMaterial.uniforms.tScene.value = readBuffer.texture
      this.extractMaterial.uniforms.threshold.value = this.threshold
      this.quad.material = this.extractMaterial
      renderer.setRenderTarget(this.bright)
      this.quad.render(renderer)

      this.quad.material = this.blurMaterial
      this.blurMaterial.uniforms.tInput.value = this.bright.texture
      this.blurMaterial.uniforms.stepUv.value.set(1 / this.bright.width, 0)
      renderer.setRenderTarget(this.blur)
      this.quad.render(renderer)

      this.blurMaterial.uniforms.tInput.value = this.blur.texture
      this.blurMaterial.uniforms.stepUv.value.set(0, 1 / this.blur.height)
      renderer.setRenderTarget(this.bright)
      this.quad.render(renderer)

      this.combineMaterial.uniforms.tScene.value = readBuffer.texture
      this.combineMaterial.uniforms.strength.value = this.strength
      this.quad.material = this.combineMaterial
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
      this.quad.render(renderer)
    } finally {
      renderer.autoClear = autoClear
    }
  }

  dispose() {
    this.bright.dispose()
    this.blur.dispose()
    this.extractMaterial.dispose()
    this.blurMaterial.dispose()
    this.combineMaterial.dispose()
    this.quad.dispose()
  }
}

export default AuroraGlowPass
