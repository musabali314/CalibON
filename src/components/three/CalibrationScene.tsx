import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const BOARD_COLUMNS = 9;
const BOARD_ROWS = 6;
const SQUARE_SIZE = 0.34;

function CalibrationScene({ className = "" }: { className?: string }) {
  return (
    <div className={`calibration-scene ${className}`.trim()}>
      <Canvas
        camera={{ position: [5.9, 3.2, 8.2], fov: 42, near: 0.1, far: 100 }}
        dpr={[1, 1.7]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        shadows
      >
        <SceneCamera />
        <color attach="background" args={["#05080b"]} />
        <ambientLight intensity={0.86} />
        <directionalLight position={[5, 7, 5]} intensity={2.2} castShadow />
        <pointLight position={[-4, 2.5, 4]} intensity={13} distance={13} color="#70f2c2" />
        <pointLight position={[4, 0, 5]} intensity={11} distance={11} color="#7ab8ff" />
        <SceneRig />
        <Ground />
        <DecorativeRings />
      </Canvas>
      <div className="calibration-scene__vignette" aria-hidden="true" />
    </div>
  );
}

function SceneCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.lookAt(0.1, 0.05, -0.2);
  }, [camera]);

  return null;
}

function SceneRig() {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) {
      return;
    }

    const time = state.clock.getElapsedTime();
    ref.current.rotation.y = Math.sin(time * 0.22) * 0.035 + state.pointer.x * 0.025;
    ref.current.rotation.x = state.pointer.y * -0.012;
    ref.current.position.y = 0.12 + Math.sin(time * 0.48) * 0.04;
  });

  return (
    <group ref={ref}>
      <Checkerboard />
      <CameraBody />
      <ProjectionGeometry />
    </group>
  );
}

function Checkerboard() {
  const width = BOARD_COLUMNS * SQUARE_SIZE;
  const height = BOARD_ROWS * SQUARE_SIZE;
  const boardRef = useRef<THREE.Group>(null);
  const squares = useMemo(
    () =>
      Array.from({ length: BOARD_COLUMNS * BOARD_ROWS }, (_, index) => {
        const row = Math.floor(index / BOARD_COLUMNS);
        const column = index % BOARD_COLUMNS;

        return {
          id: `${row}-${column}`,
          light: (row + column) % 2 === 0,
          position: [
            column * SQUARE_SIZE - width / 2 + SQUARE_SIZE / 2,
            row * SQUARE_SIZE - height / 2 + SQUARE_SIZE / 2,
            0.035,
          ] as [number, number, number],
        };
      }),
    [height, width],
  );

  useFrame((state) => {
    if (!boardRef.current) {
      return;
    }

    const time = state.clock.getElapsedTime();
    boardRef.current.rotation.z = -0.07 + Math.sin(time * 0.38) * 0.018;
    boardRef.current.position.y = 0.36 + Math.sin(time * 0.55) * 0.04;
  });

  return (
    <group ref={boardRef} position={[-0.75, 0.36, -0.7]} rotation={[-0.08, 0.18, -0.07]}>
      <mesh position={[0, 0, -0.07]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.34, height + 0.34, 0.14]} />
        <meshStandardMaterial color="#162027" roughness={0.46} metalness={0.28} />
      </mesh>

      {squares.map((square) => (
        <mesh key={square.id} position={square.position} castShadow receiveShadow>
          <boxGeometry args={[SQUARE_SIZE, SQUARE_SIZE, 0.035]} />
          <meshStandardMaterial color={square.light ? "#edf2f2" : "#11171b"} roughness={0.5} />
        </mesh>
      ))}

      <CornerGrid />
    </group>
  );
}

function CornerGrid() {
  const points = useMemo(
    () =>
      Array.from({ length: 40 }, (_, index) => {
        const row = Math.floor(index / 8);
        const column = index % 8;
        return [
          column * SQUARE_SIZE - 1.19,
          row * SQUARE_SIZE - 0.68,
          0.078,
        ] as [number, number, number];
      }),
    [],
  );

  return (
    <group>
      {points.map((position, index) => (
        <PulsingCorner key={index} position={position} phase={index * 0.17} />
      ))}
    </group>
  );
}

function PulsingCorner({
  position,
  phase,
}: {
  position: [number, number, number];
  phase: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) {
      return;
    }

    ref.current.scale.setScalar(
      0.84 + Math.sin(state.clock.getElapsedTime() * 2.25 + phase) * 0.13,
    );
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.034, 14, 14]} />
      <meshStandardMaterial
        color="#70f2c2"
        emissive="#70f2c2"
        emissiveIntensity={2.4}
        toneMapped={false}
      />
    </mesh>
  );
}

function CameraBody() {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) {
      return;
    }

    const time = state.clock.getElapsedTime();
    ref.current.position.y = -0.02 + Math.sin(time * 0.68) * 0.055;
    ref.current.rotation.z = 0.015 + Math.sin(time * 0.42) * 0.018;
  });

  return (
    <group
      ref={ref}
      position={[2.65, -0.02, 1.45]}
      rotation={[-0.08, 0.5, 0.015]}
    >
      <mesh castShadow>
        <boxGeometry args={[1.52, 1.02, 0.78]} />
        <meshStandardMaterial color="#11191f" roughness={0.29} metalness={0.72} />
      </mesh>

      <mesh position={[0, 0, 0.54]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.39, 0.46, 0.58, 48]} />
        <meshStandardMaterial color="#172229" roughness={0.19} metalness={0.82} />
      </mesh>

      <mesh position={[0, 0, 0.86]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.285, 0.325, 0.09, 48]} />
        <meshPhysicalMaterial
          color="#071117"
          roughness={0.08}
          metalness={0.32}
          clearcoat={1}
          clearcoatRoughness={0.08}
        />
      </mesh>

      <mesh position={[0, 0, 0.92]}>
        <circleGeometry args={[0.205, 48]} />
        <meshStandardMaterial
          color="#6bb8f8"
          emissive="#21669f"
          emissiveIntensity={1.65}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[-0.32, 0.61, -0.06]} castShadow>
        <boxGeometry args={[0.58, 0.2, 0.28]} />
        <meshStandardMaterial color="#1b252c" roughness={0.32} metalness={0.62} />
      </mesh>

      <mesh position={[0.5, 0.25, 0.42]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial
          color="#70f2c2"
          emissive="#70f2c2"
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function ProjectionGeometry() {
  const origin = useMemo(() => new THREE.Vector3(2.95, -0.01, 2.25), []);
  const targets = useMemo(
    () => [
      new THREE.Vector3(-2.15, -0.63, -0.38),
      new THREE.Vector3(0.65, -0.63, -0.91),
      new THREE.Vector3(0.65, 1.34, -0.91),
      new THREE.Vector3(-2.15, 1.34, -0.38),
    ],
    [],
  );

  return (
    <group>
      {targets.map((target, index) => (
        <Beam
          key={`ray-${index}`}
          start={origin}
          end={target}
          radius={0.006}
          color="#70f2c2"
          opacity={0.24}
        />
      ))}
      {targets.map((target, index) => (
        <Beam
          key={`edge-${index}`}
          start={target}
          end={targets[(index + 1) % targets.length]}
          radius={0.005}
          color="#70f2c2"
          opacity={0.25}
        />
      ))}
    </group>
  );
}

function Beam({
  start,
  end,
  radius,
  color,
  opacity,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  color: string;
  opacity: number;
}) {
  const transform = useMemo(() => {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );

    return { length, midpoint, quaternion };
  }, [end, start]);

  return (
    <mesh position={transform.midpoint} quaternion={transform.quaternion}>
      <cylinderGeometry args={[radius, radius, transform.length, 8]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Ground() {
  return (
    <group position={[0, -1.25, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#05080b" roughness={0.9} metalness={0.15} />
      </mesh>
      <gridHelper args={[20, 30, "#173c35", "#102228"]} position={[0, 0.005, 0]} />
    </group>
  );
}

function DecorativeRings() {
  return (
    <group position={[0, 0.12, -1.2]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <torusGeometry args={[3.75, 0.007, 8, 128]} />
        <meshBasicMaterial color="#70f2c2" transparent opacity={0.15} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[4.45, 0.006, 8, 128]} />
        <meshBasicMaterial color="#7ab8ff" transparent opacity={0.09} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default CalibrationScene;
