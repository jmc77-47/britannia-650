export interface TutorialStep {
  title: string
  bullets: string[]
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Your Most Obedient Orientation, m'lord",
    bullets: [
      "Hover a county for a quick peek; click it to issue proper royal paperwork.",
      "The right panel shows whichever shire you've selected for taxation, pity, or both.",
      "Hidden counties remain unknown, m'lord. Scott cannot report what Scott cannot survive.",
    ],
  },
  {
    title: "Expansion, Annexation, and Administrative Panic",
    bullets: [
      'Claim neutral neighbors to expand politely with carts, coin, and exhausted settlers.',
      'Conquer hostile neighbors with greater expense, louder shouting, and official banners.',
      "Both actions take turns to resolve; war, regrettably, is paperwork with mud.",
    ],
  },
  {
    title: "The Royal Purse and Other Miseries",
    bullets: [
      "Top ribbon stocks: Gold, Population, Wood, Stone, Iron, Wool, Leather, Horses.",
      'Gold and materials fund upgrades, roads, and all manner of expensive decrees.',
      "Population is workers and levies; spend them unwisely and Scott gets blamed, m'lord.",
    ],
  },
  {
    title: "Construction, Roads, and Noble Delays",
    bullets: [
      'Buildings and roads are queued first, then completed over future turns.',
      'Higher levels improve yields and defense, though masons charge heroically.',
      'Roads begin affordable, then become ruinously dear in true imperial fashion.',
    ],
  },
  {
    title: "Fog, Policy, and Optional Mercy",
    bullets: [
      'Fog of War limits vision to known lands; hidden realms stay mysterious and probably damp.',
      'Settings include debug reveals and road chaos for inspection, m\'lord.',
      'No Conquest mode allows peaceful administration, tax audits, and fewer widows.',
    ],
  },
]
