import test from 'node:test'
import assert from 'node:assert/strict'
import { gardenThemeStorageKey, normalizeGardenTheme, readGardenTheme, writeGardenTheme } from '../src/lib/gardenThemeStorage.js'

test('new accounts and malformed preferences resolve to balanced', () => {
  for (const value of [null, undefined, '', 'random', 'BALANCED', '{}', '"warm"', 0, {}, ['warm']]) {
    assert.equal(normalizeGardenTheme(value), 'balanced')
    assert.equal(readGardenTheme('key', { getItem: () => value }), 'balanced')
  }
  for (const value of ['balanced', 'warm', 'aurora', 'default']) assert.equal(normalizeGardenTheme(value), value)
})

test('account and demo keys isolate preferences across reloads', () => {
  const records = new Map()
  const storage = { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) }
  const a = gardenThemeStorageKey('auth-a'), b = gardenThemeStorageKey('auth-b'), demo = gardenThemeStorageKey('auth-a', true)
  assert.equal(new Set([a, b, demo]).size, 3)
  assert.equal(writeGardenTheme(a, 'aurora', storage), true)
  assert.equal(readGardenTheme(a, storage), 'aurora')
  assert.equal(readGardenTheme(b, storage), 'balanced')
  writeGardenTheme(demo, 'default', storage)
  assert.equal(readGardenTheme(a, storage), 'aurora')
  assert.equal(readGardenTheme(demo, storage), 'default')
  assert.equal(gardenThemeStorageKey(undefined), null)
})

test('unavailable storage never blocks the application', () => {
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') } }
  assert.equal(readGardenTheme('key', blocked), 'balanced')
  assert.equal(writeGardenTheme('key', 'warm', blocked), false)
  assert.equal(writeGardenTheme(null, 'warm', blocked), false)
})
