import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Restore the immutable warm commit and check that the aurora branch preserves it.
// --restore-only performs the independent archived build before aurora edits land.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const qa = join(root, 'art/aurora')
const baseline = '536d2ac'
const commit = execFileSync('git', ['rev-parse', baseline], { cwd: root, encoding: 'utf8' }).trim()
const temporary = await mkdtemp(join(qa, '.preservation-'))
const restored = join(temporary, 'warm')
const reportPath = join(qa, 'preservation.json')
const hash = value => createHash('sha256').update(value).digest('hex')
const report = { baseline: commit, restoration: {}, cases: [], blender: {}, island: {}, protectedAssets: [] }
const bytesHash = array => hash(Buffer.from(array.buffer, array.byteOffset, array.byteLength))

function shaderText(material) {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>\n#include <aomap_fragment>' }
  material.onBeforeCompile(shader, {})
  return [shader.vertexShader, shader.fragmentShader]
}

function snapshot(object, appearance = false) {
  object.updateMatrixWorld(true)
  const nodes = []
  object.traverse(node => {
    const entry = { type: node.type, matrix: node.matrix.toArray(), children: node.children.length }
    if (node.isMesh) {
      entry.geometry = Object.fromEntries(Object.entries(node.geometry.attributes)
        .filter(([name]) => appearance || !['color', 'auroraEdge'].includes(name))
        .map(([name, attribute]) => [name, bytesHash(attribute.array)]))
      entry.index = node.geometry.index && bytesHash(node.geometry.index.array)
      if (appearance) entry.material = materialSnapshot(node.material)
    }
    nodes.push(entry)
  })
  return nodes
}

function materialSnapshot(material) {
  return {
    values: ['type', 'side', 'vertexColors', 'roughness', 'metalness', 'clearcoat', 'clearcoatRoughness',
      'iridescence', 'iridescenceIOR', 'iridescenceThicknessMinimum', 'iridescenceThicknessMaximum',
      'specularIntensity', 'specularColor', 'color', 'emissive', 'emissiveIntensity', 'envMapIntensity',
      'ior', 'transmission', 'thickness', 'attenuationDistance', 'attenuationColor', 'opacity', 'transparent', 'flatShading', 'toneMapped']
      .map(key => [key, material[key]?.isColor ? material[key].toArray() : material[key]]),
    shaders: shaderText(material),
  }
}

function counts(object) {
  let meshes = 0, triangles = 0
  const geometries = new Set(), materials = new Set()
  object.traverse(node => {
    if (!node.isMesh) return
    meshes++
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3
    geometries.add(node.geometry)
    materials.add(node.material)
  })
  return { meshes, triangles, geometries: geometries.size, materials: materials.size }
}

async function listFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(file))
    else files.push(file)
  }
  return files.sort()
}

async function bundle(sourceRoot, output) {
  const files = ['lib/flower3d.js', 'lib/tree3d.js', 'lib/blenderFlower.js', 'lib/islandTone.js', 'lib/gardenEnvironment.js']
  const contents = files.map(file => `export * from ${JSON.stringify(join(sourceRoot, file))}`).join('\n')
    + `\nexport { testApplyOpalReflection } from ${JSON.stringify(join(sourceRoot, 'components/Island3D.jsx'))}`
  await build({ stdin: { contents, resolveDir: root, sourcefile: 'validation-entry.js' },
    outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['three', 'three/*', 'react'],
    define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.DEV': 'false' },
    plugins: [{ name: 'inspection-only-exports', setup(api) {
      api.onLoad({ filter: /Island3D\.jsx$/ }, async args => ({
        contents: await readFile(args.path, 'utf8') + '\nexport { applyOpalReflection as testApplyOpalReflection };', loader: 'jsx',
      }))
      api.onLoad({ filter: /gardenEnvironment\.js$/ }, async args => ({
        contents: (await readFile(args.path, 'utf8')).replace('new THREE.PMREMGenerator(renderer)', 'globalThis.__captureEnvironmentGenerator()'), loader: 'js',
      }))
    } }],
  })
  return import(pathToFileURL(output).href)
}

try {
  const archive = join(temporary, 'warm.zip')
  execFileSync('git', ['archive', '--format=zip', '--output', archive, commit], { cwd: root })
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${quote(archive)}, ${quote(restored)})`], { cwd: root })
  const sourceFiles = [...await listFiles(join(restored, 'src')),
    ...['package.json', 'package-lock.json', 'vite.config.js'].map(file => join(restored, file))]
  report.restoration.sourceHashes = await Promise.all(sourceFiles.map(async file => ({
    file: relative(restored, file).replaceAll('\\', '/'), sha256: hash(await readFile(file)),
  })))
  let prior
  try { prior = JSON.parse(await readFile(reportPath, 'utf8')) } catch { /* First verification. */ }
  if (prior?.baseline === commit && prior?.restoration?.build?.status === 'passed') {
    report.restoration.build = prior.restoration.build
  } else {
    const log = execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build'],
      { cwd: restored, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    assert.match(log, /built in/)
    assert.ok((await readFile(join(restored, 'dist/index.html'))).length > 0)
    report.restoration.build = { status: 'passed', command: 'node <workspace>/node_modules/vite/bin/vite.js build',
      source: 'Fresh git archive extraction, with workspace-installed dependencies resolved from ancestors',
      warning: 'Existing Vite chunk larger than 500 kB', modules: Number(/(\d+) modules transformed/.exec(log)?.[1]) }
  }
  report.restoration.status = 'passed'
  const evidenceFiles = await listFiles(join(restored, 'art/warm-tone'))
  for (const expected of evidenceFiles) {
    const file = relative(restored, expected)
    assert.equal(hash(await readFile(join(root, file))), hash(await readFile(expected)), `${file}: archived warm evidence stays unchanged`)
  }
  report.restoration.warmEvidence = { files: evidenceFiles.length, byteIdentical: true }
  for (const file of ['public/models/island.glb', 'public/models/flora/crystal_flower.glb',
    'public/models/flora/crystal_flower_lod.glb', 'art/flora/crystal_flower.blend']) {
    const expected = hash(await readFile(join(restored, file)))
    assert.equal(hash(await readFile(join(root, file))), expected, `${file} stays unchanged`)
    report.protectedAssets.push({ file, sha256: expected, unchanged: true })
  }

  if (!process.argv.includes('--restore-only')) {
    const original = await bundle(join(restored, 'src'), join(temporary, 'original.mjs'))
    const current = await bundle(join(root, 'src'), join(temporary, 'current.mjs'))
    const flower = { petals: 6, vowel: 'Y', consonant: '평', rms: 0.045,
      color: '#edacc9', lengths: [0.7, 0.6, 0.9, 0.55, 0.8, 0.65] }
    function checkCase(name, before, warm, aurora) {
      for (const opening of [0, 0.25, 0.5, 1]) {
        for (const object of [before, warm, aurora]) { object.userData.setOpen?.(opening); object.userData.tick?.(0.75) }
        assert.deepEqual(snapshot(warm, true), snapshot(before, true), `${name}: warm appearance/shaders preserved at ${opening}`)
        assert.deepEqual(snapshot(aurora), snapshot(warm), `${name}: aurora geometry/growth unchanged at ${opening}`)
      }
      assert.notDeepEqual(snapshot(aurora, true), snapshot(warm, true), `${name}: aurora visibly differs`)
      assert.deepEqual(counts(aurora), counts(warm), `${name}: draw complexity unchanged`)
      report.cases.push({ name, ...counts(warm), warmAppearancePreserved: true, auroraGeometryAndGrowthUnchanged: true })
      for (const object of [before, warm, aurora]) current.disposeFlower3D(object)
    }
    for (const [category, hue] of Object.entries({ joy: 48, excited: 28, flutter: 335, cozy: 140, calm: 175, sad: 225, tense: 270 })) {
      const data = { ...flower, category, color: `hsl(${hue} 60% 58%)` }
      checkCase(category, original.buildFlower3D(data), current.buildFlower3D(data, [data.color], { tone: 'warm' }),
        current.buildFlower3D(data, [data.color], { tone: 'aurora' }))
    }
    const pairColors = ['#edacc9', '#89cdbd']
    checkCase('pair', original.buildFlower3D(flower, pairColors, { pair: true }),
      current.buildFlower3D(flower, pairColors, { pair: true, tone: 'warm' }),
      current.buildFlower3D(flower, pairColors, { pair: true, tone: 'aurora' }))
    for (const [kind, properties] of Object.entries({ round: { root: '톡' }, pine: { root: '타닥', consonant: '격' }, willow: { root: '살랑' } })) {
      const data = { ...flower, ...properties, category: 'sound', color: 'hsl(185 60% 52%)' }
      checkCase(kind, original.buildTree3D(data), current.buildTree3D(data, { tone: 'warm' }), current.buildTree3D(data, { tone: 'aurora' }))
    }

    const assets = {}, loader = new GLTFLoader()
    for (const [level, suffix] of [['near', ''], ['far', '_LOD']]) {
      const bytes = await readFile(join(root, `public/models/flora/crystal_flower${suffix ? '_lod' : ''}.glb`))
      const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
      assets[level] = { scene, suffix }
    }
    const bounds = new THREE.Box3().setFromObject(assets.near.scene).getSize(new THREE.Vector3())
    Object.assign(assets, { height: bounds.y, width: Math.max(bounds.x, bounds.z) })
    const sourceBefore = [snapshot(assets.near.scene, true), snapshot(assets.far.scene, true)]
    const before = original.buildBlenderFlower(flower, assets)
    const warm = current.buildBlenderFlower(flower, assets, { tone: 'warm' })
    const aurora = current.buildBlenderFlower(flower, assets, { tone: 'aurora' })
    const peer = current.buildBlenderFlower(flower, assets, { tone: 'aurora' })
    const materialOf = object => object.getObjectByName('Outer_Petal_Pivot').material
    assert.equal(materialOf(aurora), materialOf(peer))
    assert.notEqual(materialOf(aurora), materialOf(warm))
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500)
    const scale = (0.55 + 0.25 * current.flowerParams(flower).size) / assets.height
    const sequence = []
    for (const pixels of [60, 41, 33, 41, 50]) {
      camera.position.set(0, 0, assets.width * scale * camera.projectionMatrix.elements[5] * 844 / (2 * pixels))
      camera.updateMatrixWorld(true)
      for (const object of [before, warm, aurora]) { object.userData.setOpen(1); object.updateMatrixWorld(true); object.userData.updateLOD(camera, 844, 1) }
      assert.deepEqual(snapshot(warm, true), snapshot(before, true), `Blender warm preserved at ${pixels}px`)
      assert.deepEqual(snapshot(aurora), snapshot(warm), `Blender aurora geometry preserved at ${pixels}px`)
      assert.deepEqual(counts(aurora), counts(warm))
      sequence.push(aurora.userData.lod)
      assert.equal(aurora.children.length, 1)
    }
    assert.deepEqual(sequence, ['near', 'near', 'far', 'far', 'near'])
    let disposed = 0
    materialOf(aurora).addEventListener('dispose', () => disposed++)
    aurora.userData.dispose(); assert.equal(disposed, 0)
    peer.userData.dispose(); assert.equal(disposed, 1)
    peer.userData.dispose(); assert.equal(disposed, 1)
    before.userData.dispose(); warm.userData.dispose()
    assert.deepEqual([snapshot(assets.near.scene, true), snapshot(assets.far.scene, true)], sourceBefore)
    report.blender = { lodSequence: sequence, warmAppearanceAndShadersPreserved: true,
      auroraGeometryPreserved: true, sourceUnmodified: true, cacheIsolationAndDisposalPassed: true }

    // Export only the shader hook for inspection; the React component is never mounted here.
    const groundBefore = new THREE.MeshPhysicalMaterial(), groundWarm = new THREE.MeshPhysicalMaterial(), groundAurora = new THREE.MeshPhysicalMaterial()
    for (const material of [groundBefore, groundWarm, groundAurora]) material.name = 'SUP Opalescent ground'
    original.applyWarmIslandMaterial(groundBefore)
    current.applyWarmIslandMaterial(groundWarm)
    original.testApplyOpalReflection(groundBefore, 'warm')
    current.testApplyOpalReflection(groundWarm, 'warm')
    current.testApplyOpalReflection(groundAurora, 'aurora')
    assert.deepEqual(materialSnapshot(groundWarm), materialSnapshot(groundBefore), 'warm opal material and shader preserved')
    assert.notDeepEqual(shaderText(groundAurora), shaderText(groundWarm), 'aurora ground shader differs')

    const islandBytes = await readFile(join(root, 'public/models/island.glb'))
    const islandJson = JSON.parse(islandBytes.subarray(20, 20 + islandBytes.readUInt32LE(12)).toString('utf8'))
    const checkedMaterials = []
    for (const source of islandJson.materials) {
      const pbr = source.pbrMetallicRoughness || {}
      function fixture() {
        const geometry = new THREE.PlaneGeometry(1, 1)
        geometry.setAttribute('color', new THREE.Float32BufferAttribute([
          0.12, 0.26, 0.40, 0.20, 0.70, 0.22, 0.50, 0.45,
          0.65, 0.60, 0.52, 0.75, 0.22, 0.48, 0.44, 1.0,
        ], 4))
        const material = new THREE.MeshPhysicalMaterial({
          name: source.name, color: new THREE.Color().fromArray(pbr.baseColorFactor || [1, 1, 1]),
          roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1,
        })
        return new THREE.Mesh(geometry, material)
      }
      const oldMesh = fixture(), warmMesh = fixture(), auroraMesh = fixture()
      original.applyWarmIslandMaterial(oldMesh.material); original.applyWarmIslandPaint(oldMesh)
      current.applyWarmIslandMaterial(warmMesh.material); current.applyWarmIslandPaint(warmMesh)
      current.applyAuroraIslandMaterial(auroraMesh.material); current.applyAuroraIslandPaint(auroraMesh)
      assert.deepEqual(snapshot(warmMesh, true), snapshot(oldMesh, true), `${source.name}: warm material/paint preserved`)
      assert.deepEqual(snapshot(auroraMesh), snapshot(warmMesh), `${source.name}: aurora paint preserves geometry`)
      assert.deepEqual(Array.from(auroraMesh.geometry.attributes.color.array).filter((_, i) => i % 4 === 3),
        Array.from(warmMesh.geometry.attributes.color.array).filter((_, i) => i % 4 === 3), `${source.name}: facet alpha preserved`)
      checkedMaterials.push(source.name)
      for (const mesh of [oldMesh, warmMesh, auroraMesh]) { mesh.geometry.dispose(); mesh.material.dispose() }
    }
    globalThis.__captureEnvironmentGenerator = () => ({ fromScene(studio) { return { studio } }, dispose() {} })
    const environmentBefore = original.createGardenEnvironment({}, 256, 'warm').studio
    const environmentWarm = current.createGardenEnvironment({}, 256, 'warm').studio
    assert.deepEqual(snapshot(environmentWarm, true), snapshot(environmentBefore, true), 'warm environment cards preserved')
    assert.deepEqual(environmentWarm.background.toArray(), environmentBefore.background.toArray(), 'warm environment background preserved')
    delete globalThis.__captureEnvironmentGenerator
    const beforeCSS = await readFile(join(restored, 'src/styles.css'), 'utf8')
    const currentCSS = await readFile(join(root, 'src/styles.css'), 'utf8')
    assert.equal(/--sky:\s*([^;]+)/.exec(currentCSS)?.[1], /--sky:\s*([^;]+)/.exec(beforeCSS)?.[1], 'warm shared sky preserved')
    report.island = { warmGroundMaterialAndShaderPreserved: true, warmEnvironmentPreserved: true,
      warmSkyPreserved: true, warmMaterialAndPaintCases: checkedMaterials, auroraPaintPreservesGeometryAndAlpha: true }
    report.status = 'passed'
  } else report.status = 'restoration-passed-awaiting-aurora'
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, baseline: commit, restoredSourceFiles: report.restoration.sourceHashes.length,
    restorationBuild: report.restoration.build.status, floraCases: report.cases.length, blender: report.blender, island: report.island }, null, 2))
} finally {
  assert.equal(dirname(resolve(temporary)), qa)
  await rm(temporary, { recursive: true, force: true })
}
