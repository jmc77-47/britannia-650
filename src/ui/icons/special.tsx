import type { IconVariant } from './buildings'

const VARIANT_PRESET: Record<IconVariant, { size: number; strokeWidth: number }> = {
  menu: { size: 19, strokeWidth: 1.8 },
  map: { size: 13, strokeWidth: 2.05 },
}

export function PortIcon({
  variant,
  className,
}: {
  variant: IconVariant
  className?: string
}) {
  const preset = VARIANT_PRESET[variant]
  return (
    <svg
      aria-hidden="true"
      className={`building-icon ${className ?? ''}`.trim()}
      fill="none"
      height={preset.size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={preset.strokeWidth}
      viewBox="0 0 24 24"
      width={preset.size}
    >
      <path d="M12 4.5v11.1" />
      <path d="M7 8.4h10" />
      <path d="M6.4 15a5.6 5.6 0 0 0 11.2 0" />
      <path d="M12 15v4.4" />
    </svg>
  )
}
