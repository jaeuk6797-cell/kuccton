// 재생: 단일 꽃 / 우리의 꽃(상대=왼쪽, 나=오른쪽 스테레오)
let ctx = null
let current = []

function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

async function loadBuffer(url) {
  const res = await fetch(url)
  return audioCtx().decodeAudioData(await res.arrayBuffer())
}

export function stopAll() {
  current.forEach((s) => { try { s.stop() } catch {} })
  current = []
}

// level 콜백으로 재생 중 음량(0~1)을 넘겨 입자·꽃 반응에 쓴다
function play(buffer, pan, onLevel) {
  const c = audioCtx()
  const src = c.createBufferSource()
  src.buffer = buffer
  const panner = c.createStereoPanner()
  panner.pan.value = pan
  const analyser = c.createAnalyser()
  analyser.fftSize = 512
  src.connect(panner).connect(analyser).connect(c.destination)
  src.start()
  current.push(src)
  if (onLevel) {
    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sq = 0
      for (const v of data) sq += ((v - 128) / 128) ** 2
      onLevel(Math.min(1, Math.sqrt(sq / data.length) * 4))
      if (current.includes(src)) requestAnimationFrame(tick)
      else onLevel(0)
    }
    tick()
  }
  src.onended = () => { current = current.filter((s) => s !== src) }
  return src
}

export async function playFlower(url, onLevel) {
  stopAll()
  play(await loadBuffer(url), 0, onLevel)
}

export async function playPair(partnerUrl, myUrl, onLevel) {
  stopAll()
  const [a, b] = await Promise.all([loadBuffer(partnerUrl), loadBuffer(myUrl)])
  play(a, -0.8, onLevel)
  play(b, 0.8)
}
