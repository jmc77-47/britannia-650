// src/data/leaders.ts

export type LeaderId = "alphonsus" | "douglas" | "edmund" | "ulmann";

export type Leader = {
  id: LeaderId;

  name: string;
  epithet: string;
  faction: string;

  startCountyId: string; // e.g. "CRN"

  perkName: string;
  perkDescription: string;

  perkType:
    | "DEF_PER_WALL_LEVEL"
    | "MINING_MULT"
    | "INF_ATTACK_MULT"
    | "RESEARCH_RATE_MULT";

  // 0.015 => +1.5% per wall level, 0.10 => +10%, etc.
  perkValue: number;

  // Relative paths (for GitHub Pages friendliness)
  heroArtPath: string;
  cardArtPath: string;
};

export const LEADERS: Leader[] = [
  {
    id: "alphonsus",
    name: "Alphonsus",
    epithet: "the Stalwart",
    faction: "Welsh",
    startCountyId: "CRN",
    perkName: "Stones of Caernarfon",
    perkDescription: "+1.5% defense per wall level",
    perkType: "DEF_PER_WALL_LEVEL",
    perkValue: 0.015,
    heroArtPath: "assets/faction_select/heroes/alphonsus/hero.png",
    cardArtPath: "assets/faction_select/cards/alphonsus.png",
  },
  {
    id: "douglas",
    name: "Douglas",
    epithet: "the Industrious",
    faction: "Picts",
    startCountyId: "STL",
    perkName: "Hammer and Hearth",
    perkDescription: "+10% mining productivity",
    perkType: "MINING_MULT",
    perkValue: 0.10,
    heroArtPath: "assets/faction_select/heroes/douglas/hero.png",
    cardArtPath: "assets/faction_select/cards/douglas.png",
  },
  {
    id: "edmund",
    name: "Edmund",
    epithet: "Ironside",
    faction: "English",
    startCountyId: "SMS",
    perkName: "Iron Discipline",
    perkDescription: "+5% infantry attack",
    perkType: "INF_ATTACK_MULT",
    perkValue: 0.05,
    heroArtPath: "assets/faction_select/heroes/edmund/hero.png",
    cardArtPath: "assets/faction_select/cards/edmund.png",
  },
  {
    id: "ulmann",
    name: "Ulmann",
    epithet: "the Studious",
    faction: "Swiss Scholars",
    startCountyId: "OXD",
    perkName: "The Learned Circle",
    perkDescription: "+5% research rate",
    perkType: "RESEARCH_RATE_MULT",
    perkValue: 0.05,
    heroArtPath: "assets/faction_select/heroes/ulmann/hero.png",
    cardArtPath: "assets/faction_select/cards/ulmann.png",
  },
];

export function getLeader(id: LeaderId): Leader {
  const leader = LEADERS.find((l) => l.id === id);
  if (!leader) throw new Error(`Unknown leader id: ${id}`);
  return leader;
}

// Use for images: <img src={assetUrl(leader.heroArtPath)} />
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}
