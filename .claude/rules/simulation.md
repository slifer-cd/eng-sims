---
paths:
  - "lib/sim/**"
  - "lib/model/**"
---

# Simulation engine and data model

- `lib/model/`: plain serialisable data (`ChipDef`, `Circuit`, `ComponentInst`, `Wire`). A custom chip's external pins *are* the Input/Output Pin components inside its circuit: `PinDef.id` equals the inner component's id, and `derivePins` builds the pin list.
- `lib/sim/` is pure TS with no React or DOM imports, so it can move into a Web Worker later. Keep it that way.
  - `value.ts`: 4-state (0/1/Z/X) values up to 32 bits wide, packed as bitplanes `{v, z, x}`. Always build values with `make()` so that comparing with `equals` works.
  - `builtins.ts`: the registry of uneditable primitives. Pins depend on props such as `width`, `inputs` and `parts`.
  - `compile.ts`: flattens nested custom chips into primitives plus nets, using union-find over string keys (`pinKey(path, compId, pinId)`; instance paths look like `"adder1/"`). Input/Output Pins inside a nested chip are not primitives; their nets merge with the parent's nets.
  - `engine.ts`: event-driven, with a FIFO queue that evaluates one primitive at a time (not delta cycles). This deliberately breaks the symmetry of cross-coupled gates, so latches built from gates settle. An evaluation budget flags oscillation. Several drivers on one net are combined with `resolveAll`: lone Z drivers lose, and disagreeing drivers produce X. A primitive can keep state besides its outputs (`initialState`; read it with `engine.state(path, compId)`), and that state carries over through `previous` too. A primitive with no outputs and no state (an Output Pin, LED or 7-segment display) is not compiled into a primitive at all: views read its input pins with `pinValue`.
  - `display.ts`: the 16×16 screens are double-buffered. On a rising `clk` edge, `clear` wipes the buffer, then `write` stores pixel (x, y), then `show` copies the buffer to `screen`. `screen` is replaced rather than mutated, so views can compare it by reference.
