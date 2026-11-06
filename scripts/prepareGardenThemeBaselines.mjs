import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

for (const [name, commit] of [['balanced', 'bbc538b'], ['aurora', '2af54a7']]) {
  const folder = resolve('.qa-browser', `baseline-${name}`)
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', 'src', 'public', 'package.json', 'vite.config.js', 'index.html'], { encoding: 'utf8' }).trim().split(/\r?\n/)
  for (const file of files) {
    const path = resolve(folder, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, execFileSync('git', ['show', `${commit}:${file}`], { maxBuffer: 20 * 1024 * 1024 }))
  }
  // Hold sound-derived records constant while comparing only the visual renderers.
  for (const file of ['flower.js', 'soundFeatures.js', 'naming.js', 'tree.js']) {
    writeFileSync(resolve(folder, 'src/lib', file), readFileSync(resolve('src/lib', file)))
  }
  // A diagnostic handle only, so the approved scene can be measured at main's
  // exact camera projection without changing source lighting or materials.
  const path = resolve(folder, 'src/components/Island3D.jsx')
  const code = readFileSync(path, 'utf8')
  writeFileSync(path, code.replace('    const clock = new THREE.Clock()', '    if (onPreviewStats) window.__baselineScene = { camera, controls, renderer, scene }\n    const clock = new THREE.Clock()'))
  console.log(`${name}: extracted ${files.length} files from ${commit}`)
}
