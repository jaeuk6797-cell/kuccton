import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from './Icons.jsx'
import { setPlaybackLevelSource } from '../lib/audio.js'

const time = (value) => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function SoundPlayer({ src, label = '소리', autoPlay = false, durationHint = 0, flower }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(durationHint)
  const [error, setError] = useState('')

  useEffect(() => {
    setPlaying(false); setPosition(0); setDuration(durationHint); setError('')
    const audio = audioRef.current
    if (autoPlay && src) audio?.play().catch(() => {})
    return () => { audio?.pause(); setPlaybackLevelSource(null) }
  }, [src, autoPlay, durationHint])

  function started() {
    setPlaying(true); setError('')
    const audio = audioRef.current
    const envelope = flower?.lengths?.length ? flower.lengths : [0.8]
    setPlaybackLevelSource(() => {
      if (!audio || audio.paused || !Number.isFinite(audio.duration) || !audio.duration) return 0
      const i = Math.min(envelope.length - 1, Math.floor(audio.currentTime / audio.duration * envelope.length))
      return Math.max(0, (envelope[i] - 0.5) * 2) * (0.6 + 0.4 * Math.abs(Math.sin(audio.currentTime * 9)))
    })
  }

  function toggle() {
    const audio = audioRef.current
    if (!audio || !src) return
    if (!audio.paused) { audio.pause(); return }
    setError('')
    if (audio.ended) audio.currentTime = 0
    // 비동기 준비 없이 버튼을 누른 동작 안에서 바로 재생한다.
    audio.play().catch(() => setError('재생하지 못했어요. 다시 눌러 주세요.'))
  }

  function updateTime() {
    const audio = audioRef.current
    if (!audio) return
    setPosition(audio.currentTime || 0)
    if (Number.isFinite(audio.duration)) setDuration(audio.duration)
  }

  return (
    <div className="sound-player-wrap">
      <div className="sound-player">
        <audio ref={audioRef} src={src || undefined} preload="metadata" playsInline hidden
          onLoadedMetadata={updateTime} onDurationChange={updateTime} onTimeUpdate={updateTime}
          onPlay={started} onPause={() => { setPlaying(false); setPlaybackLevelSource(null) }}
          onEnded={() => { setPlaying(false); setPlaybackLevelSource(null) }}
          onError={() => { setPlaying(false); setError('소리를 불러오지 못했어요. 다시 눌러 주세요.') }}
        />
        <button className="sound-play" disabled={!src} onClick={toggle} aria-label={`${label} ${playing ? '일시정지' : '재생'}`}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <span className="sound-time" aria-label={`${time(position)} / ${time(duration)}`}>{time(position)}{duration > 0 && <span> / {time(duration)}</span>}</span>
      </div>
      {error && <p className="small muted" role="status">{error}</p>}
    </div>
  )
}
