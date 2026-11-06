import { CATEGORY_CLASSES } from './yamnetMap.js'

// PRD F2: YAMNet(TensorFlow.js)으로 소리 카테고리를 판별한다.
// 16kHz 모노로 리샘플링해서 넣고, 프레임별 점수를 평균내 카테고리별로 묶는다.
const MODEL_URL = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1'
const SAMPLE_RATE = 16000

// 이 점수 미만이면 확신하지 못한 것으로 보고 사용자가 직접 고르게 한다.
export const CONFIDENT_SCORE = 0.2

let modelPromise
function getModel() {
  if (!modelPromise) {
    modelPromise = import('@tensorflow/tfjs').then(async (tf) => ({
      tf,
      model: await tf.loadGraphModel(MODEL_URL, { fromTFHub: true }),
    }))
    modelPromise.catch(() => {
      modelPromise = null // 실패하면 다음에 다시 시도
    })
  }
  return modelPromise
}

// 모델을 미리 받아 두면 녹음이 끝났을 때 기다리는 시간이 줄어든다.
export function preloadClassifier() {
  getModel().catch(() => {})
}

async function toMono16k(blob) {
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  ctx.close()
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  return (await off.startRendering()).getChannelData(0)
}

// meanScores: 클래스 521개의 평균 점수. 카테고리별로 합산(최대 1)해 내림차순으로 돌려준다.
export function rankCategories(meanScores) {
  return Object.entries(CATEGORY_CLASSES)
    .map(([id, classes]) => ({
      id,
      score: Math.min(1, classes.reduce((sum, i) => sum + meanScores[i], 0)),
    }))
    .sort((a, b) => b.score - a.score)
}

export async function classifySound(blob) {
  const { tf, model } = await getModel()
  const wave = await toMono16k(blob)
  const mean = tf.tidy(() => {
    const out = model.predict(tf.tensor(wave))
    const scores = Array.isArray(out) ? out[0] : out // [프레임 수, 521]
    return scores.mean(0)
  })
  const data = await mean.data()
  mean.dispose()
  return rankCategories(data)
}
