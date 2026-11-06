import { useEffect, useRef } from 'react'

// PRD F1: 녹음 중 실시간 파형. 스트림이 있는 동안 AnalyserNode 시간 영역 데이터를 그린다.
export default function Waveform({ stream, width = 360, height = 80 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas.getContext('2d')
    g.clearRect(0, 0, width, height)
    if (!stream) return

    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)

    let raf
    const draw = () => {
      analyser.getByteTimeDomainData(data)
      g.clearRect(0, 0, width, height)
      g.lineWidth = 2
      g.strokeStyle = '#e07aa0'
      g.beginPath()
      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * width
        const y = (data[i] / 255) * height
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      ctx.close()
      g.clearRect(0, 0, width, height)
    }
  }, [stream, width, height])

  return <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', maxWidth: width }} />
}
