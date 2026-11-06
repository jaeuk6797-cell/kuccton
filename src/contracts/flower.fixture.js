import { DEFAULT_FLOWER_APPEARANCE } from './flower.js'

/** @type {import('./flower.js').Flower} */
export const mockFlower = {
  id: 'e40784ca-7937-4f22-8bd1-cf7e25a1e1c6',
  gardenId: 'cf55a32e-f232-498d-8d64-700dccac3276',
  senderId: '9462013a-f2d0-40e4-96b8-19744cc2020a',
  category: 'rain',
  word: '토도독',
  name: '토도독꽃',
  reason: '작고 맑은 소리가 반복되어서',
  transcript: null,
  features: { rms: 0.04, centroid: 2600, attack: 0.3, onsets: 3, duration: 9.8 },
  appearance: {
    ...DEFAULT_FLOWER_APPEARANCE,
    zone: 'water',
    color: '#8EC5FF',
    glow: 2.1,
  },
  audioPath: null,
  sentDate: '2026-11-06',
  createdAt: '2026-11-06T12:00:00Z',
}
