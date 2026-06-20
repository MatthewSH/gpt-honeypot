export const ACTIONS = ["timeout", "kick", "softban", "ban", "disabled"] as const;
export type HoneypotAction = typeof ACTIONS[number];

export function isHoneypotAction(value: string | null): value is HoneypotAction {
  return typeof value === "string" && ACTIONS.includes(value as HoneypotAction);
}
