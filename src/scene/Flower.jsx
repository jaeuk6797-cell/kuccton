/**
 * @param {{ flower: import('../contracts/flower.js').Flower, position: [number, number, number], onSelect?: (id: string) => void }} props
 */
export default function Flower({ flower, position, onSelect }) {
  const { color, size } = flower.appearance

  return (
    <group
      position={position}
      scale={size}
      onClick={onSelect && (() => onSelect(flower.id))}
    >
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 0.9, 8]} />
        <meshStandardMaterial color="#3f7051" />
      </mesh>
      <mesh position={[0, 0.93, 0]} scale={[1, 0.62, 1]}>
        <sphereGeometry args={[0.34, 10, 6]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.13, 8, 6]} />
        <meshStandardMaterial color="#ffd68a" />
      </mesh>
    </group>
  )
}
