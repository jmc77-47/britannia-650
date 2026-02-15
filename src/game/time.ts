export const CAMPAIGN_START_YEAR = 650

export const getDisplayYear = (turnNumber: number): number =>
  CAMPAIGN_START_YEAR + Math.floor(Math.max(0, turnNumber) / 4)
