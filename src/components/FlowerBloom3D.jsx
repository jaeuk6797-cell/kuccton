// 꽃(또는 사물 소리의 나무) 하나가 3D로 피어나는 작은 화면 (녹음 미리보기·꽃 상세용)
// 정원과 같은 flower3d.js로 그리고, 나타나면 꽃잎이 바깥 겹부터 펼쳐진 뒤 천천히 돈다.
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { buildFlower3D, disposeFlower3D } from '../lib/flower3d.js'
import { buildBlenderFlower, useBlenderFlowerAssets } from '../lib/blenderFlower.js'
import { createGardenEnvironment } from '../lib/gardenEnvironment.js'
import { useGardenTheme } from '../lib/gardenTheme.jsx'
import { normalizeGardenTheme } from '../lib/gardenThemeStorage.js'
import { isBlenderGardenFlower } from '../lib/plantAppearance.js'
import { buildTree3D } from '../lib/tree3d.js'
import { isTree } from '../lib/tree.js'

export default function FlowerBloom3D({ flower, colors, pair = false, bloom = true, size = 180, blender = isBlenderGardenFlower(flower), closeUp = false, tone: explicitTone, previewTime }) {
  const wrapRef = useRef(null)
  const engineRef = useRef(null)
  const { tone: personalTone } = useGardenTheme()
  const tone = normalizeGardenTheme(explicitTone ?? personalTone)
  const palette = colors || [flower.color]
  const tree = !pair && !colors && isTree(flower)
  const assets = useBlenderFlowerAssets(blender && !pair && !tree)
  const animationRef = useRef({ bloom, previewTime })
  animationRef.current = { bloom, previewTime }
  // 꽃 모양이 바뀔 때만(예: 감정을 다시 고름) 새로 피운다
  const shapeKey = JSON.stringify([palette, flower.category, flower.petals, flower.vowel, flower.consonant, flower.lengths, flower.rms, flower.root, pair, tree])

  // One renderer and clock per mounted preview. Changing a theme never restarts growth.
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    wrap.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
    const engine = { renderer, scene, camera, obj: null, environment: null, lights: null, started: performance.now(), shapeKey: null, tone: null }
    engineRef.current = engine
    let raf
    engine.render = () => {
      if (!engine.obj) return
      const { bloom: animateBloom, previewTime: fixedTime } = animationRef.current
      const t = fixedTime ?? (performance.now() - engine.started) / 1000
      const grow = animateBloom ? Math.min(1, t / 1.2) : 1
      engine.obj.scale.setScalar(0.3 + 0.7 * (1 - (1 - grow) ** 3))
      engine.obj.userData.setOpen?.(animateBloom ? Math.min(1, Math.max(0, (t - 0.2) / 1.8)) : 1)
      engine.obj.userData.tick?.(t)
      engine.obj.rotation.y = t * 0.35
      renderer.render(scene, camera)
    }
    const loop = () => {
      if (animationRef.current.previewTime == null) engine.render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      if (engine.obj) disposeFlower3D(engine.obj)
      engine.environment?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      engineRef.current = null
    }
  }, [])

  useLayoutEffect(() => {
    const engine = engineRef.current
    const { renderer, camera, scene } = engine
    const h = Math.round(size * 1.1)
    renderer.setSize(size, h)
    camera.aspect = size / h
    camera.fov = closeUp ? 25 : 32
    camera.updateProjectionMatrix()
    if (tree) {
      camera.position.set(0, 0.95, 3.1) // 나무는 키가 커서 조금 뒤에서 전체를 본다
      camera.lookAt(0, 0.68, 0)
    } else {
      camera.position.set(0, 1.45, 1.4) // 꽃송이가 화면을 채우고 꽃잎 안쪽이 보이도록 위에서 비스듬히
      camera.lookAt(0, 0.5, 0)
    }
    if (engine.tone !== tone) {
      const aurora = tone === 'aurora'
      const balanced = tone === 'balanced'
      const warm = tone !== 'default'
      const nextEnvironment = createGardenEnvironment(renderer, 64, tone)
      const lights = new THREE.Group()
      lights.add(new THREE.HemisphereLight(
        aurora ? '#f4d1e6' : balanced ? '#f5edda' : warm ? '#f6dfd8' : '#e3eaff',
        aurora ? '#aa8b9d' : balanced ? '#89917b' : warm ? '#94747f' : '#8f838c',
        aurora ? 0.76 : 0.65,
      ))
      const sun = new THREE.DirectionalLight(aurora ? '#ffe8d6' : '#fff1dc', aurora ? 1.5 : 1.55)
      sun.position.set(1.5, 3, 2)
      lights.add(sun)
      if (aurora) {
        const cyanRim = new THREE.DirectionalLight('#addbdc', 0.4)
        cyanRim.position.set(-2, 1, -1)
        const roseRim = new THREE.DirectionalLight('#efabc9', 0.44)
        roseRim.position.set(2, 0.5, -2)
        lights.add(cyanRim, roseRim)
      }
      scene.environment = nextEnvironment.texture
      scene.environmentIntensity = aurora ? 0.6 : 0.55
      scene.add(lights)
      if (engine.lights) scene.remove(engine.lights)
      engine.environment?.dispose()
      engine.environment = nextEnvironment
      engine.lights = lights
    }

    if (engine.shapeKey !== shapeKey || engine.tone !== tone || engine.assets !== assets) {
      const next = assets ? buildBlenderFlower(flower, assets, { detail: true, tone })
        : tree ? buildTree3D(flower, { tone }) : buildFlower3D(flower, palette, { pair, tone })
      // Assets and palette are ready before removing the previous visible object.
      const previous = engine.obj
      scene.add(next)
      engine.obj = next
      if (engine.shapeKey !== shapeKey) engine.started = performance.now()
      engine.shapeKey = shapeKey
      engine.assets = assets
      engine.tone = tone
      if (previous) { scene.remove(previous); disposeFlower3D(previous) }
    }
    wrapRef.current.dataset.flora = assets ? 'blender' : tree ? 'tree' : pair ? 'pair' : 'procedural'
    wrapRef.current.dataset.tone = tone
    engine.render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey, size, bloom, closeUp, assets, tone, previewTime])

  return <div ref={wrapRef} className="bloom3d" style={{ width: size, height: Math.round(size * 1.1) }} aria-hidden="true" />
}
