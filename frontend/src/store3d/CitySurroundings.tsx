import { Roofline } from "./ArchitectureKit";
import { createInstances } from "@react-three/drei";
import { Block, Sign } from "./geometry";

// Original procedural scenery. No source code or GLB assets copied from the reference.
const [Canopies, Canopy] = createInstances();
const lots = [
  ...[-68, -51, -34, -17, 0, 17, 34, 51, 68].map((x, i) => ({
    x,
    z: -53,
    floors: 3 + ((i * 7) % 6),
    tint: i % 4,
  })),
  ...[-26, -9, 8, 25].flatMap((z, i) => [
    { x: -61, z, floors: 3 + (i % 3), tint: i % 4 },
    { x: 61, z, floors: 2 + (i % 2), tint: (i + 2) % 4 },
  ]),
  ...[-59, -39, 39, 59].map((x, i) => ({
    x,
    z: 51,
    floors: 1 + (i % 2),
    tint: i % 4,
  })),
];
const palette = ["#c8b6a6", "#b4c6bf", "#c0bbce", "#d4cbaf"];

function CityBuilding({ x, z, floors, tint }: (typeof lots)[number]) {
  const h = floors * 2.15 + 1.5;
  return (
    <group position={[x, 0, z]}>
      <Block size={[14, 0.18, 13]} position={[0, -0.05, 0]} color="#dddcd0" />
      <Block
        size={[10.8, h, 9.4]}
        position={[0, h / 2, 0]}
        color={palette[tint]}
      />
      <Roofline width={10.8} depth={9.4} height={h} />
      <Block size={[11, 0.4, 9.6]} position={[0, 1.2, 0]} color="#eee7d7" />
      {Array.from({ length: floors }, (_, level) => (
        <group key={level}>
          {[-3.6, -1.2, 1.2, 3.6].map((u, i) => (
            <group key={u}>
              <Block
                size={[1.5, 1.25, 0.08]}
                position={[u, 2.35 + level * 2.15, 4.75]}
                color={(i + level) % 4 === 0 ? "#e7d6a9" : "#617f87"}
              />
              <Block
                size={[0.08, 1.25, 1.5]}
                position={[5.45, 2.35 + level * 2.15, u]}
                color="#78949a"
              />
              <Block
                size={[1.7, 0.12, 0.18]}
                position={[u, 1.68 + level * 2.15, 4.8]}
                color="#eee9dd"
              />
            </group>
          ))}
        </group>
      ))}
      <Block size={[2, 1.8, 0.1]} position={[0, 0.9, 4.77]} color="#3d555c" />
      <Block size={[2.6, 0.14, 1.5]} position={[0, 2, 5.2]} color="#e0d7bc" />
      <Block size={[0.5, 0.04, 5]} position={[-6, 0.08, 0]} color="#bac5ad" />
    </group>
  );
}

export default function CitySurroundings() {
  const treePositions = [
    ...[-76, -59, -42, -25, -8, 9, 26, 43, 60, 77].map((x) => [x, -64]),
    ...[-76, -58, -20, 0, 20, 58, 76].map((x) => [x, 62]),
  ];
  return (
    <>
      <Block size={[174, 0.7, 138]} position={[0, -0.64, 0]} color="#b7c1ab" />
      {[-43, 41].map((z) => (
        <Block
          key={`r${z}`}
          size={[163, 0.07, 5]}
          position={[0, -0.14, z]}
          color="#718083"
        />
      ))}
      {[-77, -48, 48, 77].map((x) => (
        <Block
          key={`s${x}`}
          size={[4.8, 0.07, 121]}
          position={[x, -0.14, -1]}
          color="#718083"
        />
      ))}
      {Array.from({ length: 38 }, (_, i) => (
        <group key={i}>
          {[-43, 41].map((z) => (
            <Block
              key={z}
              size={[1.7, 0.012, 0.07]}
              position={[-78 + i * 4.2, -0.095, z]}
              color="#e9dfbd"
            />
          ))}
        </group>
      ))}
      {[-77, -48, 48, 77].flatMap((x) =>
        [-40, 38].map((z) => (
          <group key={`${x}:${z}`}>
            {[-2, -1, 0, 1, 2].map((n) => (
              <Block
                key={n}
                size={[0.4, 0.014, 3.4]}
                position={[x + n * 0.7, -0.087, z]}
                color="#efe9d7"
              />
            ))}
          </group>
        )),
      )}
      {lots.map((lot) => (
        <CityBuilding key={`${lot.x}:${lot.z}`} {...lot} />
      ))}
      <Block size={[42, 0.12, 13]} position={[0, -0.02, 52]} color="#cbd1ba" />
      <Block size={[40, 0.04, 2]} position={[0, 0.06, 52]} color="#e3dfcb" />
      <mesh position={[0, 0.18, 52]}>
        <cylinderGeometry args={[3.1, 3.1, 0.3, 24]} />
        <meshStandardMaterial color="#9cbbb9" />
      </mesh>
      <mesh position={[0, 0.37, 52]}>
        <cylinderGeometry args={[2.6, 2.6, 0.08, 24]} />
        <meshStandardMaterial color="#bad3d1" />
      </mesh>
      <Sign
        text="MARKET QUARTER"
        sub="PROCEDURAL CITY SCENERY / NOT LIVE OPERATIONS"
        width={12}
        height={1.3}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.09, 60]}
        color="#cbd1ba"
        ink="#405758"
      />
      <Canopies limit={40} castShadow receiveShadow frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial flatShading roughness={1} />
        {treePositions.map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <Block
              size={[3.5, 0.15, 3.5]}
              position={[0, -0.02, 0]}
              color="#a8b995"
            />
            <Block
              size={[0.4, 2.8, 0.4]}
              position={[0, 1.4, 0]}
              color="#87745d"
            />
            <Canopy
              position={[0, 3.5, 0]}
              scale={[2.2, 2.1, 2]}
              color={i % 2 ? "#a4b891" : "#91aa84"}
            />
          </group>
        ))}
      </Canopies>
    </>
  );
}
