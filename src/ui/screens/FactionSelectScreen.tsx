import React from "react";
import { LEADERS, assetUrl, getLeader } from "../../data/leaders";
import type { LeaderId } from "../../data/leaders";

type Props = {
  initialSelectedId?: LeaderId;
  onConfirm: (leaderId: LeaderId) => void;
};

export default function FactionSelectScreen({ initialSelectedId, onConfirm }: Props) {
  const [selectedId, setSelectedId] = React.useState<LeaderId | null>(null);
  const [hoveredId, setHoveredId] = React.useState<LeaderId | null>(null);

  const displayedId = hoveredId ?? selectedId ?? initialSelectedId ?? LEADERS[0].id;
  const displayed = getLeader(displayedId);
  const selectedLeader = selectedId ? getLeader(selectedId) : null;

  React.useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlOverscroll = html.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      html.style.overflow = previousHtmlOverflow;
      html.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, []);

  return (
    <div style={styles.root}>
      {/* Left: Hero */}
      <div style={styles.left}>
        <div style={styles.heroFrame}>
          <div style={styles.heroImageWrap}>
            <img
              src={assetUrl(displayed.heroArtPath)}
              alt={`${displayed.name} hero`}
              style={styles.heroImage}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <div style={styles.heroFallback} />
            <div style={styles.heroBottomFade} />
          </div>

          <div style={styles.heroText}>
            <div style={styles.nameRow}>
              <div style={styles.name}>{displayed.name}</div>
              <div style={styles.epithet}>{displayed.epithet}</div>
            </div>

            <div style={styles.metaRow}>
              <span style={styles.badge}>{displayed.faction}</span>
              <span style={styles.badge}>Start: {displayed.startCountyId}</span>
            </div>

            <div style={styles.perkBlock}>
              <div style={styles.perkTitle}>{displayed.perkName}</div>
              <div style={styles.perkDesc}>{displayed.perkDescription}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Cards */}
      <div style={styles.right}>
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Choose Your Leader</div>
          <div style={styles.panelHelper}>Click a leader to select.</div>

          <div style={styles.grid}>
            {LEADERS.map((l) => {
              const isSelected = l.id === selectedId;
              const isPreview = l.id === hoveredId && !isSelected;
              return (
                <button
                  aria-pressed={isSelected}
                  key={l.id}
                  onBlur={() => setHoveredId((current) => (current === l.id ? null : current))}
                  onClick={() => setSelectedId(l.id)}
                  onFocus={() => setHoveredId(l.id)}
                  onMouseEnter={() => setHoveredId(l.id)}
                  onMouseLeave={() =>
                    setHoveredId((current) => (current === l.id ? null : current))
                  }
                  style={{
                    ...styles.card,
                    ...(isPreview ? styles.cardPreview : null),
                    ...(isSelected ? styles.cardSelected : null),
                  }}
                  type="button"
                >
                  <div style={styles.cardImageWrap}>
                    <img
                      src={assetUrl(l.cardArtPath)}
                      alt={`${l.name} card`}
                      style={styles.cardImage}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div style={styles.cardFallback} />
                    {isSelected && <span style={styles.cardStateBadgeSelected}>Selected</span>}
                    {isPreview && <span style={styles.cardStateBadgePreview}>Preview</span>}
                  </div>

                  <div style={styles.cardText}>
                    <div style={styles.cardName}>{l.name}</div>
                    <div style={styles.cardSub}>{l.faction}</div>
                    <div style={styles.cardPerk}>{l.perkDescription}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={styles.actions}>
            <p style={styles.selectionStatus}>
              {selectedLeader ? `Selected: ${selectedLeader.name}` : "No leader selected"}
            </p>
            <button
              disabled={!selectedId}
              style={{
                ...styles.confirm,
                ...(!selectedId ? styles.confirmDisabled : null),
              }}
              onClick={() => {
                if (!selectedId) return;
                onConfirm(selectedId);
              }}
              type="button"
            >
              Confirm
            </button>
          </div>

          <div style={styles.tip}>
            Hover previews a leader. Click to lock your selection.
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    boxSizing: "border-box",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(21rem, 29vw)",
    gap: "clamp(0.7rem, 1.6vw, 1.35rem)",
    padding: "clamp(0.7rem, 1.8vw, 1.45rem)",
    background: "#0b0f14",
    color: "#e7e2d6",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },

  left: {
    display: "flex",
    alignItems: "stretch",
    justifyContent: "stretch",
    minWidth: 0,
    minHeight: 0,
  },

  heroFrame: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
    overflow: "hidden",
    position: "relative",
    background: "rgba(255,255,255,0.03)",
  },

  heroImageWrap: {
    position: "relative",
    height: "min(62vh, 66%)",
    minHeight: 0,
    overflow: "hidden",
    background:
      "radial-gradient(800px 400px at 30% 20%, rgba(255,255,255,0.10), transparent 60%), linear-gradient(180deg, rgba(20,26,34,0.8), rgba(8,10,12,1))",
  },

  heroImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scale(1.04) translateY(-8px)",
    filter: "contrast(1.05) saturate(1.05)",
  },

  heroFallback: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(800px 400px at 30% 20%, rgba(255,255,255,0.08), transparent 60%), linear-gradient(180deg, rgba(20,26,34,0.35), rgba(8,10,12,0.95))",
    pointerEvents: "none",
  },

  heroBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 24,
    background: "linear-gradient(180deg, rgba(8,10,12,0), rgba(8,10,12,0.95))",
    pointerEvents: "none",
  },

  heroText: {
    padding: "clamp(0.75rem, 1.45vw, 1.1rem)",
    display: "grid",
    gap: "clamp(0.36rem, 0.95vw, 0.62rem)",
    minHeight: 0,
  },

  nameRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
  },

  name: {
    fontSize: "clamp(1.4rem, 2.8vw, 2.1rem)",
    fontWeight: 800,
    letterSpacing: 0.2,
    lineHeight: 1.05,
  },

  epithet: {
    fontSize: "clamp(0.8rem, 1.25vw, 1.02rem)",
    opacity: 0.85,
  },

  metaRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  badge: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
  },

  perkBlock: {
    marginTop: "clamp(0.1rem, 0.65vw, 0.35rem)",
    padding: "clamp(0.5rem, 1.1vw, 0.72rem)",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.25)",
  },

  perkTitle: {
    fontWeight: 700,
    marginBottom: 4,
  },

  perkDesc: {
    opacity: 0.9,
    lineHeight: 1.35,
  },

  right: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    minWidth: 0,
    minHeight: 0,
  },

  panel: {
    width: "min(100%, 27rem)",
    marginLeft: "auto",
    maxHeight: "100%",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
    padding: "clamp(0.62rem, 1.18vw, 0.94rem)",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr) auto auto",
    gap: "clamp(0.5rem, 0.95vw, 0.78rem)",
    overflow: "hidden",
    minHeight: 0,
  },

  panelTitle: {
    fontSize: "clamp(0.84rem, 1.1vw, 0.98rem)",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    opacity: 0.9,
  },

  panelHelper: {
    marginTop: -4,
    fontSize: 12,
    opacity: 0.82,
    letterSpacing: 0.2,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "clamp(0.4rem, 0.9vw, 0.72rem)",
    alignContent: "start",
    minHeight: 0,
  },

  card: {
    cursor: "pointer",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(180deg, rgba(32,38,45,0.72), rgba(16,21,27,0.76))",
    padding: "clamp(0.46rem, 0.9vw, 0.68rem)",
    display: "grid",
    gridTemplateRows: "minmax(5.25rem, 6.55rem) auto",
    gap: "clamp(0.36rem, 0.78vw, 0.58rem)",
    textAlign: "left",
    transition:
      "transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease, background 200ms ease",
  },

  cardPreview: {
    borderColor: "rgba(255,255,255,0.20)",
    boxShadow: "0 8px 18px rgba(0,0,0,0.32)",
    transform: "translateY(-1px)",
  },

  cardSelected: {
    borderColor: "rgba(245, 222, 163, 0.72)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(243, 216, 154, 0.26) inset",
    background: "linear-gradient(180deg, rgba(74,57,30,0.34), rgba(24,26,30,0.84))",
    transform: "translateY(-3px)",
  },

  cardImageWrap: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    background:
      "radial-gradient(400px 200px at 30% 20%, rgba(255,255,255,0.10), transparent 60%), rgba(255,255,255,0.04)",
  },

  cardImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scale(1.03)",
  },

  cardFallback: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.35))",
    pointerEvents: "none",
  },

  cardStateBadgeSelected: {
    position: "absolute",
    top: 8,
    right: 8,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "#ffe8af",
    border: "1px solid rgba(255, 225, 158, 0.65)",
    borderRadius: 999,
    padding: "2px 7px",
    background: "rgba(94, 67, 31, 0.75)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
  },

  cardStateBadgePreview: {
    position: "absolute",
    top: 8,
    right: 8,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "rgba(233, 227, 212, 0.9)",
    border: "1px solid rgba(226, 222, 210, 0.42)",
    borderRadius: 999,
    padding: "2px 7px",
    background: "rgba(43, 49, 57, 0.72)",
  },

  cardText: {
    display: "grid",
    gap: 2,
  },

  cardName: {
    fontWeight: 800,
    fontSize: "clamp(0.78rem, 1vw, 0.92rem)",
  },

  cardSub: {
    opacity: 0.85,
    fontSize: "clamp(0.66rem, 0.86vw, 0.75rem)",
  },

  cardPerk: {
    marginTop: 4,
    opacity: 0.9,
    fontSize: "clamp(0.64rem, 0.84vw, 0.74rem)",
    lineHeight: 1.25,
  },

  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
  },

  selectionStatus: {
    margin: 0,
    fontSize: "clamp(0.66rem, 0.84vw, 0.75rem)",
    opacity: 0.84,
  },

  confirm: {
    cursor: "pointer",
    borderRadius: 14,
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.10)",
    color: "#e7e2d6",
    fontWeight: 700,
    letterSpacing: 0.2,
    transition: "transform 180ms ease, opacity 180ms ease, border-color 180ms ease",
  },

  confirmDisabled: {
    cursor: "not-allowed",
    opacity: 0.45,
    border: "1px solid rgba(255,255,255,0.10)",
  },

  tip: {
    fontSize: 12,
    opacity: 0.75,
    lineHeight: 1.35,
  },
};
