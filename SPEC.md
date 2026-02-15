# Dark Ages Map — V1 Spec (UI-first)

## Premise
- Great Britain only (England/Scotland/Wales), 650 AD.
- 86 counties total (39 England, 34 Scotland, 13 Wales) using the provided TopoJSON.
- Conquest-only system (no vassalisation for V1).

## Top Priority
- Stunning macro map UI and interaction (pan/zoom, hover, selection, info panel).
- Macro map shows faction coloring by county, plus fog-of-war.
- Micro view exists but can be minimal V1 (a “county panel” with a simple town visualization placeholder).

## Data files (served at /data/*)
- /data/counties_gb_s05.topo.json (default map)
- /data/counties_gb_s20.topo.json (light map)
- /data/counties_gb.topo.json (medium map)
- /data/county_metadata.json
- /data/kingdoms.json
- /data/deepwater_ports.json
- /data/starts.json

## Starting characters
- Alphonsus the Stalwart — start CRN — +1.5% defense per wall level
- Douglas the Industrious — start STL — +10% mining productivity
- Edmund Ironside — start SMS — +5% infantry attack
- Ulmann the Studious — start OXD — +5% research rate

## Deepwater ports (7)
- GLM, MLT, LNK, MSX, GLC, LCS, NHB
- Capturing one is a major unlock (trade boost later; can be a label/flag V1).

## Mechanics to represent in UI (V1 “visible scaffolding”)
- Roads: upgradeable, expensive, meaningful trade improvements (can be stubbed but UI should exist).
- Kingdom-wide research: single shared research bar/queue (stub ok).
- Troop types:
  Spearmen, Armored Swordsmen, House Carls, Archers, Light Cavalry, Heavy Cavalry, Rams, Trebuchets.

## Macro map requirements
- Real geographic map (TopoJSON counties).
- One unified border overlay (avoid double borders).
- Hover tooltip: county name, owner, prosperity, industrialization, port flags.
- Click selects county; right panel shows details + quick actions (“Quick Build”, “View County”).

## “Quick Build” (macro)
- From macro panel, allow queueing at least 1 building upgrade stub per county (no deep simulation needed V1).

