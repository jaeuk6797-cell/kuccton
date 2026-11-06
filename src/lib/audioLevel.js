// 분석용 원본은 유지하고, 전달할 녹음만 듣기 편한 음량으로 올린다.
export function recordingGain(channels) {
  let peak = 0, sum = 0, count = 0
  for (const channel of channels) {
    for (const value of channel) {
      const sample = Number.isFinite(value) ? value : 0
      peak = Math.max(peak, Math.abs(sample))
      sum += sample * sample
      count++
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, count))
  // 무음은 키우지 않는다. 최대 8배, 피크 0.95 이내로 제한한다.
  if (rms < 0.002 || !peak) return 1
  return Math.max(1, Math.min(8, 0.1 / rms, 0.95 / peak))
}

export function pcmWave(channels, sampleRate, gain = 1) {
  const frames = channels[0]?.length || 0
  const count = channels.length
  const bytes = frames * count * 2
  const view = new DataView(new ArrayBuffer(44 + bytes))
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)) }
  text(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, count, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * count * 2, true); view.setUint16(32, count * 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, bytes, true)
  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (const channel of channels) {
      const value = Number.isFinite(channel[i]) ? channel[i] : 0
      const sample = Math.max(-1, Math.min(1, value * gain))
      view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
      offset += 2
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' })
}

// 한 미디어 파일의 왼쪽·오른쪽 채널로 합쳐 iPhone에서도 한 번에 재생한다.
export function stereoWave(left, right) {
  const rate = left.sampleRate
  const frames = Math.max(Math.ceil(left.duration * rate), Math.ceil(right.duration * rate))
  const channels = [left, right].map((buffer) => {
    const out = new Float32Array(frames)
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch)
      for (let i = 0; i < frames; i++) {
        const at = i * buffer.sampleRate / rate
        if (at >= data.length) break
        const index = Math.floor(at), fraction = at - index
        out[i] += (data[index] * (1 - fraction) + data[Math.min(index + 1, data.length - 1)] * fraction) / buffer.numberOfChannels
      }
    }
    return out
  })
  return pcmWave(channels, rate)
}
