// YAMNet (TensorFlow.js) 소리 분류. 실패하거나 신뢰도가 낮으면 null → 사용자가 직접 고른다.
// 모델은 public/models/yamnet에 내장 (오프라인에서도 동작)
import LABELS from './yamnetLabels.js'
const MODEL_URL = import.meta.env.VITE_YAMNET_URL || '/models/yamnet/model.json'

// YAMNet display_name → 앱 카테고리
const CLASS_TO_CATEGORY = {
  Rain: 'rain', Raindrop: 'rain', 'Rain on surface': 'rain', Drip: 'rain',
  Water: 'water', Stream: 'water', 'Waterfall': 'water', 'Water tap, faucet': 'water', 'Pour': 'water', 'Trickle, dribble': 'water', 'Splash, splatter': 'water', 'Ocean': 'water', 'Waves, surf': 'water',
  Wind: 'wind', 'Rustling leaves': 'wind', 'Wind noise (microphone)': 'wind',
  Bird: 'bird', 'Bird vocalization, bird call, song': 'bird', 'Chirp, tweet': 'bird', Pigeon: 'bird', 'Coo': 'bird', Crow: 'bird', Caw: 'bird',
  Cat: 'cat', Meow: 'cat', Purr: 'cat', Caterwaul: 'cat',
  Dog: 'dog', Bark: 'dog', Yip: 'dog', Howl: 'dog', 'Bow-wow': 'dog', Whimper: 'dog',
  'Walk, footsteps': 'footsteps', Run: 'footsteps', Shuffle: 'footsteps',
  Typing: 'typing', 'Computer keyboard': 'typing', Typewriter: 'typing', Clicking: 'typing',
  'Frying (food)': 'frying', Sizzle: 'frying', 'Boiling': 'frying',
  'Dishes, pots, and pans': 'dishes', 'Cutlery, silverware': 'dishes', 'Chopping (food)': 'dishes', Clink: 'dishes',
  Vehicle: 'vehicle', 'Subway, metro, underground': 'vehicle', Car: 'vehicle', Train: 'vehicle', Bus: 'vehicle', 'Rail transport': 'vehicle', 'Motor vehicle (road)': 'vehicle', 'Car passing by': 'vehicle', 'Vehicle horn, car horn, honking': 'vehicle', Engine: 'vehicle', Motorcycle: 'vehicle',
  Applause: 'applause', Clapping: 'applause', 'Hands': 'applause', 'Finger snapping': 'applause',
  Laughter: 'laughter', Giggle: 'laughter', Snicker: 'laughter', 'Belly laugh': 'laughter', 'Chuckle, chortle': 'laughter', 'Baby laughter': 'laughter',
  Singing: 'singing', Humming: 'singing', Choir: 'singing', 'Child singing': 'singing', 'Male singing': 'singing', 'Female singing': 'singing', Music: 'singing', Whistling: 'singing',
  Whispering: 'whisper',
  Speech: 'speech', Conversation: 'speech', 'Narration, monologue': 'speech', 'Male speech, man speaking': 'speech', 'Female speech, woman speaking': 'speech', 'Child speech, kid speaking': 'speech', 'Babbling': 'speech',
}

const CONFIDENCE_MIN = 0.25

let modelPromise, tfModule

export function preloadClassifier() {
  if (!modelPromise) {
    modelPromise = import('@tensorflow/tfjs').then(async (tf) => {
      tfModule = tf
      await tf.ready()
      return tf.loadGraphModel(MODEL_URL, { fromTFHub: MODEL_URL.includes('tfhub.dev') })
    })
    modelPromise.catch((e) => console.warn('YAMNet 로드 실패', e))
  }
  return modelPromise
}

/** samples16k: 16kHz 모노 Float32Array. 반환 { category, confidence, top } 또는 null */
export async function classify(samples16k, timeoutMs = 3000) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
  const work = (async () => {
    const model = await preloadClassifier()
    const names = LABELS
    const tf = tfModule
    const meanScores = tf.tidy(() => {
      const out = model.predict(tf.tensor1d(samples16k))
      const scores = Array.isArray(out) ? out[0] : out
      return scores.mean(0)
    })
    const data = await meanScores.data()
    meanScores.dispose()
    const top = [...data].map((s, i) => ({ i, s, name: names[i] })).sort((a, b) => b.s - a.s).slice(0, 3)
    const byCat = {}
    for (const t of top) {
      const c = CLASS_TO_CATEGORY[t.name]
      if (c) byCat[c] = (byCat[c] || 0) + t.s
    }
    const best = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]
    return {
      category: best && best[1] >= CONFIDENCE_MIN ? best[0] : null,
      suggestion: best ? best[0] : null,
      confidence: best ? best[1] : 0,
      top: top.map((t) => `${t.name} ${(t.s * 100).toFixed(0)}%`),
    }
  })().catch((e) => { console.warn('분류 실패', e); return null })
  return Promise.race([work, timeout])
}
