// Minimal 3D for the Dyson-sphere scene: points on spheres, geodesic polyhedra, rotation and
// perspective projection.
// The scene is tiny (a few dozen points), so plain SVG redrawn each frame is enough.

export type Vec3 = [number, number, number]

const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// n points spread evenly over a sphere of radius r (Fibonacci lattice). `turn` rotates the
// lattice so the core and shell points do not line up.
export function spherePoints(n: number, r: number, turn = 0): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const y = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n
    const ring = Math.sqrt(1 - y * y)
    const a = i * GOLDEN + turn
    return [Math.cos(a) * ring * r, y * r, Math.sin(a) * ring * r]
  })
}

// ---- Orientation as a 3×3 rotation matrix (row-major). +z points at the viewer. ----
// A matrix rather than yaw/pitch angles, so the sphere can turn freely in every direction:
// with angles, tipping it past the pole would make horizontal drags run backwards.

export type Mat3 = readonly number[]

export function apply(m: Mat3, [x, y, z]: Vec3): Vec3 {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ]
}

export function mul(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c])
    }
  }
  return out
}

// Rotation by `angle` around a unit `axis` (Rodrigues' formula).
export function axisAngle([x, y, z]: Vec3, angle: number): Mat3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ]
}

// Turning around the screen's vertical / horizontal axis (a drag sideways / up and down).
export const aroundY = (angle: number) => axisAngle([0, 1, 0], angle)
export const aroundX = (angle: number) => axisAngle([1, 0, 0], angle)

// The rotation that carries direction `v` onto the viewer axis (+z), by the shortest way.
export function towardViewer(v: Vec3): { axis: Vec3; angle: number } {
  const [x, y, z] = normalize(v)
  const angle = Math.acos(Math.max(-1, Math.min(1, z)))
  const len = Math.hypot(y, x)
  // v × (0,0,1) = (y, -x, 0); straight behind has no unique axis, so turn about vertical.
  return { axis: len < 1e-9 ? [0, 1, 0] : [y / len, -x / len, 0], angle }
}

// Many small turns accumulate rounding error; rebuild an orthonormal matrix (Gram–Schmidt on
// the rows) so the sphere never slowly skews.
export function orthonormalize(m: Mat3): Mat3 {
  const r0 = normalize([m[0], m[1], m[2]])
  let r1: Vec3 = [m[3], m[4], m[5]]
  const d = r0[0] * r1[0] + r0[1] * r1[1] + r0[2] * r1[2]
  r1 = normalize([r1[0] - d * r0[0], r1[1] - d * r0[1], r1[2] - d * r0[2]])
  const r2: Vec3 = [
    r0[1] * r1[2] - r0[2] * r1[1],
    r0[2] * r1[0] - r0[0] * r1[2],
    r0[0] * r1[1] - r0[1] * r1[0],
  ]
  return [...r0, ...r1, ...r2]
}

export const CAMERA = 3.4

export interface Projected {
  x: number
  y: number
  z: number
  scale: number
}

export function project([x, y, z]: Vec3): Projected {
  const scale = CAMERA / (CAMERA - z)
  return { x: x * scale, y: -y * scale, z, scale }
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

// ---- Geodesic polyhedron (subdivided icosahedron) ----

export interface Mesh {
  vertices: Vec3[] // on the unit sphere
  edges: [number, number][]
  faces: [number, number, number][]
}

// subdiv 0 = icosahedron (12 vertices); each step splits every triangle into four:
// 1 → 42 vertices / 80 faces, 2 → 162 vertices / 320 faces.
export function icosphere(subdiv: number): Mesh {
  const t = (1 + Math.sqrt(5)) / 2
  const vertices: Vec3[] = (
    [
      [-1, t, 0],
      [1, t, 0],
      [-1, -t, 0],
      [1, -t, 0],
      [0, -1, t],
      [0, 1, t],
      [0, -1, -t],
      [0, 1, -t],
      [t, 0, -1],
      [t, 0, 1],
      [-t, 0, -1],
      [-t, 0, 1],
    ] as Vec3[]
  ).map(normalize)
  let faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ]
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map<string, number>()
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      let i = cache.get(key)
      if (i === undefined) {
        const [p, q] = [vertices[a], vertices[b]]
        i = vertices.push(normalize([p[0] + q[0], p[1] + q[1], p[2] + q[2]])) - 1
        cache.set(key, i)
      }
      return i
    }
    faces = faces.flatMap(([a, b, c]) => {
      const [ab, bc, ca] = [mid(a, b), mid(b, c), mid(c, a)]
      return [
        [a, ab, ca],
        [b, bc, ab],
        [c, ca, bc],
        [ab, bc, ca],
      ] as [number, number, number][]
    })
  }
  const seen = new Set<string>()
  const edges: [number, number][] = []
  for (const [a, b, c] of faces) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = p < q ? `${p}-${q}` : `${q}-${p}`
      if (!seen.has(key)) {
        seen.add(key)
        edges.push([p, q])
      }
    }
  }
  return { vertices, edges, faces }
}

// Moves each point to the nearest unused mesh vertex, so nodes sit on the polyhedron's corners.
export function snapToVertices(points: Vec3[], mesh: Mesh): Vec3[] {
  const used = new Set<number>()
  return points.map((p) => {
    const u = normalize(p)
    let best = -1
    let bestDot = -Infinity
    mesh.vertices.forEach((v, i) => {
      const d = v[0] * u[0] + v[1] * u[1] + v[2] * u[2]
      if (!used.has(i) && d > bestDot) [best, bestDot] = [i, d]
    })
    used.add(best)
    const r = Math.hypot(p[0], p[1], p[2])
    const v = mesh.vertices[best]
    return [v[0] * r, v[1] * r, v[2] * r]
  })
}
