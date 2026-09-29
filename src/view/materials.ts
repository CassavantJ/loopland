import * as THREE from 'three';

/** Flat-shaded materials, one per colour, shared by every model. */
const cache = new Map<string, THREE.MeshLambertMaterial>();

export function mat(
  color: string,
  options: { emissive?: string; transparent?: number; double?: boolean } = {},
) {
  const key = `${color}|${options.emissive ?? ''}|${options.transparent ?? ''}|${options.double ? 2 : 1}`;
  let material = cache.get(key);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (options.emissive) material.emissive = new THREE.Color(options.emissive);
    if (options.double) material.side = THREE.DoubleSide;
    if (options.transparent !== undefined) {
      material.transparent = true;
      material.opacity = options.transparent;
      material.depthWrite = false;
    }
    cache.set(key, material);
  }
  return material;
}

/** A mesh that casts and receives shadows. */
export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

/** A box resting on y = 0 (or `y`), centred on x and z. */
export function box(
  width: number,
  height: number,
  depth: number,
  color: string,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const result = mesh(new THREE.BoxGeometry(width, height, depth), mat(color));
  result.position.set(x, y + height / 2, z);
  return result;
}

/** An upright cylinder resting on y (radiusTop/radiusBottom as in three.js). */
export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: string,
  segments = 12,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const result = mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    mat(color),
  );
  result.position.set(x, y + height / 2, z);
  return result;
}

export function sphere(radius: number, color: string, x = 0, y = 0, z = 0, detail = 1): THREE.Mesh {
  const result = mesh(new THREE.IcosahedronGeometry(radius, detail), mat(color));
  result.position.set(x, y, z);
  return result;
}

export function cone(
  radius: number,
  height: number,
  color: string,
  segments = 10,
  x = 0,
  y = 0,
  z = 0,
) {
  const result = mesh(new THREE.ConeGeometry(radius, height, segments), mat(color));
  result.position.set(x, y + height / 2, z);
  return result;
}

/** A cone roof in alternating stripes of colour, like a circus tent. */
export function stripedCone(
  radius: number,
  height: number,
  colors: readonly string[],
  segments = 12,
) {
  const group = new THREE.Group();
  for (let index = 0; index < segments; index++) {
    const geometry = new THREE.ConeGeometry(
      radius,
      height,
      2,
      1,
      true,
      (index / segments) * Math.PI * 2,
      (Math.PI * 2) / segments,
    );
    const part = mesh(geometry, mat(colors[index % colors.length] ?? '#fff', { double: true }));
    part.position.y = height / 2;
    group.add(part);
  }
  return group;
}

/** A canvas-drawn sign as a texture, for names on gates and stalls. */
export function signTexture(
  text: string,
  background: string,
  color = '#ffffff',
  width = 512,
  height = 128,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.fillStyle = color;
    context.font = `900 ${Math.round(height * 0.6)}px "Inter Variable", system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2 + height * 0.04);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
