export default function Island() {
  return (
    <group>
      <mesh position={[0, -0.58, 0]}>
        <cylinderGeometry args={[1.05, 0.4, 1, 8]} />
        <meshStandardMaterial color="#3d5754" flatShading />
      </mesh>
      <mesh>
        <cylinderGeometry args={[1.1, 1.05, 0.22, 8]} />
        <meshStandardMaterial color="#8da78b" flatShading />
      </mesh>
    </group>
  )
}
