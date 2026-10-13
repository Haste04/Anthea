# Dark mode refinement audit

## Implementation and verification

The existing forest, cream, mint, and saffron palette remains unchanged. The former error color is retained as `--danger-text`; `--danger` now supplies the requested stronger solid/icon color. `--card` aliases the existing card surface.

Changed files:

- `app/theme.css`: new dark tokens, stronger control boundaries, selected navigation indicator, raised inputs, card shadows, location/attention chips, and semantic error text.
- `app/home/HomeGarden.module.css`: token-based glow behind the cactus; original cream headings and mint italic text preserved.
- `app/dashboard/Dashboard.module.css`: raised composer, focus treatment, saffron suggestion numbers and labels, hover colors, quiet dividers, semantic error colors.
- `app/components/workspace/WorkspacePages.tsx`: conditional styling class on the existing location chip; no DOM restructuring or copy changes.
- `app/welcome/welcome.module.css`: existing dark photograph overlay moved to a theme token.
- This report: pre-edit literal-color inventory, final palette, and measured verification results.

All refinements are scoped to `html[data-theme="dark"]`. Exact computed light-mode styles matched pre-edit snapshots across `/`, `/home`, `/dashboard`, `/plants`, `/settings`, and `/welcome`. Browser screenshots and overflow checks covered 390px and 1440px viewports, including seeded plant cards with and without a location. The data was created only in an isolated test browser context.

397 sampled visible text elements passed their applicable text contrast threshold. The lowest sampled body-text ratio was 5.88:1 for the warm attention chip. Calculations composite translucent CSS fills over their backgrounds; photographic pixels, artwork, disabled controls, and unvisited interaction states are not an exhaustive accessibility certification. Decorative borders are intentionally quieter than control boundaries.

| Contrast check | Ratio | Result / treatment |
| --- | ---: | --- |
| Original border against card | 2.16:1 | Insufficient as the sole control boundary; kept for decorative uses. |
| Original border against raised input | 1.89:1 | Replaced on controls by `--control-border`; base token unchanged. |
| New control boundary against raised input | 3.97:1 | Pass. |
| New control boundary against selected surface | 3.31:1 | Pass. |
| Requested translucent focus ring alone against raised input | 2.71:1 | Retained, with the opaque mint `--focus-outline` added. |
| Opaque focus outline against raised input | 7.20:1 | Pass; chat uses its enclosing composer focus treatment. |
| Dark primary-button text against mint | 10.28:1 | Pass. |
| Muted text against raised surface | 6.18:1 | Pass. |
| Error text against raised surface | 7.21:1 | Pass. |
| Solid danger color against raised surface | 4.21:1 | Pass for icons; use `--danger-text` for body text. |
| Info against raised surface | 6.38:1 | Pass. |
| Success against raised surface | 7.07:1 | Pass. |

## Final token table

| Token | Final value |
| --- | --- |
| `--background` | `#0E1C16` |
| `--surface-soft` | `#16271E` |
| `--surface`, `--card` | `#1B3025` |
| `--selected` | `#284735` |
| `--border` | `#496451` |
| `--text-primary` | `#F5EEDB` |
| `--text-secondary` | `#CCD9CC` |
| `--text-muted` | `#A9BDAA` |
| `--primary` | `#8FD5AE` |
| `--primary-hover` | `#B1E6C6` |
| `--accent` | `#FFB347` |
| `--surface-raised` | `#213A2D` |
| `--border-subtle` | `#2F4A3A` |
| `--accent-tint` | `rgba(143,213,174,0.12)` |
| `--accent-glow` | `rgba(143,213,174,0.08)` |
| `--focus-ring` | `0 0 0 2px rgba(143,213,174,0.45)` |
| `--warm-tint` | `rgba(255,179,71,0.14)` |
| `--success` | `#6FD99B` |
| `--warning` | `#FFB347` |
| `--danger` | `#E5776B` |
| `--danger-text` | `#FFB4A4` |
| `--info` | `#7DC4E4` |
| `--shadow-card` | `0 8px 24px rgba(0,0,0,0.35)` |
| `--control-border` | 50% mix of existing border and mint |
| `--tag-border` | 55% mint mixed with the card surface |
| `--focus-outline` | Existing mint `--primary` |
| `--nav-hover` | Raised surface at 60% opacity |
| `--workspace-overlay` | Existing background at 98% → 90% opacity |
| `--welcome-overlay` | Existing background at 82% → 92% opacity |

Compatibility tokens such as `--primary-active`, `--selected-strong`, `--border-soft`, `--surface-glass`, `--accent-soft`, `--accent-text`, and `--shadow-soft` retain their previous values. Existing light-only paint and decorative SVG/image colors are deliberately preserved; effective dark UI styles use theme variables. No new literal colors were added to components. The inventory below includes these intentional light/artwork literals so their presence is visible rather than silently omitted.

Success and info colors are available as tokens, without inventing new statuses. The attention chip keeps its existing “Add a location” label; error/delete actions retain their visible text and icons. Layout, fonts, copy, component structure, behavior, and voice integrations are unchanged.

Baseline inventory recorded before the refinement. Literal colors below include legacy light styles and decorative artwork; presence alone is not a dark-mode or accessibility violation. Dark UI overrides are evaluated separately.

Dark palette: `app/theme.css`. Light palette: `app/globals.css`. Tailwind is imported there, with no separate color configuration.

Actual dark-mode literals to replace: workspace photograph overlay in `app/theme.css` (14 28 22 at 98%/90%); home glow (53 91 68 at 30%); companion glow (53 91 68 at 40%).

## Existing component literal inventory

### app/components/cactea/Cactea.module.css

- Line 56: `rgb(27 67 50 / 12%)`
- Line 193: `#367747`
- Line 195: `#73b965`, `#367747`
- Line 196: `#a1ce77`, `#367747`
- Line 319: `rgb(20 38 26 / 45%)`
- Line 345: `rgb(33 150 243 / 85%)`
- Line 346: `rgb(156 39 176 / 85%)`
- Line 347: `rgb(76 175 80 / 85%)`
- Line 348: `rgb(255 152 0 / 85%)`
- Line 349: `rgb(244 67 54 / 85%)`
- Line 350: `rgb(0 188 212 / 85%)`

### app/components/cactea/FaceExpressions.tsx

- Line 5: `#17251b`
- Line 6: `#45624b`
- Line 14: `#24452d`
- Line 23: `#173c26`, `#387a35`
- Line 24: `#dc9387`
- Line 26: `#173c26`, `#387a35`
- Line 27: `#fff9df`
- Line 28: `#dc9387`
- Line 36: `#24452d`
- Line 44: `#173c26`
- Line 52: `#173c26`

### app/components/workspace/WorkspacePages.tsx

- Line 73: `#3c6944`
- Line 76: `#47774e`
- Line 77: `#719450`
- Line 78: `#88a95f`
- Line 79: `#315e41`
- Line 80: `#d0ae8d`
- Line 81: `#dfc3a3`

### app/dashboard/Dashboard.module.css

- Line 294: `rgb(109 126 95 / 18%)`
- Line 300: `rgb(255 251 225 / 70%)`
- Line 301: `rgb(250 247 236 / 90%)`, `rgb(244 240 225 / 83%)`, `rgb(238 236 219 / 79%)`
- Line 302: `rgb(255 255 255 / 70%)`, `rgb(67 77 51 / 10%)`
- Line 307: `#b9c6b4`
- Line 310: `#294632`
- Line 313: `rgb(255 253 245 / 78%)`, `rgb(245 247 235 / 60%)`
- Line 314: `rgb(107 132 103 / 29%)`
- Line 316: `rgb(255 255 255 / 79%)`, `rgb(67 77 51 / 4%)`
- Line 318: `#e9edde`
- Line 320: `rgb(219 233 212 / 83%)`, `rgb(236 238 220 / 74%)`
- Line 321: `#89a68c`
- Line 323: `rgb(255 253 245 / 78%)`
- Line 327: `rgb(249 246 235 / 80%)`, `rgb(245 241 226 / 94%)`
- Line 331: `rgb(255 254 247 / 88%)`, `rgb(246 248 237 / 82%)`
- Line 332: `rgb(106 131 103 / 35%)`
- Line 333: `rgb(255 255 255 / 90%)`, `rgb(55 74 49 / 8%)`
- Line 337: `rgb(232 237 218 / 83%)`, `rgb(245 241 222 / 79%)`
- Line 338: `rgb(118 139 103 / 28%)`
- Line 339: `rgb(255 255 255 / 67%)`
- Line 342: `#3f694c`, `#2f5b42`
- Line 343: `#315b42`
- Line 344: `rgb(255 255 255 / 18%)`, `rgb(49 84 57 / 15%)`
- Line 346: `#edf1e7`, `#315b42`
- Line 347: `#e4eadd`
- Line 350: `rgb(255 253 245 / 87%)`, `rgb(245 248 238 / 72%)`
- Line 352: `rgb(58 72 49 / 6%)`
- Line 354: `#365e45`
- Line 360: `rgb(255 248 211 / 48%)`
- Line 363: `rgb(53 65 37 / 20%)`
- Line 366: `rgb(255 252 240 / 87%)`, `rgb(242 242 224 / 79%)`
- Line 367: `rgb(115 132 101 / 28%)`
- Line 368: `rgb(255 255 255 / 75%)`, `rgb(62 72 49 / 12%)`
- Line 371: `#f5f3e6`, `rgb(115 132 101 / 28%)`
- Line 373: `rgb(251 248 236 / 77%)`, `rgb(238 240 221 / 65%)`
- Line 374: `rgb(113 130 100 / 24%)`
- Line 375: `rgb(255 255 255 / 62%)`
- Line 378: `rgb(250 248 238 / 48%)`
- Line 411: `rgb(53 91 68 / 40%)`
- Line 422: `rgb(111 132 102 / 33%)`
- Line 425: `rgb(255 252 229 / 75%)`
- Line 426: `rgb(250 248 237 / 96%)`, `rgb(239 241 225 / 94%)`
- Line 427: `rgb(255 255 255 / 84%)`, `rgb(54 75 50 / 8%)`
- Line 436: `rgb(83 125 81 / 20%)`
- Line 438: `rgb(221 233 212 / 76%)`
- Line 439: `#356747`
- Line 453: `rgb(117 138 106 / 28%)`
- Line 455: `rgb(255 254 247 / 78%)`
- Line 456: `rgb(61 75 52 / 5%)`
- Line 470: `rgb(113 132 102 / 20%)`
- Line 476: `rgb(111 132 102 / 31%)`
- Line 478: `rgb(255 253 244 / 60%)`
- Line 481: `rgb(255 255 255 / 64%)`
- Line 483: `#78957a`, `#eef2e5`
- Line 494: `#315d43`
- Line 496: `#3d694b`, `#2f5a41`
- Line 497: `#fffdf4`
- Line 500: `rgb(255 255 255 / 17%)`, `rgb(37 70 44 / 15%)`
- Line 502: `#285239`
- Line 503: `#21452f`
- Line 516: `#789477`
- Line 518: `#fffdf2`
- Line 519: `rgb(49 75 46 / 22%)`, `#fff`
- Line 526: `#fffdf2`
- Line 527: `#789477`
- Line 531: `#527452`
- Line 548: `#274a33`
- Line 553: `#537e59`
- Line 554: `#08704b`
- Line 562: `#d7e2d2`
- Line 563: `#526854`
- Line 571: `#246545`
- Line 576: `#074d31`
- Line 578: `#16744a`
- Line 600: `#28714d`
- Line 609: `#294b37`
- Line 617: `#506451`
- Line 635: `#275c3c`
- Line 637: `#2d6945`
- Line 638: `rgb(42 88 56 / 16%)`, `rgb(255 255 255 / 18%)`
- Line 639: `#fffdf3`
- Line 646: `#24583a`
- Line 647: `#1b4930`
- Line 653: `#315d42`
- Line 662: `#667662`
- Line 663: `#536953`
- Line 664: `#3c6449`
- Line 671: `rgb(105 129 101 / 29%)`
- Line 673: `rgb(255 253 243 / 92%)`, `rgb(242 246 232 / 87%)`
- Line 674: `rgb(255 255 255 / 83%)`, `rgb(70 83 58 / 8%)`
- Line 677: `#547459`
- Line 678: `#294b37`
- Line 679: `#617661`
- Line 680: `#225a3b`
- Line 691: `rgb(114 139 111 / 22%)`
- Line 693: `#294b37`
- Line 698: `rgb(222 237 218 / 42%)`
- Line 699: `rgb(211 230 207 / 63%)`
- Line 701: `#759176`
- Line 704: `#607461`
- Line 705: `#4e7b57`
- Line 706: `#617461`
- Line 710: `#1c7048`
- Line 739: `#517a56`
- Line 763: `#294b37`
- Line 764: `#69806b`
- Line 771: `#cbdcc8`
- Line 773: `#eaf2e6`
- Line 774: `#36704b`
- Line 784: `#cddbc8`
- Line 786: `rgb(255 254 248 / 78%)`
- Line 787: `rgb(255 255 255 / 80%)`
- Line 788: `#315b41`
- Line 791: `#4b8058`
- Line 792: `#677969`
- Line 799: `#294b37`
- Line 810: `#fffdf4`
- Line 811: `#294b37`
- Line 812: `#2d6945`
- Line 815: `#91b296`, `#f0f5e9`
- Line 816: `#1e7048`
- Line 834: `rgb(106 131 103 / 35%)`
- Line 837: `rgb(255 255 255 / 90%)`, `rgb(55 74 49 / 8%)`

### app/globals.css

- Line 4: `#133020`
- Line 5: `#046241`
- Line 6: `#ffb347`
- Line 7: `#f5eedb`
- Line 9: `#ffffff`
- Line 10: `#fbf8ef`
- Line 11: `rgb(255 255 255 / 88%)`
- Line 13: `#3e5948`
- Line 14: `#516858`
- Line 15: `#c5d4c7`
- Line 16: `#dce5dc`
- Line 18: `#034f35`
- Line 19: `#023d2a`
- Line 20: `#e8f1e9`
- Line 21: `#d9e9dc`
- Line 23: `#fff2db`
- Line 24: `#65420b`
- Line 25: `#8d463a`
- Line 26: `rgb(19 48 32 / 9%)`
- Line 695: `rgb(162 218 114 / 16%)`, `rgb(110 193 87 / 38%)`, `rgb(62 153 86 / 28%)`

### app/home/HomeGarden.module.css

- Line 3: `#f6f1e5`
- Line 7: `#f6f1e5`
- Line 8: `#e3ede4`
- Line 9: `#075c42`
- Line 10: `#203b2c`
- Line 11: `#526655`
- Line 12: `#d5dece`
- Line 16: `#e3ede480`
- Line 34: `#fffdf5`, `#075c4210`
- Line 39: `#f0f4e7`, `#e1ebd9`, `#c8dabc`, `#b8ccac`, `#f6f1e560`
- Line 40: `#fffdf566`
- Line 41: `#698568`
- Line 43: `#90ac7e`
- Line 45: `#7f9271`
- Line 54: `#45613a0d`
- Line 55: `#355c3e32`, `#355c3e00`
- Line 56: `#577a4d`
- Line 58: `#759865`
- Line 62: `#075c4209`
- Line 65: `#f6f1e500`
- Line 76: `#b5c7ac`
- Line 86: `#e4e9d9`, `#d4dfc8`, `#afc09f66`
- Line 87: `#eae5d6`, `#e0d9c7`
- Line 88: `#e1e9df`, `#cadbca`
- Line 90: `#fffdf595`, `#f6f1e5e6`
- Line 91: `#203b2c0c`
- Line 96: `#203b2c12`
- Line 97: `#e3ede466`
- Line 105: `#e3ede4`
- Line 114: `#638266`
- Line 121: `#ffffff`
- Line 122: `#ffc370`
- Line 163: `rgb(53 91 68 / 30%)`
- Line 182: `#034b36`, `#075c421b`
- Line 187: `#fffdf5`
- Line 188: `#e3ede480`
- Line 189: `#e3ede480`
- Line 254: `#9cb393`

### app/home/HomeGarden.tsx

- Line 27: `#f6f1e5`
- Line 32: `#f6f1e5`
- Line 33: `#f6f1e5`
- Line 40: `#426849`
- Line 41: `#47774e`
- Line 42: `#719450`
- Line 43: `#88a95f`
- Line 44: `#315e41`
- Line 45: `#d0ae8d`, `#dfc3a3`

### app/Landing.module.css

- Line 111: `rgb(245 238 219 / 25%)`
- Line 120: `rgb(245 238 219 / 28%)`
- Line 127: `rgb(255 179 71 / 8%)`, `rgb(255 179 71 / 5%)`
- Line 252: `rgb(245 238 219 / 22%)`

### app/welcome/welcome.module.css

- Line 74: `rgb(14 28 22 / 82%)`, `rgb(14 28 22 / 92%)`

### app/workspace.css

- Line 89: `#f1ead8`
- Line 90: `#faf7ed`
- Line 91: `#f5f0e3`
- Line 92: `rgb(250 247 237 / 85%)`
- Line 93: `#243b2d`
- Line 94: `#475b4b`
- Line 95: `#5e705f`
- Line 96: `#cdd4c3`
- Line 97: `#dce1d3`
- Line 98: `#315c43`
- Line 99: `#254b36`
- Line 100: `#1e3c2c`
- Line 101: `#e6ebde`
- Line 102: `#d7e1d2`
- Line 103: `rgb(53 63 42 / 12%)`
- Line 105: `rgb(255 248 218 / 62%)`
- Line 106: `rgb(246 241 225 / 96%)`, `rgb(246 241 225 / 94%)`, `rgb(246 241 225 / 76%)`, `rgb(246 241 225 / 12%)`
- Line 110: `rgb(250 248 239 / 68%)`
- Line 111: `rgb(111 132 103 / 32%)`
- Line 112: `rgb(65 76 52 / 5%)`
- Line 116: `rgb(255 251 224 / 78%)`
- Line 117: `rgb(220 231 210 / 96%)`, `rgb(237 235 210 / 96%)`
- Line 118: `rgb(119 144 111 / 29%)`
- Line 119: `rgb(255 255 255 / 66%)`, `rgb(61 77 50 / 7%)`
- Line 121: `#517a56`
- Line 122: `#294632`
- Line 123: `#4c624f`
- Line 127: `rgb(245 240 225 / 89%)`, `rgb(245 240 225 / 91%)`
- Line 140: `#ffffff`
- Line 141: `#f9f7f7`
- Line 148: `#ffffff`
- Line 149: `#ffffff`
- Line 150: `#ffffff`
- Line 151: `#ffffff`
- Line 152: `rgb(19 48 32 / 9%)`
