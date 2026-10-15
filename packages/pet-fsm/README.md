# @desktop-pet/pet-fsm

阶段 B 宠物状态机：`idle` / `drag` / `click` / `happy`。

```ts
import { createPetFsm } from "@desktop-pet/pet-fsm";

const fsm = createPetFsm();
fsm.subscribe((state) => console.log(state));
fsm.dispatch("CLICK");
```
