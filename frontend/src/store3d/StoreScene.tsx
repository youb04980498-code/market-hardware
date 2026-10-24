import { useEffect, useRef, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Billboard,
  Instances,
  OrbitControls,
  RoundedBox,
} from "@react-three/drei";
import { Group, PCFShadowMap } from "three";
import { Block, Hardware, Sign } from "./geometry";
import { GraphicsLifecycle } from "./GraphicsLifecycle";
import { departments, poseAt, shoppers } from "./simulation";
import type { Department, Selection, Shopper } from "./simulation";
import type { WorldOrder } from "./worldModel";
import { canRepresentCheckout, stageColors } from "./worldModel";

export function Plant({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.23, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.2, 0.46, 10]} />
        <meshStandardMaterial color="#cbbda9" />
      </mesh>
      <mesh position={[0, 0.47, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.03, 10]} />
        <meshStandardMaterial color="#6b5947" />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <group key={i} rotation={[0, i * 2.4, 0]}>
          <mesh
            position={[0.16, 0.85, 0]}
            scale={[0.12, 0.45, 0.17]}
            rotation={[0, 0, -0.5]}
            castShadow
          >
            <sphereGeometry args={[1, 6, 4]} />
            <meshStandardMaterial
              color={i % 2 ? "#63927c" : "#87a88a"}
              roughness={1}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.81, 0]} scale={[0.33, 0.5, 0.33]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#759880" />
      </mesh>
    </group>
  );
}

export function DepartmentIsland({
  item,
  selected,
  onSelect,
}: {
  item: Department;
  selected: boolean;
  onSelect: (s: Selection) => void;
}) {
  return (
    <group
      position={[item.x, 0, item.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "shelf", id: item.id });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <RoundedBox
        args={[2.8, 0.28, 1.5]}
        radius={0.1}
        smoothness={2}
        position={[0, 0.2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={selected ? "#bbd7cb" : "#d6cbbd"} />
      </RoundedBox>
      <Block
        size={[2.65, 0.48, 1.25]}
        position={[0, 0.52, 0]}
        color="#f6f1e7"
      />
      <Block size={[2.72, 0.1, 1.38]} position={[0, 0.82, 0]} color="#d4b28e" />
      {[-1.22, 1.22].map((x) => (
        <Block
          key={x}
          size={[0.085, 1.65, 0.12]}
          position={[x, 1.46, -0.46]}
          color="#344654"
        />
      ))}
      <Block
        size={[2.6, 0.12, 0.9]}
        position={[0, 1.66, -0.1]}
        color="#e8dfd1"
      />
      <Block
        size={[2.6, 0.09, 0.85]}
        position={[0, 2.23, -0.1]}
        color="#344654"
      />
      <Block
        size={[2.6, 0.3, 0.11]}
        position={[0, 2.4, -0.4]}
        color={item.color}
      />
      <Sign
        text={item.short}
        width={2.3}
        height={0.29}
        position={[0, 2.405, -0.335]}
        color={item.color}
        ink="#182d37"
      />
      {[0, 1].map((level) =>
        [-0.84, -0.28, 0.28, 0.84].map((x, i) => (
          <group
            key={`${level}-${i}`}
            position={[x, level === 0 ? 1.12 : 1.94, -0.14]}
          >
            <Block
              size={[0.41, 0.44, 0.34]}
              color={i % 2 ? "#e9e4da" : item.color}
            />
            <Block
              size={[0.32, 0.025, 0.01]}
              position={[0, 0.12, 0.176]}
              color="#f8f4e8"
            />
            <Block
              size={[0.18, 0.18, 0.012]}
              position={[0, -0.015, 0.178]}
              color="#3b4a58"
            />
            <Block
              size={[0.26, 0.018, 0.012]}
              position={[0, -0.15, 0.179]}
              color={i % 2 ? item.color : "#f8f4e8"}
            />
          </group>
        )),
      )}
      <group position={[0, 0.57, 0.655]} scale={0.64}>
        <Hardware kind={item.id} />
      </group>
      <Sign
        text="EXPLORE THE COLLECTION"
        width={1.35}
        height={0.14}
        position={[0, 0.31, 0.637]}
        ink="#5d6570"
      />
      {selected && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.65, 1.7, 48]} />
          <meshBasicMaterial color="#477a66" />
        </mesh>
      )}
    </group>
  );
}

function ShoppingCart() {
  return (
    <group position={[0, 0, 0.7]}>
      {[-0.24, 0.24].map((x) =>
        [-0.28, 0.28].map((z) => (
          <mesh
            key={`${x}-${z}`}
            position={[x, 0.13, z]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.085, 0.085, 0.06, 8]} />
            <meshStandardMaterial color="#34414c" />
          </mesh>
        )),
      )}
      <Block
        size={[0.48, 0.05, 0.62]}
        position={[0, 0.29, 0]}
        color="#667e83"
      />
      {[-0.25, 0.25].map((x) => (
        <group key={x}>
          <Block
            size={[0.035, 0.52, 0.035]}
            position={[x, 0.48, -0.29]}
            color="#738d91"
          />
          <Block
            size={[0.035, 0.34, 0.035]}
            position={[x, 0.58, 0.3]}
            color="#738d91"
          />
          {[0.47, 0.62, 0.77].map((y) => (
            <Block
              key={y}
              size={[0.025, 0.025, 0.6]}
              position={[x, y, 0]}
              color="#8da3a5"
            />
          ))}
          {[-0.15, 0, 0.15].map((z) => (
            <Block
              key={z}
              size={[0.025, 0.33, 0.025]}
              position={[x, 0.61, z]}
              color="#8da3a5"
            />
          ))}
        </group>
      ))}
      {[0.46, 0.62, 0.77].map((y) => (
        <Block
          key={y}
          size={[0.52, 0.025, 0.025]}
          position={[0, y, 0.31]}
          color="#8da3a5"
        />
      ))}
      <Block
        size={[0.56, 0.055, 0.065]}
        position={[0, 0.82, -0.3]}
        color="#bd8d61"
      />
      <Block
        size={[0.3, 0.26, 0.3]}
        position={[0, 0.5, 0.05]}
        color="#b7acd2"
      />
      <Block
        size={[0.24, 0.18, 0.21]}
        position={[0.08, 0.67, 0.06]}
        color="#e1ba7f"
      />
    </group>
  );
}

export function Character({
  shopper,
  time,
  paused,
  selected,
  onSelect,
  transition = false,
  label = "SIMULATED SHOPPER",
}: {
  shopper: Shopper;
  time: React.RefObject<number>;
  paused: boolean;
  selected: boolean;
  onSelect: (s: Selection) => void;
  transition?: boolean;
  label?: string;
}) {
  const body = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const start = useRef(poseAt(shopper, 0)).current;
  useFrame((_, delta) => {
    if (!body.current || paused) return;
    const pose = poseAt(shopper, time.current);
    if (transition) {
      body.current.position.x +=
        (pose.x - body.current.position.x) * Math.min(delta * 3, 1);
      body.current.position.z +=
        (pose.z - body.current.position.z) * Math.min(delta * 3, 1);
    } else
      body.current.position.set(
        pose.x,
        pose.moving ? Math.sin(time.current * 8) * 0.016 : 0,
        pose.z,
      );
    const difference = Math.atan2(
      Math.sin(pose.angle - body.current.rotation.y),
      Math.cos(pose.angle - body.current.rotation.y),
    );
    body.current.rotation.y += difference * Math.min(delta * 7, 1);
    const swing = pose.moving
      ? Math.sin(time.current * 7 + shopper.phase) * 0.42
      : Math.sin(time.current * 1.5 + shopper.phase) * 0.035;
    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = swing;
      rightLeg.current.rotation.x = -swing;
    }
    if (leftArm.current && rightArm.current) {
      leftArm.current.rotation.x =
        shopper.activity === "Cart" ? -0.65 : -swing * 0.7;
      rightArm.current.rotation.x =
        shopper.activity === "Cart" ? -0.65 : swing * 0.7;
    }
  });
  return (
    <group
      ref={body}
      position={[start.x, 0, start.z]}
      rotation={[0, start.angle, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "customer", id: shopper.id });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[selected ? 0.43 : 0.27, 24]} />
        <meshBasicMaterial
          color={selected ? "#4e8b73" : "#8f8c80"}
          transparent
          opacity={selected ? 0.65 : 0.16}
          depthWrite={false}
        />
      </mesh>
      <group ref={leftLeg} position={[-0.115, 0.56, 0]}>
        <Block
          size={[0.16, 0.44, 0.18]}
          position={[0, -0.2, 0]}
          color="#37424f"
        />
        <Block
          size={[0.19, 0.11, 0.3]}
          position={[0, -0.45, 0.055]}
          color="#f4eee1"
        />
      </group>
      <group ref={rightLeg} position={[0.115, 0.56, 0]}>
        <Block
          size={[0.16, 0.44, 0.18]}
          position={[0, -0.2, 0]}
          color="#37424f"
        />
        <Block
          size={[0.19, 0.11, 0.3]}
          position={[0, -0.45, 0.055]}
          color="#f4eee1"
        />
      </group>
      <mesh position={[0, 0.79, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.18, 0.49, 6]} />
        <meshStandardMaterial color={shopper.color} flatShading />
      </mesh>
      <Block
        size={[0.08, 0.15, 0.03]}
        position={[0, 0.95, 0.2]}
        color="#eee5d6"
      />
      {[-1, 1].map((n, i) => (
        <group
          key={n}
          ref={i === 0 ? leftArm : rightArm}
          position={[n * 0.255, 0.96, 0]}
        >
          <mesh position={[0, -0.14, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.23, 2, 5]} />
            <meshStandardMaterial color={shopper.color} flatShading />
          </mesh>
          <mesh position={[0, -0.34, 0.015]} castShadow>
            <sphereGeometry args={[0.078, 6, 5]} />
            <meshStandardMaterial color={shopper.skin} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.25, 0]} castShadow>
        <dodecahedronGeometry args={[0.23, 0]} />
        <meshStandardMaterial color={shopper.skin} flatShading />
      </mesh>
      <mesh position={[0, 1.37, -0.025]} rotation={[0.1, 0, 0]} castShadow>
        <sphereGeometry
          args={[0.235, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.58]}
        />
        <meshStandardMaterial color={shopper.hair} flatShading />
      </mesh>
      {[-0.075, 0.075].map((x) => (
        <mesh key={x} position={[x, 1.27, 0.2]}>
          <sphereGeometry args={[0.019, 5, 4]} />
          <meshBasicMaterial color="#3a3431" />
        </mesh>
      ))}
      {shopper.activity === "Cart" && <ShoppingCart />}
      {selected && (
        <Billboard position={[0, 1.9, 0]}>
          <Sign
            text={shopper.name.toUpperCase()}
            sub={label}
            width={1.6}
            height={0.42}
            color="#28493e"
            ink="#ffffff"
          />
        </Billboard>
      )}
    </group>
  );
}

export function Register({
  z,
  number,
  x = 7.2,
}: {
  z: number;
  number: string;
  x?: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <RoundedBox
        args={[1.7, 0.95, 0.9]}
        position={[0, 0.51, 0]}
        radius={0.09}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#f2eadb" />
      </RoundedBox>
      <Block
        size={[1.85, 0.12, 1.02]}
        position={[0, 1.04, 0]}
        color="#344957"
      />
      <Block
        size={[0.45, 0.3, 0.03]}
        position={[-0.35, 1.38, 0]}
        rotation={[-0.2, 0, 0]}
        color="#243340"
      />
      <Block
        size={[0.38, 0.22, 0.025]}
        position={[-0.35, 1.38, 0.03]}
        rotation={[-0.2, 0, 0]}
        color="#9ecbc1"
      />
      <Block
        size={[0.08, 0.3, 0.08]}
        position={[-0.35, 1.18, 0]}
        color="#243340"
      />
      <Block
        size={[0.27, 0.09, 0.21]}
        position={[0.44, 1.15, 0.18]}
        rotation={[0.2, 0, 0]}
        color="#7f9997"
      />
      <Sign
        text={`CHECKOUT ${number}`}
        width={1.5}
        height={0.25}
        position={[0, 0.6, 0.46]}
      />
      <Block
        size={[0.045, 1.5, 0.045]}
        position={[0.74, 1.6, -0.25]}
        color="#667b7d"
      />
      <Sign
        text={number}
        width={0.4}
        height={0.35}
        position={[0.74, 2.4, -0.22]}
        color="#7da491"
        ink="#142e29"
      />
      <group position={[0, 0, -0.85]}>
        <mesh position={[0, 0.84, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.18, 0.5, 6]} />
          <meshStandardMaterial color="#364c59" />
        </mesh>
        <mesh position={[0, 1.25, 0]} castShadow>
          <dodecahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#d6a786" />
        </mesh>
        <mesh position={[0, 1.43, 0]}>
          <cylinderGeometry args={[0.23, 0.23, 0.12, 8]} />
          <meshStandardMaterial color="#364c59" />
        </mesh>
      </group>
    </group>
  );
}

export function Interior({
  withCheckout = true,
}: { withCheckout?: boolean } = {}) {
  return (
    <group>
      <RoundedBox
        args={[19, 0.55, 14]}
        position={[0, -0.4, 0.2]}
        radius={0.2}
        smoothness={3}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#d3c8b5" />
      </RoundedBox>
      <Block
        size={[18.4, 0.12, 12.5]}
        position={[0, -0.06, 0]}
        color="#ece4d5"
      />
      {Array.from({ length: 13 }, (_, i) => (
        <Block
          key={`x${i}`}
          size={[0.017, 0.009, 12.5]}
          position={[-9 + i * 1.5, 0.007, 0]}
          color="#d7cebe"
        />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <Block
          key={`z${i}`}
          size={[18.4, 0.009, 0.017]}
          position={[0, 0.007, -6 + i * 1.5]}
          color="#d7cebe"
        />
      ))}
      <Block
        size={[18.6, 3.65, 0.24]}
        position={[0, 1.8, -6.25]}
        color="#f0ede3"
      />
      <Block
        size={[0.24, 3.65, 12.65]}
        position={[-9.3, 1.8, 0]}
        color="#e6e6d9"
      />
      <Block
        size={[18.6, 0.15, 0.35]}
        position={[0, 3.64, -6.25]}
        color="#d0d2c5"
      />
      <Block
        size={[0.35, 0.15, 12.65]}
        position={[-9.3, 3.64, 0]}
        color="#d0d2c5"
      />
      <Block
        size={[18.4, 0.18, 0.06]}
        position={[0, 0.14, -6.1]}
        color="#c8bb9e"
      />
      <Block
        size={[0.06, 0.18, 12.4]}
        position={[-9.16, 0.14, 0]}
        color="#c8bb9e"
      />
      <Block
        size={[7.6, 1.33, 0.08]}
        position={[-1, 2.5, -6.08]}
        color="#2e4652"
      />
      <Sign
        text="MARKET HARDWARE"
        sub="GOOD PARTS. GREAT POSSIBILITIES."
        width={6.6}
        height={1.04}
        position={[-1, 2.5, -6.025]}
        color="#2e4652"
        ink="#f8f0db"
      />
      {[-3.6, 0.1, 3.7].map((z) => (
        <group
          key={z}
          position={[-9.15, 2.1, z]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <Block size={[2.7, 1.9, 0.07]} color="#c0d8d5" />
          <Block
            size={[2.8, 0.075, 0.1]}
            position={[0, 0.97, 0.05]}
            color="#faf7ec"
          />
          <Block
            size={[2.8, 0.075, 0.1]}
            position={[0, -0.97, 0.05]}
            color="#faf7ec"
          />
          {[-1.35, 0, 1.35].map((x) => (
            <Block
              key={x}
              size={[0.06, 1.95, 0.1]}
              position={[x, 0, 0.05]}
              color="#faf7ec"
            />
          ))}
          <Block
            size={[2.9, 0.1, 0.3]}
            position={[0, -1.02, 0.12]}
            color="#d4c6af"
          />
        </group>
      ))}
      <Sign
        text="FIND YOUR NEXT UPGRADE"
        width={2.6}
        height={0.4}
        position={[6.5, 2.9, -6.1]}
        ink="#54796c"
      />
      <Block
        size={[2.65, 0.95, 0.65]}
        position={[6.8, 0.55, -5.6]}
        color="#d7b68c"
      />
      <group position={[6.8, 1.5, -5.6]}>
        <Hardware kind="builds" />
      </group>
      {withCheckout && (
        <>
          <Register z={-0.3} number="01" />
          <Register z={-3.9} number="02" />
        </>
      )}
      <Block
        size={[18.5, 0.12, 1.8]}
        position={[0, -0.07, 7.15]}
        color="#c4cfc8"
      />
      <Block
        size={[3.3, 0.025, 1.4]}
        position={[6.1, 0.035, 5.55]}
        color="#7da38f"
      />
      <Sign
        text="WELCOME IN"
        width={2.5}
        height={0.55}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[6.1, 0.055, 5.55]}
        color="#7da38f"
        ink="#183a30"
      />
      {[-8.2, 3.9, 8.4].map((x) => (
        <Plant key={x} position={[x, 0, 5.4]} scale={0.75} />
      ))}
      <Plant position={[-8.1, 0, -5.1]} scale={0.9} />
      <Block
        size={[2.6, 0.28, 0.7]}
        position={[-5.6, 0.38, 6.9]}
        color="#b58d64"
      />
      {[-6.5, -4.7].map((x) => (
        <Block
          key={x}
          size={[0.12, 0.45, 0.58]}
          position={[x, 0.15, 6.9]}
          color="#44594f"
        />
      ))}
      {[5, 7.8].map((x) => (
        <Block
          key={x}
          size={[0.1, 1.6, 0.1]}
          position={[x, 0.8, 6.3]}
          color="#466358"
        />
      ))}
      <Sign
        text="MARKET"
        width={2.8}
        height={0.6}
        position={[6.4, 1.7, 6.3]}
        color="#466358"
        ink="#fff7df"
      />
      {[-5.3, -1.1, 3.1].map((x) => (
        <group key={x} position={[x, 3.1, -3.9]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.16, 0.5, 0.27, 12]} />
            <meshStandardMaterial color="#d2b281" />
          </mesh>
          <mesh position={[0, -0.14, 0]}>
            <circleGeometry args={[0.42, 16]} />
            <meshStandardMaterial
              color="#fff4cf"
              emissive="#ffe6b1"
              emissiveIntensity={0.35}
              side={2}
            />
          </mesh>
          <Block
            size={[0.025, 0.6, 0.025]}
            position={[0, 0.4, 0]}
            color="#516057"
          />
        </group>
      ))}
    </group>
  );
}

export function CameraRig({
  reset,
  onReady,
}: {
  reset: number;
  onReady: () => void;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(19, 20, 24);
    camera.zoom = Math.min(size.width / 27, size.height / 20);
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0.3, 0.4);
    controls.current?.update();
    invalidate();
  }, [reset, size.width, size.height, camera, invalidate]);
  useEffect(() => {
    onReady();
  }, [onReady, reset]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 0.3, 0.4]}
      enableDamping
      dampingFactor={0.09}
      minZoom={14}
      maxZoom={105}
      minPolarAngle={0.3}
      maxPolarAngle={Math.PI / 2.25}
    />
  );
}

function World({
  paused,
  selection,
  onSelect,
  businessOrders,
  onOrderSelect,
}: {
  paused: boolean;
  selection: Selection;
  onSelect: (s: Selection) => void;
  businessOrders?: WorldOrder[];
  onOrderSelect?: (id: number) => void;
}) {
  const time = useRef(0);
  useFrame((_, delta) => {
    if (!paused) time.current += Math.min(delta, 0.05);
  });
  return (
    <>
      <ambientLight intensity={1.1} color="#f2f5ff" />
      <hemisphereLight args={["#f6f4e8", "#9bada7", 1.4]} />
      <directionalLight
        castShadow
        position={[-5, 16, 8]}
        intensity={2.5}
        color="#fff1d8"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-normalBias={0.03}
        shadow-bias={-0.00015}
      />
      <directionalLight
        position={[10, 8, -5]}
        intensity={0.8}
        color="#dce5ff"
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.72, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#e1e6de" roughness={1} />
      </mesh>
      <Interior />
      {departments.map((item) => (
        <DepartmentIsland
          key={item.id}
          item={item}
          selected={selection?.kind === "shelf" && selection.id === item.id}
          onSelect={onSelect}
        />
      ))}
      {businessOrders
        ?.filter((o) => canRepresentCheckout(o.status))
        .slice(0, 8)
        .map((order, i) => {
          const leaving = ["PAID", "CANCELLED", "REFUNDED"].includes(
            order.status,
          );
          const shopper: Shopper = {
            id: String(order.order_id),
            name: `Order #${order.order_id}`,
            activity: "Checkout Queue",
            color: stageColors[order.status] ?? "#82968d",
            skin: "#c4b29a",
            hair: "#53605c",
            speed: 0,
            phase: 0,
            path: [
              [
                leaving ? 5.4 + (i % 3) * 0.8 : 7.2,
                leaving ? 5.1 : 1.3 + (i % 3) * 1.15,
              ],
            ],
          };
          return (
            <Character
              key={`order-${order.order_id}`}
              shopper={shopper}
              time={time}
              paused={paused}
              selected={
                selection?.kind === "customer" && selection.id === shopper.id
              }
              label={`${order.status} / RECORDED ORDER`}
              transition
              onSelect={() => onOrderSelect?.(order.order_id)}
            />
          );
        })}
      {businessOrders === undefined &&
        shoppers.map((shopper) => (
          <Character
            key={shopper.id}
            shopper={shopper}
            time={time}
            paused={paused}
            selected={
              selection?.kind === "customer" && selection.id === shopper.id
            }
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export default function StoreScene({
  paused,
  reset,
  selection,
  onSelect,
  onReady,
  onLost,
  businessOrders,
  onOrderSelect,
}: {
  paused: boolean;
  reset: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onReady: () => void;
  onLost: () => void;
  businessOrders?: WorldOrder[];
  onOrderSelect?: (id: number) => void;
}) {
  return (
    <Canvas
      orthographic
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 1.5]}
      camera={{ position: [19, 20, 24], zoom: 35, near: 0.1, far: 200 }}
      frameloop={paused ? "demand" : "always"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#e1e6de");
      }}
      onPointerMissed={() => onSelect(null)}
      fallback={
        <div className="mini-fallback" role="alert">
          WebGL is unavailable. Enable hardware acceleration and reload this
          page.
        </div>
      }
    >
      <GraphicsLifecycle onLost={onLost} />
      <Instances limit={1500} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.72} />
        <World
          paused={paused}
          selection={selection}
          onSelect={onSelect}
          businessOrders={businessOrders}
          onOrderSelect={onOrderSelect}
        />
      </Instances>
      <CameraRig reset={reset} onReady={onReady} />
    </Canvas>
  );
}
