import { cn } from '../../lib/utils'

interface RiskBadgeProps {
  score: number
  showLabel?: boolean
  size?: 'sm' | 'md'
}

export function getRiskLevel(score: number): { label: string; color: string; bgClass: string } {
  if (score >= 70) return { label: 'DANGER', color: 'text-red-400', bgClass: 'badge-danger' }
  if (score >= 40) return { label: 'CAUTION', color: 'text-yellow-400', bgClass: 'badge-caution' }
  return { label: 'SAFE', color: 'text-green-400', bgClass: 'badge-safe' }
}

export default function RiskBadge({ score, showLabel = true, size = 'md' }: RiskBadgeProps) {
  const { label, bgClass } = getRiskLevel(score)

  return (
    <span className={cn(
      'font-mono font-bold rounded inline-flex items-center gap-1',
      bgClass,
      size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
    )}>
      {showLabel && `${label} `}{score}
    </span>
  )
}

