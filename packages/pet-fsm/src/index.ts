/**
 * 宠物动画有限状态机。
 * 状态：idle / drag / click / happy / think / talk
 */

export type PetState = "idle" | "drag" | "click" | "happy" | "think" | "talk";

export type PetEvent =
  | "DRAG_START"
  | "DRAG_END"
  | "CLICK"
  | "DOUBLE_CLICK"
  | "CONTEXT"
  | "THINK_START"
  | "TALK_START"
  | "REPLY_END"
  | "TIMEOUT";

export type PetFsmListener = (state: PetState, prev: PetState) => void;

export type PetFsm = {
  readonly state: PetState;
  dispatch: (event: PetEvent) => PetState;
  subscribe: (listener: PetFsmListener) => () => void;
  reset: () => void;
};

const CLICK_MS = 900;
const HAPPY_MS = 1600;
const CONTEXT_MS = 500;
const TALK_TAIL_MS = 900;

export function createPetFsm(): PetFsm {
  let state: PetState = "idle";
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<PetFsmListener>();

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const setState = (next: PetState, autoIdleMs?: number) => {
    const prev = state;
    state = next;
    clearTimer();
    if (
      autoIdleMs !== undefined &&
      next !== "idle" &&
      next !== "drag" &&
      next !== "think" &&
      next !== "talk"
    ) {
      timer = setTimeout(() => {
        if (state === next) {
          state = "idle";
          for (const listener of listeners) listener("idle", next);
        }
      }, autoIdleMs);
    }
    for (const listener of listeners) listener(state, prev);
    return state;
  };

  const dispatch = (event: PetEvent): PetState => {
    switch (event) {
      case "DRAG_START":
        return setState("drag");
      case "DRAG_END":
        return setState("idle");
      case "CLICK":
        if (state === "drag" || state === "think" || state === "talk") return state;
        return setState("click", CLICK_MS);
      case "DOUBLE_CLICK":
        if (state === "think" || state === "talk") return state;
        return setState("happy", HAPPY_MS);
      case "CONTEXT":
        return setState("click", CONTEXT_MS);
      case "THINK_START":
        return setState("think");
      case "TALK_START":
        return setState("talk");
      case "REPLY_END":
        return setState("happy", TALK_TAIL_MS);
      case "TIMEOUT":
        return setState("idle");
      default:
        return state;
    }
  };

  return {
    get state() {
      return state;
    },
    dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      clearTimer();
      const prev = state;
      state = "idle";
      if (prev !== "idle") {
        for (const listener of listeners) listener("idle", prev);
      }
    },
  };
}
