# Vora — Visual Identity & Design System

**Vora — Voice-Operated Responsive Assistant.**
A Chrome extension that gives people who cannot use a mouse or keyboard full control of any website through natural-language voice commands.

The visual identity should feel confident, calm, accessible, and modern — not childish, not aggressive, not "AI-techy" in the chrome-and-neon sense. Purple sits intentionally between the trustworthy blue of accessibility tools and the energetic warmth of voice-driven products.

---

## 1. Logo

### 1.1 Primary mark

The mark is a stylized lowercase "v" knocked out in white from a vertical purple gradient on a rounded square. The V form simultaneously reads as a soundwave funnel, a downward-pointing arrow (commit / execute), and the letter V.

The V is composed of **three distinct white shapes** — preserve this structure exactly:

- **Long blade** (left-leaning, drawn first) — a four-cornered polygon running from upper-left down toward the center. This is the longer of the two blades; its bottom corner sits lowest of any V element.
- **Short blade** (right-leaning, drawn second) — a four-cornered polygon running from upper-right down toward the center. Shorter than the long blade and ends earlier.
- **Connecting lens** (drawn third) — a small horizontal teardrop with a curved underside that bridges the gap below the short blade and ties the composition together.

The asymmetry is deliberate and load-bearing: the two blades have different top-cut angles (~10° on the long blade vs ~12° on the short blade) and the long blade reaches further down. **Never mirror or rebalance.**

### 1.2 Geometry reference

For anyone reproducing or animating the mark, the canonical coordinates (source `viewBox 0 0 960 720`):

| Element | Key vertices |
|---|---|
| Rounded square | (155.81, 35.81) → (804.19, 684.19), side 648.38 px, corner radius 108.07 px (16.7% of side) |
| Long blade | (203.36, 154.64) · (354.77, 181.75) · (522.05, 541.56) · (422.99, 602.31) |
| Short blade | (598.69, 129.67) · (501.49, 338.08) · (551.96, 520.32) · (756.63, 95.09) |
| Lens | top-line (517.36, 531.37) → (531.76, 560.30), curved underside dipping to ~y=615, returning along top-left edge (427.89, 611.98) → (413.49, 583.05) |
| Gradient axis | vertical, y=35.81 (top) → y=684.19 (bottom) |

### 1.3 Clear space

Maintain clear space on all sides equal to the corner radius of the rounded square (108 px in canonical units, or roughly one-sixth of the mark's side length). No other graphic elements, type, or borders may enter that buffer.

### 1.4 Minimum sizes

| Use | Min size |
|---|---|
| Primary mark | 32 px square (screen) / 12 mm (print) |
| App icon | 16 px (Chrome extension minimum) |
| Favicon | 16 px |

The lens is the most fragile element at small sizes — verify it remains visible at 16 px before shipping any rasterized variant.

### 1.5 Don'ts

- Don't recolor the gradient or substitute flat purple.
- Don't fill the V in gradient and the background in white — that inverts the brand's figure-ground relationship.
- Don't apply effects (drop shadows, glows, outlines, embossing).
- Don't rotate, skew, or stretch.
- Don't separate the lens from the blades or omit it — the three-shape composition is the mark.
- Don't crop or use partial Vs as a graphic motif.
- Don't reduce the corner radius below 16% of the side length when re-rasterizing.

---

## 2. Color

### 2.1 Palette

**Primary**

| Token | Hex | Use |
|---|---|---|
| Vora Violet 400 | `#9B5DE5` | Gradient top, accents, listening state |
| Vora Violet 500 | `#7B2CBF` | Brand anchor, primary buttons |
| Vora Violet 700 | `#3C096C` | Gradient base, wordmark, body copy on light, focus rings |
| Vora Ink | `#1A0B2E` | Dark UI surfaces (not used in the logo itself) |

**Neutral**

| Token | Hex | Use |
|---|---|---|
| Paper | `#FFFFFF` | Default surface |
| Mist | `#F5F0FF` | Cool-tinted off-white for cards / panels |
| Stone 200 | `#E5E0EC` | Dividers, disabled borders |
| Stone 500 | `#6B6577` | Secondary text, captions |
| Stone 900 | `#1F1B2E` | Primary text on light surfaces |

**Status**

| State | Hex | Use |
|---|---|---|
| Listening | `#9B5DE5` | Mic active, animated pulse |
| Thinking | `#FFB347` | Awaiting Claude response |
| Executing | `#4ADE80` | Action in progress, success |
| Error | `#EF4444` | Failures, destructive confirmations |

### 2.2 Brand gradient

The primary gradient fills the rounded square background of the logo:

```css
linear-gradient(180deg, #9B5DE5 0%, #3C096C 100%)
```

Perfectly vertical. The white V cutouts let the gradient show through as the brand color. **Use this gradient only on the logo** — never on buttons, cards, or page backgrounds.

### 2.3 Contrast & accessibility

Every foreground/background pairing must meet WCAG AA (4.5:1 for body text, 3:1 for large text and UI components). Notes:

- Vora Violet 500 (`#7B2CBF`) on Paper passes AA only for large text. For body copy on white, use Violet 700 (`#3C096C`).
- White on Vora Violet 700 (`#3C096C`) passes AAA — safe for the bottom of the gradient.
- White on Vora Violet 400 (`#9B5DE5`) passes AA for large text only — the top of the gradient is the contrast-critical zone for the V cutouts. The lens shape lives in the lower (darker) half where contrast is comfortable.

**Never communicate state through color alone** — pair every status color with an icon and a text label.

---

## 3. Typography

Primary typeface: **Inter** — variable, open-source, optimized for screens, exceptional at small sizes. A natural pairing for an accessibility-first product.

Fallback stack:
```css
font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

### 3.1 Type scale (rem-based, 16 px root)

| Style | Size | Weight | Line height | Use |
|---|---|---|---|---|
| Display | 2.25 rem (36 px) | 700 | 1.1 | Landing page hero only |
| H1 | 1.75 rem (28 px) | 600 | 1.2 | Side panel title |
| H2 | 1.375 rem (22 px) | 600 | 1.25 | Section headings |
| Body | 1.0 rem (16 px) | 400 | 1.5 | Default copy |
| Small | 0.875 rem (14 px) | 400 | 1.5 | Secondary copy, transcript text |
| Caption | 0.75 rem (12 px) | 500 | 1.4, +0.02 em tracking | Timestamps, labels |

**Hard rule:** never set body copy below 14 px. Vora's audience routinely uses browser zoom and screen magnification — small type compounds the problem.

---

## 4. Layout

### 4.1 Side panel

The Vora UI lives in Chrome's side panel (~360 px wide). Vertical rhythm matters more than horizontal — design for a tall, narrow column.

- Inner padding: 16 px (1 rem)
- Section spacing: 24 px between blocks
- Activation button (mic toggle): 64 × 64 px circle, horizontally centered, Violet 500 at rest
- Command history entries: 12 px vertical padding, Stone 200 dividers

### 4.2 On-page overlay

The status overlay anchored to the bottom-right of the viewport:

- Position: 16 px from bottom and right edges
- Shape: pill, 12 px corner radius
- Z-index: 2147483000 (just below browser-extension max)
- Never blocks page content; never traps focus
- Animates in (200 ms ease-out, opacity + 8 px translate-up) and out (160 ms ease-in)

### 4.3 Spacing scale

Use a **4 px base unit**: 4, 8, 12, 16, 24, 32, 48, 64. No arbitrary values.

---

## 5. Motion

Voice products feel slow when motion is missing — but motion must never be gratuitous. Three core animations:

- **Listening pulse** — the activation button gently breathes (scale 1.00 → 1.04, 1.6 s ease-in-out, looping). Communicates that the mic is live.
- **Thinking shimmer** — the V mark's gradient sweeps top-to-bottom over 1.2 s while waiting on Claude.
- **Acknowledgement bounce** — on a successful confirm, the button scales to 1.08 then settles (180 ms ease-out + 240 ms ease-in).

All motion must respect `prefers-reduced-motion: reduce` — swap pulses for subtle opacity changes (0.7 ↔ 1.0) and disable the shimmer entirely. **This is a hard accessibility requirement, not a polish item.**

---

## 6. Iconography

Use **Lucide** (already a project dependency) at the default 1.5 px stroke. Stay within the line set — do not mix in filled icons.

Allowed sizes: 16, 20, 24 px. Never scale icons to arbitrary sizes; pick the next size up and let surrounding spacing absorb the difference.

---

## 7. Voice & tone (verbal identity)

Vora speaks the way it should be spoken to — calmly, in short sentences, never apologizing for being an assistant. This applies to UI copy, error messages, and synthesized speech equally.

| Do | Don't |
|---|---|
| "About to send your email to Maya. Say yes to send." | "I'm so sorry, but I think I might be about to send..." |
| "I couldn't find a search box on this page." | "Search functionality is not available within the current DOM context." |
| "Try again — I missed that." | "Speech recognition error: NO_MATCH." |

Plain language. Active voice. Decisions stated, not negotiated.

---

## 8. Accessibility commitments

The visual system exists in service of the product's hard accessibility constraints. These are non-negotiable:

- **Focus rings** — 2 px solid Violet 500 outline, 2 px offset, on every focusable element. Never `outline: none` without an immediate replacement.
- **Color independence** — every state uses an icon and a text label in addition to color.
- **Tap targets** — minimum 44 × 44 px. The mic button is 64 px.
- **Reduced motion** — all motion can be disabled via `prefers-reduced-motion`.
- **Contrast** — every text/background pairing passes WCAG AA. Status colors paired with neutral text rather than colored text on colored backgrounds.
- **Zoom** — every layout works up to 200% browser zoom without horizontal scroll.

---

## 9. Asset checklist

Source files live under `/public/brand/`:

| File | viewBox | Use |
|---|---|---|
| `vora-mark.svg` | `0 0 960 720` | Primary brand mark with original padding |
| `vora-icon.svg` | `155.81 35.81 648.38 648.38` | Tight-cropped square, ready for Chrome extension icon at 16/48/128 px |
| `vora-lockup.svg` | `0 0 1850 720` | Mark + "vora" wordmark, horizontal arrangement |

**To-be-generated:**

| Asset | Format | Sizes |
|---|---|---|
| App icon raster | PNG, opaque | 16, 32, 48, 128, 512, 1024 px |
| Favicon | ICO + SVG | 16, 32 px |
| Social card | PNG | 1200 × 630 px |

---

## 10. Implementation notes

### Tailwind tokens (configured in `tailwind.config.ts`)

```
vora-400  →  #9B5DE5
vora-500  →  #7B2CBF
vora-700  →  #3C096C
vora-ink  →  #1A0B2E
mist      →  #F5F0FF
stone-200 →  #E5E0EC
stone-500 →  #6B6577
stone-900 →  #1F1B2E
```

### CSS custom properties (set in `popup.css` `:root`)

```css
--vora-400: #9B5DE5;
--vora-500: #7B2CBF;
--vora-700: #3C096C;
--vora-ink: #1A0B2E;
--paper:    #FFFFFF;
--mist:     #F5F0FF;
--stone-200: #E5E0EC;
--stone-500: #6B6577;
--stone-900: #1F1B2E;
```

### Overlay (Shadow DOM — `overlay.ts`)

The in-page overlay uses raw CSS variables since Tailwind is not available in content scripts. Match the palette tokens above exactly. The pill uses the brand gradient border approach — `background: #7B2CBF` base with state-specific overrides from `OVERLAY_COLORS` in `constants.ts`.

### Animation classes

| Class | Behavior |
|---|---|
| `.vora-mic-pulse` | Listening pulse, auto-swaps to opacity-only under `prefers-reduced-motion` |
| `.vora-confirm-bounce` | One-shot bounce on activation, 420 ms |
