import { Canvas } from '@react-three/fiber'
import Flower from './Flower.jsx'
import Island from './Island.jsx'

/**
 * @param {{ flowers: import('../contracts/flower.js').Flower[], onFlowerSelect?: (id: string) => void }} props
 */
export default function GardenScene({ flowers, onFlowerSelect }) {
  return (
    <section className="garden" aria-label="떠 있는 정원">
      <Canvas
        camera={{ position: [3.2, 3, 6.5], fov: 45, near: 0.1, far: 30 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        fallback={<p className="garden-fallback">3D 정원을 보려면 WebGL이 필요해요.</p>}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 2]} intensity={2} />
        <Island />
        {flowers.map((flower, index) => (
          <Flower
            key={flower.id}
            flower={flower}
            position={[index * 0.35, 0.11, 0]}
            onSelect={onFlowerSelect}
          />
        ))}
      </Canvas>
    </section>
  )
}
