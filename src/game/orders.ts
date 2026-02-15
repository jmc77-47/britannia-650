import type { GameState } from './state'

type OrderCategory = 'BUILD' | 'TROOPS' | 'RESEARCH' | 'POLICIES'

interface BaseMacroOrder {
  id: string
  type: OrderCategory
  countyId: string
  issuedOnTurn: number
}

export interface BuildOrder extends BaseMacroOrder {
  type: 'BUILD'
  buildingType: string
}

export interface TroopsOrder extends BaseMacroOrder {
  type: 'TROOPS'
  unitType: string
  amount: number
}

export interface ResearchOrder extends BaseMacroOrder {
  type: 'RESEARCH'
  researchId: string
}

export interface PoliciesOrder extends BaseMacroOrder {
  type: 'POLICIES'
  policyId: string
}

export type MacroOrder =
  | BuildOrder
  | TroopsOrder
  | ResearchOrder
  | PoliciesOrder

export interface OrderValidationResult {
  orderId: string
  isValid: boolean
  reason?: string
}

export const validateOrder = (
  order: MacroOrder,
  state: GameState,
): OrderValidationResult => {
  if (!state.counties[order.countyId]) {
    return {
      orderId: order.id,
      isValid: false,
      reason: `Unknown county: ${order.countyId}`,
    }
  }

  return {
    orderId: order.id,
    isValid: true,
  }
}

export const validateOrders = (
  orders: MacroOrder[],
  state: GameState,
): OrderValidationResult[] =>
  orders.map((order) => validateOrder(order, state))
