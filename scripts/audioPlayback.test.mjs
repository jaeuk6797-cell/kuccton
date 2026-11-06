import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stereoWave } from '../src/lib/audioLevel.js'

const buffer = (channels, rate) => ({
  sampleRate: rate, numberOfChannels: channels.length,
  duration: channels[0].length / rate,
  getChannelData: (index) => Float32Array.from(channels[index]),
})
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.0001)

test('우리의 꽃을 한 WAV에 합쳐 왼쪽·오른쪽 채널을 완전히 분리하고 짧은 쪽은 무음 처리한다', async () => {
  const blob = stereoWave(buffer([[.2, .4, .6, .8]], 4), buffer([[-.3]], 4))
  const view = new DataView(await blob.arrayBuffer())
  assert.equal(view.getUint16(22, true), 2)
  assert.equal(view.getUint32(24, true), 4)
  assert.equal(view.byteLength, 60)
  for (let i = 0; i < 4; i++) {
    near(view.getInt16(44 + i * 4, true) / 32767, [.2, .4, .6, .8][i])
    near(view.getInt16(46 + i * 4, true) / 32768, i === 0 ? -.3 : 0)
  }
})

test('원본의 채널 수·샘플레이트가 달라도 같은 시점과 길이로 합친다', async () => {
  const blob = stereoWave(buffer([[.2, .4], [.4, .6]], 4), buffer([[.7]], 2))
  const view = new DataView(await blob.arrayBuffer())
  assert.equal(view.byteLength, 52)
  near(view.getInt16(44, true) / 32767, .3)
  near(view.getInt16(46, true) / 32767, .7)
  near(view.getInt16(48, true) / 32767, .5)
  near(view.getInt16(50, true) / 32767, .7)
})
