/** Parsed expressions. `from`/`to` are character offsets in the typed text. */

interface Span {
  from: number;
  to: number;
}

export type Node =
  | (Span & { k: "num"; v: number; raw: string })
  | (Span & { k: "var"; name: string })
  | (Span & { k: "const"; name: "pi" | "e" | "j" })
  | (Span & { k: "param"; name: string })
  | (Span & { k: "neg"; a: Node })
  | (Span & { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node; implicit?: boolean })
  | (Span & { k: "call"; fn: string; args: Node[] });

export interface Problem {
  message: string;
  from: number;
  to: number;
}

export type ParseResult =
  | { ok: true; ast: Node; params: string[]; warnings: Problem[] }
  | { ok: false; error: Problem };

/** Visit every node, depth first. */
export function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  switch (node.k) {
    case "neg":
      walk(node.a, visit);
      break;
    case "bin":
      walk(node.a, visit);
      walk(node.b, visit);
      break;
    case "call":
      for (const a of node.args) walk(a, visit);
      break;
  }
}

/** True when the expression mentions the variable anywhere. */
export function usesVar(node: Node): boolean {
  let found = false;
  walk(node, (n) => {
    if (n.k === "var") found = true;
  });
  return found;
}
