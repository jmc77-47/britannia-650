import type { FC, JSX } from 'react'
import type { BuildingType } from '../../game/buildings'

export type IconVariant = 'menu' | 'map'

export interface IconProps {
  className?: string
  size?: number
  strokeWidth?: number
}

type BuildingIconType = BuildingType | 'ROADS' | 'WAREHOUSE'

const VARIANT_PRESET: Record<IconVariant, { size: number; strokeWidth: number }> = {
  menu: { size: 19, strokeWidth: 1.8 },
  map: { size: 13, strokeWidth: 2.05 },
}

const IconShell = ({
  children,
  className,
  size = 19,
  strokeWidth = 1.8,
}: IconProps & { children: JSX.Element | JSX.Element[] }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={strokeWidth}
    viewBox="0 0 24 24"
    width={size}
  >
    {children}
  </svg>
)

const HouseIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <path d="M4.5 11.3L12 5.7l7.5 5.6" />
    <path d="M6.2 10.8v7.5h11.6v-7.5" />
    <path d="M10.2 18.3v-4.4h3.6v4.4" />
  </IconShell>
)

const FarmIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <path d="M12 19V5" />
    <path d="M8.4 9.2c2-.4 3-1.8 3.3-3.3" />
    <path d="M15.6 8.2c-2-.4-3-1.8-3.3-3.3" />
    <path d="M8.3 13.1c2-.3 3-1.6 3.2-3" />
    <path d="M15.7 12.1c-2-.3-3-1.6-3.2-3" />
    <path d="M8.1 17c2-.3 3-1.4 3.1-2.7" />
    <path d="M15.9 16c-2-.3-3-1.4-3.1-2.7" />
  </IconShell>
)

const LumberIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <rect height="4.2" rx="2.1" width="14.6" x="4.7" y="9.8" />
    <circle cx="7.2" cy="11.9" r="1.05" />
    <circle cx="16.8" cy="11.9" r="1.05" />
  </IconShell>
)

const QuarryIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <rect height="5" rx="1.2" width="7.6" x="3.2" y="10.8" />
    <rect height="4.8" rx="1.2" width="7.2" x="9.4" y="7.2" />
    <rect height="5" rx="1.2" width="7.6" x="13.2" y="12.2" />
  </IconShell>
)

const MineIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <path d="M6.1 18l4.9-5.5m3-3.4L18.9 3.6" />
    <path d="M9.6 6.1l8.3 8.2" />
    <path d="M4.9 13.8l5.3 5.1" />
  </IconShell>
)

const PastureIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <path d="M8.3 7.2h7.4l2.2 2.6v4.8l-2.4 2.2H8.8L6.2 14V9.8z" />
    <path d="M10.6 16.8v2.3M14 16.8v2.3" />
    <path d="M8.5 11h7.2" />
  </IconShell>
)

const TanneryIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <path d="M12 4.5c2.4 2.2 5 4.2 5 7.6a5 5 0 1 1-10 0c0-3.4 2.6-5.4 5-7.6z" />
    <path d="M12 9.2v5.8" />
  </IconShell>
)

const WeaveryIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <rect height="11.8" rx="1.8" width="13.4" x="5.3" y="6.1" />
    <path d="M7.6 9.2h8.8M7.6 12h8.8M7.6 14.8h8.8" />
    <path d="M10.2 6.2v11.6M13.8 6.2v11.6" />
  </IconShell>
)

const MarketIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <path d="M4.5 9.2h15l-1.9 3.2H6.4z" />
    <path d="M6.8 12.5v6h10.4v-6" />
    <path d="M11.2 12.5v6" />
  </IconShell>
)

const PalisadeIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <rect height="7.1" rx="1.3" width="12.2" x="5.9" y="10.3" />
    <path d="M5.9 10.3l2.1-2.4 2.1 2.4 2-2.4 2 2.4 2.1-2.4 2.1 2.4" />
    <path d="M12 17.4v-3.5" />
  </IconShell>
)

const RoadsIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <path d="M7.3 4.4l-1.8 15.2M16.7 4.4l1.8 15.2" />
    <path d="M12 6.2v2.2M12 11v2.2M12 15.8V18" />
  </IconShell>
)

const WarehouseIcon: FC<IconProps> = (props) => (
  <IconShell {...props}>
    <path d="M4.8 8.2L12 4.5l7.2 3.7v7.6L12 19.5l-7.2-3.7z" />
    <path d="M12 4.5v7.6m-7.2-3.9L12 12m7.2-3.8L12 12" />
  </IconShell>
)

export const BUILDING_ICON_MAP: Record<BuildingType, FC<IconProps>> = {
  FARM: FarmIcon,
  HOMESTEADS: HouseIcon,
  LUMBER_CAMP: LumberIcon,
  PALISADE: PalisadeIcon,
  QUARRY: QuarryIcon,
  MINE: MineIcon,
  PASTURE: PastureIcon,
  TANNERY: TanneryIcon,
  WEAVERY: WeaveryIcon,
  MARKET: MarketIcon,
}

const EXTRA_ICON_MAP: Record<'ROADS' | 'WAREHOUSE', FC<IconProps>> = {
  ROADS: RoadsIcon,
  WAREHOUSE: WarehouseIcon,
}

export function BuildingIcon({
  type,
  variant,
  className,
}: {
  type: BuildingIconType
  variant: IconVariant
  className?: string
}) {
  const preset = VARIANT_PRESET[variant]
  const iconProps: IconProps = {
    className: `building-icon ${className ?? ''}`.trim(),
    size: preset.size,
    strokeWidth: preset.strokeWidth,
  }

  const IconComponent =
    type in BUILDING_ICON_MAP
      ? BUILDING_ICON_MAP[type as BuildingType]
      : EXTRA_ICON_MAP[type as 'ROADS' | 'WAREHOUSE']

  return <IconComponent {...iconProps} />
}
