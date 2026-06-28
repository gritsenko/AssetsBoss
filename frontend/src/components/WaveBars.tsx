import { memo } from 'react'

interface Props {
  /** Пики 0..255 (по столбику на элемент). */
  peaks: number[]
  /** Цвет столбиков. */
  color: string
}

/**
 * Волна как SVG со столбиками; viewBox + preserveAspectRatio="none" растягивают её на
 * любой контейнер. Мемоизирована: прогресс в плеере подсвечивается clip-path'ом поверх,
 * не перерисовывая сотни <rect> на каждом кадре.
 */
export const WaveBars = memo(function WaveBars({ peaks, color }: Props) {
  const n = peaks.length
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${n} 100`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {peaks.map((p, i) => {
        const h = Math.max(2, (p / 255) * 100)
        return <rect key={i} x={i + 0.12} y={(100 - h) / 2} width={0.76} height={h} rx={0.3} fill={color} />
      })}
    </svg>
  )
})
