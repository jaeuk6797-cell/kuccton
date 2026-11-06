import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Reference hashes were generated from each historical branch's compiled opal
// fragment, not the integration implementation. No git history is needed in CI.
const referenceShaders = {
  balanced: ['bbc538b', 'afb2375171bda5354768d9da5ba6cb780b0c90733622fdf2c33f978898707f84'],
  warm: ['536d2ac', '40eb0b2b04e5148a18d59f7ebc86357e1e4e54d687350c7e5ea1f1aa79960dee'],
  default: ['536d2ac', '4f5f731ac918abc22487afd603f185958f63e6d851a63e19ed49e68130a73e27'],
  aurora: ['2af54a7', '432dbd3d7eb92d8ea3d0fb75e10157c9f0e2c6aaaffeac1d00c4adc37063a9b2'],
}
const source = readFileSync(new URL('../src/components/Island3D.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const reflectionFunction = source.slice(source.indexOf('function applyOpalReflection('), source.indexOf('function jitter('))
const applyReflection = new Function('applyAuroraGroundGrain', `${reflectionFunction}; return applyOpalReflection;`)(shader => {
  // The grain helper is independently covered by the visual source tests.
  shader.fragmentShader += 'grain-hook'
})

for (const [tone, [commit, expected]] of Object.entries(referenceShaders)) {
  test(`${tone} opal shader exactly preserves ${commit}`, () => {
    const material = { name: 'SUP Opalescent ground', userData: {}, onBeforeCompile() {} }
    applyReflection(material, tone)
    const shader = { fragmentShader: '#include <aomap_fragment>' }
    material.onBeforeCompile(shader, {})
    assert.equal(createHash('sha256').update(shader.fragmentShader).digest('hex'), expected)
  })
}
