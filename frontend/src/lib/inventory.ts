import type { QueryClient } from "@tanstack/react-query";
import type { User } from "./types";

/** Refetch every inventory view. Call after anything that moves stock — including
 *  saving test results, which auto-deducts mapped reagents on the server. */
export function invalidateInventory(qc: QueryClient): void {
  for (const key of ["inventory", "inventory-stats", "inventory-low", "inventory-tx", "inventory-usage"]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export function canManageInventory(user: User | null | undefined): boolean {
  if (!user || user.role === "customer") return false;
  return user.role === "admin" || !!user.can_manage_inventory;
}
