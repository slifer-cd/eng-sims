"use client";

import katex from "katex";
import { memo, useMemo } from "react";

/** KaTeX-rendered math. The LaTeX comes from the engine, never from raw user text. */
export const Tex = memo(function Tex(props: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(
    () =>
      katex.renderToString(props.tex, {
        displayMode: props.display ?? false,
        throwOnError: false,
        strict: "ignore",
        output: "html",
      }),
    [props.tex, props.display],
  );
  return <span className={props.className} dangerouslySetInnerHTML={{ __html: html }} />;
});
