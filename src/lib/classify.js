// YAMNet(TF.js)으로 소리 카테고리 분류. 실패하거나 확신이 낮으면 confident:false → UI에서 직접 선택.
const MODEL_URL = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1'
const CLASS_MAP_URL = 'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv'
const CONFIDENT = 0.3

const KEYWORDS = {
  rain: ['Rain', 'Raindrop', 'Rain on surface'],
  water: ['Water', 'Stream', 'Waterfall', 'Drip', 'Pour', 'Trickle, dribble', 'Water tap, faucet', 'Sink (filling or washing)'],
  wind: ['Wind', 'Rustling leaves', 'Wind noise (microphone)'],
  bird: ['Bird', 'Bird vocalization, bird call, bird song', 'Chirp, tweet'],
  cat: ['Cat', 'Meow', 'Purr'],
  dog: ['Dog', 'Bark', 'Bow-wow', 'Whimper (dog)'],
  footsteps: ['Walk, footsteps'],
  typing: ['Typing', 'Computer keyboard', 'Typewriter'],
  frying: ['Frying (food)', 'Sizzle'],
  dishes: ['Dishes, pots, and pans', 'Cutlery, silverware'],
  vehicle: ['Vehicle', 'Car', 'Subway, metro, underground', 'Train', 'Bus', 'Motor vehicle (road)'],
  applause: ['Applause', 'Clapping'],
  laughter: ['Laughter', 'Giggle', 'Chuckle, chortle', 'Snicker', 'Belly laugh', 'Baby laughter'],
  singing: ['Singing', 'Humming', 'Music'],
  whisper: ['Whispering'],
  speech: ['Speech', 'Conversation', 'Narration, monologue', 'Child speech, kid speaking'],
}
const LOOKUP = new Map()
for (const [cat, names] of Object.entries(KEYWORDS)) for (const n of names) LOOKUP.set(n, cat)

let loading = null
async function load() {
  if (!loading) {
    loading = (async () => {
      const tf = await import('@tensorflow/tfjs')
      const [model, csv] = await Promise.all([
        tf.loadGraphModel(MODEL_URL, { fromTFHub: true }),
        fetch(CLASS_MAP_URL).then((r) => r.text()),
      ])
      const names = csv.trim().split('\n').slice(1).map((line) => {
        const m = line.match(/^\d+,[^,]+,(.*)$/)
        return m ? m[1].replace(/^"|"$/g, '') : ''
      })
      return { tf, model, names }
    })()
  }
  return loading
}

export function preloadClassifier() {
  load().catch(() => {})
}

async function to16k(audioBuffer) {
  const len = Math.ceil(audioBuffer.duration * 16000)
  const off = new OfflineAudioContext(1, len, 16000)
  const src = off.createBufferSource()
  src.buffer = audioBuffer
  src.connect(off.destination)
  src.start()
  const out = await off.startRendering()
  return out.getChannelData(0)
}

export async function classify(audioBuffer) {
  try {
    const { tf, model, names } = await load()
    const wave = await to16k(audioBuffer)
    const input = tf.tensor1d(wave)
    const [scores] = model.predict(input)
    const mean = scores.mean(0)
    const arr = await mean.data()
    tf.dispose([input, scores, mean])

    const ranked = Array.from(arr).map((s, i) => [i, s]).sort((a, b) => b[1] - a[1])
    const top = ranked.slice(0, 5).map(([i, s]) => ({ label: names[i], score: s }))
    for (const [i, s] of ranked.slice(0, 10)) {
      const cat = LOOKUP.get(names[i])
      if (cat) return { category: cat, score: s, confident: s >= CONFIDENT, top }
    }
    return { category: 'other', score: 0, confident: false, top }
  } catch (e) {
    console.warn('[classify] YAMNet 사용 불가, 직접 선택으로 대체', e)
    return { category: 'other', score: 0, confident: false, top: [] }
  }
}
