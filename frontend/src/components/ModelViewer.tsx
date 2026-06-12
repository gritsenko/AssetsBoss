import { useEffect, useRef } from 'react'

type Shape = 'ico' | 'rock' | 'sword' | 'cube' | 'room' | 'chest' | 'cyl'
const SHAPES: Shape[] = ['ico', 'rock', 'sword', 'cube', 'room', 'chest', 'cyl']

/** Deterministic shape pick from the asset name (no real geometry is loaded). */
function pickShape(seed: string): Shape {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return SHAPES[h % SHAPES.length]
}

function geom(shape: Shape): { v: number[][]; e: number[][] } {
  let v: number[][] = []
  const e: number[][] = []
  if (shape === 'ico' || shape === 'rock') {
    const p = (1 + Math.sqrt(5)) / 2
    v = [
      [-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p],
      [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1],
    ].map((a) => a.map((x) => x / p))
    if (shape === 'rock') v = v.map((a, i) => a.map((x) => x * (0.75 + ((i * 37) % 10) / 20)))
    for (let i = 0; i < v.length; i++)
      for (let j = i + 1; j < v.length; j++) {
        const d = Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2])
        if (d < 1.25) e.push([i, j])
      }
  } else if (shape === 'sword') {
    v = [
      [0, 1.9, 0], [0, -1.3, 0], [0.26, 0.2, 0], [-0.26, 0.2, 0], [0, 0.2, 0.26],
      [0, 0.2, -0.26], [0.62, -0.5, 0], [-0.62, -0.5, 0], [0, -1.9, 0],
    ]
    e.push([0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2], [6, 7], [1, 8])
  } else if (shape === 'cube' || shape === 'room' || shape === 'chest') {
    const s = 1.05
    v = [
      [-s, -0.8, -s], [s, -0.8, -s], [s, -0.8, s], [-s, -0.8, s],
      [-s, 0.8, -s], [s, 0.8, -s], [s, 0.8, s], [-s, 0.8, s],
    ]
    e.push([0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7])
    if (shape === 'chest') {
      v.push([-s, 0.25, -s], [s, 0.25, -s], [s, 0.25, s], [-s, 0.25, s])
      e.push([8, 9], [9, 10], [10, 11], [11, 8])
    }
    if (shape === 'room') {
      v.push([0, -0.8, -s], [0, 0.8, -s], [-s, -0.8, 0], [-s, 0.8, 0])
      e.push([8, 9], [10, 11])
    }
  } else {
    const n = 10
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.push([Math.cos(a) * 0.7, 1.1, Math.sin(a) * 0.7]) }
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.push([Math.cos(a) * 0.7, -0.5, Math.sin(a) * 0.7]) }
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.push([Math.cos(a) * 0.22, -1.45, Math.sin(a) * 0.22]) }
    for (let i = 0; i < n; i++) e.push([i, (i + 1) % n], [i + n, ((i + 1) % n) + n], [i + 2 * n, ((i + 1) % n) + 2 * n], [i, i + n], [i + n, i + 2 * n])
  }
  return { v, e }
}

interface Props {
  /** Re-seed shape + reset orbit when this changes. */
  assetKey: string
  dark: boolean
}

export function ModelViewer({ assetKey, dark }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rx = useRef(-0.42)
  const ry = useRef(0.7)
  const dragging = useRef(false)
  const darkRef = useRef(dark)

  useEffect(() => {
    darkRef.current = dark
  }, [dark])

  useEffect(() => {
    rx.current = -0.42
    ry.current = 0.7
  }, [assetKey])

  useEffect(() => {
    const shape = pickShape(assetKey)
    let raf = 0
    const draw = () => {
      const cv = canvasRef.current
      if (cv) {
        const d = darkRef.current
        const ctx = cv.getContext('2d')!
        const W = cv.width
        const H = cv.height
        if (!dragging.current) ry.current += 0.006
        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = d ? '#1B1914' : '#ECE9E0'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = d ? 'rgba(237,231,217,0.14)' : 'rgba(46,44,38,0.12)'
        for (let y = H * 0.72; y < H - 30; y += 44) for (let x = 50; x < W - 30; x += 54) ctx.fillRect(x, y, 2.5, 2.5)
        ctx.fillStyle = d ? 'rgba(0,0,0,0.35)' : 'rgba(46,44,38,0.10)'
        ctx.beginPath()
        ctx.ellipse(W / 2, H * 0.78, W * 0.24, 28, 0, 0, 7)
        ctx.fill()
        const { v, e } = geom(shape)
        const ryv = ry.current
        const rxv = rx.current
        const sc = H * 0.26
        const P = v.map(([x, y, z]) => {
          const X = x * Math.cos(ryv) + z * Math.sin(ryv)
          const Z = -x * Math.sin(ryv) + z * Math.cos(ryv)
          const Y = y * Math.cos(rxv) - Z * Math.sin(rxv)
          return [W / 2 + X * sc, H * 0.46 - Y * sc]
        })
        ctx.strokeStyle = d ? '#D8D2C2' : '#33312A'
        ctx.lineWidth = 2.6
        ctx.lineJoin = 'round'
        for (const [i, j] of e) {
          ctx.beginPath()
          ctx.moveTo(P[i][0], P[i][1])
          ctx.lineTo(P[j][0], P[j][1])
          ctx.stroke()
        }
        ctx.fillStyle = d ? '#D8D2C2' : '#33312A'
        for (const [x, y] of P) {
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, 7)
          ctx.fill()
        }
        ctx.fillStyle = '#D96E34'
        ctx.beginPath()
        ctx.arc(P[0][0], P[0][1], 5.4, 0, 7)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [assetKey])

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    let px = e.clientX
    let py = e.clientY
    const move = (ev: MouseEvent) => {
      ry.current += (ev.clientX - px) * 0.008
      rx.current = Math.max(-1.2, Math.min(0.3, rx.current - (ev.clientY - py) * 0.008))
      px = ev.clientX
      py = ev.clientY
    }
    const up = () => {
      dragging.current = false
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <canvas
      ref={canvasRef}
      width={744}
      height={540}
      onMouseDown={onMouseDown}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'grab' }}
    />
  )
}
