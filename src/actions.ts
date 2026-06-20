export const ACTIONS = ["softban", "ban"] as const;
export type HoneypotAction = (typeof ACTIONS)[number];

export function isHoneypotAction(value: unknown): value is HoneypotAction {
  return typeof value === "string" && ACTIONS.includes(value as HoneypotAction);
}
