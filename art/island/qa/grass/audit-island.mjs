#!/usr/bin/env node
// Read-only GLB audit. Run from any directory:
// node art/island/qa/grass/audit-island.mjs [--baseline path] [--candidate path] [--verify-ref commit]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const baselinePath = path.resolve(root, args.get('--baseline') || 'public/models/island-warm.glb');
const candidatePath = path.resolve(root, args.get('--candidate') || 'public/models/island.glb');
const baselineRef = args.get('--verify-ref') || 'e79e488';
const sha = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const name = value => (value || '').replace(/\.\d{3}$/, '');
const rounded = value => Math.round(value * 1e6);
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const oriented = values => [values.join('|'), [values[1], values[2], values[0]].join('|'), [values[2], values[0], values[1]].join('|')].sort()[0];
const removedNames = new Set(['Island_Ornamental_Ring | Fine golden resonator', 'Island_Ornamental_Ring | Opal feet']);
const undersideName = 'Island_Crystal_Underside | Asymmetric mineral keel';
const undersideRecords = new Map();

function inspect(bytes, file) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB header');
  let doc, bin;
  for (let offset = 12; offset < bytes.length;) {
    const size = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4), chunk = bytes.subarray(offset + 8, offset + 8 + size);
    if (type === 0x4e4f534a) doc = JSON.parse(chunk.toString());
    if (type === 0x004e4942) bin = chunk;
    offset += size + 8;
  }
  const dimensions = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const types = { 5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255], 5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535], 5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', 1] };
  function accessor(index) {
    const a = doc.accessors[index], view = doc.bufferViews[a.bufferView];
    if (a.sparse) throw Error('Sparse accessor not supported by this audit');
    const [size, read, denominator] = types[a.componentType], dimension = dimensions[a.type];
    const values = Array.from({ length: a.count * dimension }, (_, i) => {
      const offset = (view.byteOffset || 0) + (a.byteOffset || 0) + Math.floor(i / dimension) * (view.byteStride || size * dimension) + i % dimension * size;
      const value = bin[read](offset);
      return a.normalized ? Math.max(-1, value / denominator) : value;
    });
    return { values, dimension, count: a.count, type: a.type, componentType: a.componentType, normalized: !!a.normalized };
  }
  const images = (doc.images || []).map(image => {
    if (image.bufferView === undefined) throw Error('External image not supported');
    const view = doc.bufferViews[image.bufferView], blob = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    return { mimeType: image.mimeType, bytes: blob.length, sha256: sha(blob) };
  });
  function materialValue(value, key = '') {
    if (Array.isArray(value)) return value.map(v => materialValue(v));
    if (!value || typeof value !== 'object') return key === 'name' ? name(value) : value;
    if (key.endsWith('Texture') && value.index !== undefined) {
      const texture = doc.textures[value.index];
      const { index, ...properties } = value;
      return { ...materialValue(properties), image: images[texture.source], sampler: texture.sampler === undefined ? null : doc.samplers[texture.sampler] };
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, materialValue(v, k)]));
  }
  const materials = (doc.materials || []).map(m => ({ name: name(m.name), rawName: m.name, signature: sha(stable(materialValue(m))), value: materialValue(m) }));
  const components = [], allBounds = new THREE.Box3(), survivingBounds = new THREE.Box3();
  function visit(index, parentMatrix, parentName) {
    const node = doc.nodes[index], local = new THREE.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new THREE.Vector3(...(node.translation || [0, 0, 0])), new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(node.scale || [1, 1, 1])));
    const world = parentMatrix.clone().multiply(local), normalMatrix = new THREE.Matrix3().getNormalMatrix(world), linear = new THREE.Matrix3().setFromMatrix4(world);
    const canonicalName = name(node.name), determinantSign = Math.sign(world.determinant()) || 1;
    if (node.mesh !== undefined) for (const [primitiveIndex, primitive] of doc.meshes[node.mesh].primitives.entries()) {
      if ((primitive.mode ?? 4) !== 4) throw Error('Non-triangle primitive');
      const attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([key, id]) => [key, accessor(id)]));
      const indices = primitive.indices === undefined ? Array.from({ length: attributes.POSITION.count }, (_, i) => i) : accessor(primitive.indices).values;
      const bounds = new THREE.Box3(), positions = [], normals = [], vertexTokens = [];
      const attributeNames = Object.keys(attributes).sort();
      for (let vertex = 0; vertex < attributes.POSITION.count; vertex++) {
        const tokens = [];
        for (const key of attributeNames) {
          const attr = attributes[key];
          let v = attr.values.slice(vertex * attr.dimension, (vertex + 1) * attr.dimension);
          if (key === 'POSITION') { const p = new THREE.Vector3(...v).applyMatrix4(world); v = p.toArray(); positions.push(p); bounds.expandByPoint(p); }
          if (key === 'NORMAL') { const n = new THREE.Vector3(...v).applyMatrix3(normalMatrix).normalize(); v = n.toArray(); normals.push(n); }
          if (key === 'TANGENT') { const t = new THREE.Vector3(...v.slice(0, 3)).applyMatrix3(linear).normalize(); v = [...t.toArray(), v[3] * determinantSign]; }
          tokens.push(key + ':' + v.map(rounded).join(','));
        }
        vertexTokens.push(tokens.join(';'));
      }
      const geometryTriangles = [], attributeTriangles = [], indexTriangles = [], edges = new Map(), edgeDirections = new Map(), pointIds = new Map(), parents = [];
      const pointKeys = positions.map(p => p.toArray().map(rounded).join(','));
      for (const key of pointKeys) if (!pointIds.has(key)) { pointIds.set(key, parents.length); parents.push(parents.length); }
      const find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
      let degenerates = 0, windingConflicts = 0, invalidNormals = 0, signedVolume = 0;
      if (attributes.NORMAL) for (let i = 0; i < attributes.NORMAL.values.length; i += 3) {
        const v = attributes.NORMAL.values.slice(i, i + 3), length = Math.hypot(...v);
        if (!Number.isFinite(length) || Math.abs(length - 1) > .001) invalidNormals++;
      }
      for (let i = 0; i < indices.length; i += 3) {
        const ix = indices.slice(i, i + 3), keys = ix.map(j => pointKeys[j]);
        geometryTriangles.push(oriented(keys)); attributeTriangles.push(oriented(ix.map(j => vertexTokens[j])));
        indexTriangles.push(oriented(ix));
        signedVolume += positions[ix[0]].dot(positions[ix[1]].clone().cross(positions[ix[2]])) / 6;
        const cross = positions[ix[1]].clone().sub(positions[ix[0]]).cross(positions[ix[2]].clone().sub(positions[ix[0]]));
        if (cross.lengthSq() < 1e-18) degenerates++;
        else if (normals.length && ix.every(j => normals[j].dot(cross) < -1e-9)) windingConflicts++;
        const ids = keys.map(k => pointIds.get(k));
        for (let k = 0; k < 3; k++) {
          const a = ids[k], b = ids[(k + 1) % 3], edge = [a, b].sort((x, y) => x - y).join(',');
          edges.set(edge, (edges.get(edge) || 0) + 1); parents[find(a)] = find(b);
          edgeDirections.set(edge, (edgeDirections.get(edge) || 0) + (a < b ? 1 : -1));
        }
      }
      allBounds.union(bounds); if (!removedNames.has(canonicalName)) survivingBounds.union(bounds);
      let undersideProfile;
      if (canonicalName === undersideName) {
        undersideRecords.set(file, { positions, attributes, indices });
        const keys = [...pointIds.keys()];
        const boundaryKeys = [...new Set([...edges.entries()].filter(([, n]) => n === 1).flatMap(([edge]) => edge.split(',').map(Number)).map(id => keys[id]))].sort();
        const rawPointByKey = new Map(positions.map((p, i) => [pointKeys[i], p.toArray()]));
        const low = positions.filter(p => Math.abs(p.y - bounds.min.y) < 1e-6);
        const apex = low.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(low.length);
        undersideProfile = {
          upperBoundaryVertexCount: boundaryKeys.length, upperBoundarySHA256: sha(boundaryKeys), upperBoundaryRawSHA256: sha(boundaryKeys.map(key => rawPointByKey.get(key))),
          minimumY: bounds.min.y, maximumY: bounds.max.y, apex: apex.toArray(), apexRadialDistance: Math.hypot(apex.x, apex.z),
          depthAxisSHA256: sha(positions.map(p => rounded(p.y))),
          orderedXZSHA256: sha(positions.map(p => [rounded(p.x), rounded(p.z)])),
          depthBandCentroids: [-0.5, -1, -1.5, -2, -2.5].map(depth => {
            const band = positions.filter(p => p.y < depth), center = band.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(band.length);
            return { belowY: depth, vertices: band.length, center: center.toArray(), radialDistance: Math.hypot(center.x, center.z) };
          })
        };
      }
      components.push({
        name: canonicalName, rawName: node.name, primitiveIndex, parent: name(parentName), triangles: indices.length / 3, vertices: positions.length,
        worldMatrixSHA256: sha(world.toArray()), worldBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
        rawAttributeSHA256: Object.fromEntries(Object.entries(attributes).map(([k, a]) => [k, sha(a.values)])),
        rawIndexSHA256: sha(indices), canonicalIndexSHA256: sha(indexTriangles.sort()), canonicalGeometrySHA256: sha(geometryTriangles.sort()), canonicalAttributesSHA256: sha(attributeTriangles.sort()),
        material: materials[primitive.material]?.name, materialRawName: materials[primitive.material]?.rawName, materialSHA256: materials[primitive.material]?.signature,
        topology: { connectedComponents: new Set(parents.map((_, i) => find(i))).size, boundaryEdges: [...edges.values()].filter(n => n === 1).length, nonmanifoldEdges: [...edges.values()].filter(n => n > 2).length, inconsistentWindingEdges: [...edges.entries()].filter(([edge, count]) => count === 2 && edgeDirections.get(edge) !== 0).length },
        degenerates, windingConflicts, invalidNormals, signedVolume, ...(undersideProfile ? { undersideProfile } : {})
      });
    }
    for (const child of node.children || []) visit(child, world, canonicalName);
  }
  for (const node of doc.scenes[doc.scene || 0].nodes) visit(node, new THREE.Matrix4(), '');
  const describeBounds = box => ({ min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new THREE.Vector3()).toArray() });
  return { path: file, sha256: sha(bytes), bytes: bytes.length, triangles: components.reduce((n, c) => n + c.triangles, 0), primitives: components.length, materials, images, components, bounds: describeBounds(allBounds), nonRingBounds: describeBounds(survivingBounds), cameras: (doc.cameras || []).length, animations: (doc.animations || []).length, lights: doc.extensions?.KHR_lights_punctual?.lights?.length || 0, scenes: doc.scenes.map(s => name(s.name)), nodeNames: doc.nodes.map(n => name(n.name)) };
}

const baseline = inspect(fs.readFileSync(baselinePath), baselinePath);
const candidate = inspect(fs.readFileSync(candidatePath), candidatePath);
const refBytes = execFileSync('git', ['-C', root, 'show', baselineRef + ':public/models/island.glb'], { maxBuffer: 20e6 });
const key = c => c.name + '#' + c.primitiveIndex;
const baseMap = new Map(baseline.components.map(c => [key(c), c])), finalMap = new Map(candidate.components.map(c => [key(c), c]));
const removed = baseline.components.filter(c => !finalMap.has(key(c))).map(c => ({ name: c.name, triangles: c.triangles }));
const added = candidate.components.filter(c => !baseMap.has(key(c))).map(c => c.name);
const comparisons = candidate.components.filter(c => baseMap.has(key(c))).map(c => {
  const prior = baseMap.get(key(c));
  const nonSpatial = attrs => Object.fromEntries(Object.entries(attrs).filter(([k]) => !['POSITION', 'NORMAL'].includes(k)));
  return { name: c.name, geometrySame: c.canonicalGeometrySHA256 === prior.canonicalGeometrySHA256, allAttributesSame: c.canonicalAttributesSHA256 === prior.canonicalAttributesSHA256, rawAttributesExact: JSON.stringify(c.rawAttributeSHA256) === JSON.stringify(prior.rawAttributeSHA256), nonSpatialAttributesExact: JSON.stringify(nonSpatial(c.rawAttributeSHA256)) === JSON.stringify(nonSpatial(prior.rawAttributeSHA256)), transformSame: c.worldMatrixSHA256 === prior.worldMatrixSHA256, materialSame: c.materialSHA256 === prior.materialSHA256, rawMaterialNameSame: c.materialRawName === prior.materialRawName, topologySame: JSON.stringify(c.topology) === JSON.stringify(prior.topology), rawIndexOrderSame: c.rawIndexSHA256 === prior.rawIndexSHA256, orientedIndexTopologySame: c.canonicalIndexSHA256 === prior.canonicalIndexSHA256 };
});
const baseUnder = baseline.components.find(c => c.name === undersideName), finalUnder = candidate.components.find(c => c.name === undersideName);
const underComparison = comparisons.find(c => c.name === undersideName);
function centeredPosition(point) {
  const depths = [.23, .49, .84, 1.19, 1.68, 2.12, 2.57], depth = -point.y;
  if (depth <= depths[0]) return point.clone();
  let t = 1;
  for (let level = 0; level < depths.length - 1; level++) if (depth < depths[level + 1]) {
    t = (level + (depth - depths[level]) / (depths[level + 1] - depths[level])) / (depths.length - 1); break;
  }
  // Source uses float32 mesh coordinates, Blender Z-up -> glTF Y-up.
  return new THREE.Vector3(Math.fround(point.x + .52 * t + .055 * Math.sin(Math.PI * t) * Math.sin(t * 4.3)), point.y,
    Math.fround(point.z - 1.18 * t ** 1.25 - .04 * Math.sin(Math.PI * t) * Math.cos(t * 5.1)));
}
function undersideTriangleRecords(record, deform) {
  const output = new Map();
  for (let i = 0; i < record.indices.length; i += 3) {
    const vertices = record.indices.slice(i, i + 3).map(index => {
      const p = deform ? centeredPosition(record.positions[index]) : record.positions[index];
      return { key: p.toArray().map(rounded).join(','), index };
    });
    const rotations = vertices.map((_, start) => [...vertices.slice(start), ...vertices.slice(0, start)]);
    rotations.sort((a, b) => a.map(v => v.key).join('|').localeCompare(b.map(v => v.key).join('|')));
    const ordered = rotations[0], key = ordered.map(v => v.key).join('|');
    output.set(key, Object.fromEntries(Object.entries(record.attributes).filter(([key]) => !['POSITION', 'NORMAL'].includes(key)).map(([key, attr]) => [key, ordered.flatMap(v => attr.values.slice(v.index * attr.dimension, (v.index + 1) * attr.dimension))])));
  }
  return output;
}
const expectedUnder = undersideTriangleRecords(undersideRecords.get(baselinePath), true), observedUnder = undersideTriangleRecords(undersideRecords.get(candidatePath), false);
const missingExpectedTriangles = [...expectedUnder.keys()].filter(key => !observedUnder.has(key));
const extraObservedTriangles = [...observedUnder.keys()].filter(key => !expectedUnder.has(key));
const nonSpatialDelta = {};
for (const [key, expected] of expectedUnder) if (observedUnder.has(key)) for (const [attribute, values] of Object.entries(expected)) {
  const observed = observedUnder.get(key)[attribute];
  const stats = nonSpatialDelta[attribute] ||= { maximumAbsoluteDifference: 0, changedValues: 0, comparedValues: 0 };
  if (!observed || observed.length !== values.length) throw Error('Underside attribute layout differs');
  values.forEach((value, i) => { const delta = Math.abs(value - observed[i]); stats.maximumAbsoluteDifference = Math.max(stats.maximumAbsoluteDifference, delta); stats.changedValues += Number(delta !== 0); stats.comparedValues++; });
}
const undersideCorrespondence = { method: 'Compare oriented triangles after applying the exact declared depth-based float32 deformation to baseline world positions; compare every non-POSITION/NORMAL corner attribute on matching triangles.', expectedTriangles: expectedUnder.size, observedTriangles: observedUnder.size, missingExpectedTriangles: missingExpectedTriangles.length, extraObservedTriangles: extraObservedTriangles.length, nonSpatialDelta };
const undersideChecks = {
  sameTriangleAndVertexCount: finalUnder.triangles === baseUnder.triangles && finalUnder.vertices === baseUnder.vertices,
  sameNonSpatialAttributes: Object.values(nonSpatialDelta).every(s => s.maximumAbsoluteDifference === 0),
  sameOrientedTopologyAfterAuthorizedDeformation: missingExpectedTriangles.length === 0 && extraObservedTriangles.length === 0,
  sameTopology: underComparison.topologySame,
  sameMaterialAndTransform: underComparison.transformSame && underComparison.materialSame && underComparison.rawMaterialNameSame,
  upperJoinExact: finalUnder.undersideProfile.upperBoundaryRawSHA256 === baseUnder.undersideProfile.upperBoundaryRawSHA256,
  depthAxisExact: finalUnder.undersideProfile.depthAxisSHA256 === baseUnder.undersideProfile.depthAxisSHA256,
  minimumAndMaximumDepthUnchanged: finalUnder.undersideProfile.minimumY === baseUnder.undersideProfile.minimumY && finalUnder.undersideProfile.maximumY === baseUnder.undersideProfile.maximumY,
  apexWithin035UnitsOfCentralAxis: finalUnder.undersideProfile.apexRadialDistance <= .35,
  lowerHalfCloserToAxis: finalUnder.undersideProfile.depthBandCentroids.filter(c => c.belowY <= -1.5).every(c => c.radialDistance < baseUnder.undersideProfile.depthBandCentroids.find(p => p.belowY === c.belowY).radialDistance),
  noNewGeometryErrors: !finalUnder.degenerates && !finalUnder.windingConflicts && !finalUnder.invalidNormals && !finalUnder.topology.nonmanifoldEdges && !finalUnder.topology.inconsistentWindingEdges
};
const checks = {
  warmCopyMatchesBaselineCommit: baseline.sha256 === sha(refBytes),
  exactlyHoopAndFeetRemoved: removed.length === 2 && removed.every(c => removedNames.has(c.name)),
  noAddedStaticComponents: added.length === 0,
  allOtherNineteenComponentsPreserved: comparisons.filter(c => c.name !== undersideName).every(c => c.geometrySame && c.allAttributesSame && c.transformSame && c.materialSame && c.rawMaterialNameSame && c.topologySame),
  onlyAuthorizedUndersideRecenter: Object.values(undersideChecks).every(Boolean),
  survivingOverallBoundsExact: JSON.stringify(baseline.nonRingBounds) === JSON.stringify(candidate.bounds),
  sameMaterialSet: JSON.stringify(baseline.materials.map(m => [m.name, m.signature]).sort()) === JSON.stringify(candidate.materials.map(m => [m.name, m.signature]).sort()),
  exactRawMaterialNamesMatchBaseline: JSON.stringify(baseline.materials.map(m => m.rawName).sort()) === JSON.stringify(candidate.materials.map(m => m.rawName).sort()),
  noGeometryErrors: candidate.components.every(c => !c.degenerates && !c.windingConflicts && !c.invalidNormals && !c.topology.inconsistentWindingEdges),
  noRingNodes: candidate.nodeNames.every(n => !n.startsWith('Island_Ornamental_Ring')),
  noPreviewCamerasLightsAnimations: candidate.cameras === 0 && candidate.lights === 0 && candidate.animations === 0 && candidate.nodeNames.every(n => !/Preview|backdrop/i.test(n))
};
const output = { baselineRef, method: { authorizedChanges: 'Remove hoop/feet; recenter underside POSITION and recompute NORMAL only. Preserve all other component geometry, all non-spatial underside attributes, top join and depth.', suffixNormalization: 'Trailing .NNN Blender ID suffix is ignored for mesh matching only. Raw material names must exactly match baseline because the application uses exact names.', canonicalPrecision: 1e-6, attributes: 'All exported vertex attributes per oriented triangle, transformed to world space where applicable; raw attribute digests also recorded', materials: 'Canonical PBR properties with resolved embedded image hashes and samplers; raw names checked independently', readOnly: true }, checks, undersideChecks, undersideCorrespondence, passed: Object.values(checks).every(Boolean), removed, added, comparisons, baseline, candidate };
console.log(JSON.stringify(output, null, 2));
if (!output.passed) process.exitCode = 1;
