import type { CacteaState } from "@/lib/cactea-state";
export type { CacteaState } from "@/lib/cactea-state";

export type CacteaSize = "sm" | "md" | "lg" | "hero";

export type CacteaProps = {
  state: CacteaState;
  size?: CacteaSize;
  className?: string;
  ariaLabel?: string;
  interactive?: boolean;
  stationary?: boolean;
  lively?: boolean;
  chatExpressions?: boolean;
  barrelRoll?: boolean;
};
