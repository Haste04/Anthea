# Bundled fonts

These variable fonts come from the official [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl) and Google Fonts API:

- `Fraunces.woff2`: Google Fonts CSS API, `family=Fraunces:opsz,wght@14,600..700`, requesting every printable character supported by `fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf` through the `text` parameter. Optical size is pinned to 14, matching the previous Google loader's font; only the weight axis varies.
- `Manrope.woff2`: lossless WOFF2 compression of `manrope/Manrope[wght].ttf`.
- `SourceSans3.woff2`: lossless WOFF2 compression of `sourcesans3/SourceSans3[wght].ttf`.

Each font's SIL Open Font License is included alongside it. The files retain their supported printable characters and weight ranges. WOFF2 compression was performed with `wawoff2` 2.0.1 as a temporary tool; it is not an application dependency.

`app/layout.tsx` loads these files with `next/font/local`. Keep them in Git so Vercel builds do not fetch Google Fonts or encounter the extensionless font URL parsing failure in [Next.js issue #99114](https://github.com/vercel/next.js/issues/99114).
