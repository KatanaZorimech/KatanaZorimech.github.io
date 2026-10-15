/**
 * 宠物 FSM 占位 — 阶段 B 实现。
 * 计划状态：idle / drag / click / happy（及后续 talk / think）。
 */
export type PetState = "idle" | "drag" | "click" | "happy";

export function createPetFsm(): { state: PetState; transition: (next: PetState) => void } {
  let state: PetState = "idle";
  return {
    get state() {
      return state;
    },
    transition(next: PetState) {
      state = next;
    },
  };
}
