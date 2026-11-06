// 꽃(또는 사물 소리의 나무) 하나가 3D로 피어나는 작은 화면 (녹음 미리보기·꽃 상세용)
// 정원과 같은 flower3d.js로 그리고, 나타나면 꽃잎이 바깥 겹부터 펼쳐진 뒤 천천히 돈다.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { buildFlower3D, disposeFlower3D } from '../lib/flower3d.js'
import { buildTree3D } from '../lib/tree3d.js'
import { isTree } from '../lib/tree.js'

export default function FlowerBloom3D({ flower, colors, pair = false, size = 180 }) {
  const wrapRef = useRef(null)
  const palette = colors || [flower.color]
  const tree = !pair && !colors && isTree(flower)
  // 꽃 모양이 바뀔 때만(예: 감정을 다시 고름) 새로 피운다
  const shapeKey = JSON.stringify([palette, flower.petals, flower.vowel, flower.consonant, flower.lengths, flower.rms, flower.root, pair, tree])

  useEffect(() => {
    const wrap = wrapRef.current
    const w = size
    const h = Math.round(size * 1.1)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    wrap.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 50)
    if (tree) {
      camera.position.set(0, 0.95, 3.1) // 나무는 키가 커서 조금 뒤에서 전체를 본다
      camera.lookAt(0, 0.68, 0)
    } else {
      camera.position.set(0, 1.45, 1.4) // 꽃송이가 화면을 채우고 꽃잎 안쪽이 보이도록 위에서 비스듬히
      camera.lookAt(0, 0.5, 0)
    }
    scene.add(new THREE.HemisphereLight('#ffffff', '#c9b9a8', 1.6))
    const sun = new THREE.DirectionalLight('#fff1dc', 2)
    sun.position.set(1.5, 3, 2)
    scene.add(sun)

    const obj = tree ? buildTree3D(flower) : buildFlower3D(flower, palette, { pair })
    scene.add(obj)

    const clock = new THREE.Clock()
    let raf
    const loop = () => {
      const t = clock.getElapsedTime()
      const grow = Math.min(1, t / 1.2)
      obj.scale.setScalar(0.3 + 0.7 * (1 - (1 - grow) ** 3))
      obj.userData.setOpen?.(Math.min(1, Math.max(0, (t - 0.2) / 1.8)))
      obj.userData.tick?.(t)
      obj.rotation.y = t * 0.35
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      disposeFlower3D(obj)
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey, size])

  return <div ref={wrapRef} className="bloom3d" style={{ width: size, height: Math.round(size * 1.1) }} aria-hidden="true" />
}
