# UI-first rules for this repo

1) UI polish > gameplay correctness (V1).
2) Macro map: county fills have NO stroke; draw ONE unified border overlay on top (avoid double-stroking).
   Use vector-effect="non-scaling-stroke", rounded joins/caps.
3) Micro view: SVG living diorama with tiered upgrades + ambient animations.
4) Smooth UX: hover, tooltip, panel transitions, pan/zoom.
5) Data served from /public/data and fetched via /data/*.
Default topojson: /data/counties_gb_s05.topo.json
