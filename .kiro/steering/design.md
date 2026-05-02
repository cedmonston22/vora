---
inclusion: always
---

# Vora — Visual Identity & Design System

**Vora — Voice-Operated Responsive Assistant.**
A Chrome extension that gives people who cannot use a mouse or keyboard full control of any website through natural-language voice commands.

The visual identity should feel confident, calm, accessible, and modern — not childish, not aggressive, not "AI-techy" in the chrome-and-neon sense. Purple sits intentionally between the trustworthy blue of accessibility tools and the energetic warmth of voice-driven products.

## Kiro Agent Rule

**Any time you modify or create UI files in `src/popup/` or `src/content/overlay.ts`, you must follow this design system exactly.** Do not introduce colors, fonts, spacing, or motion patterns that are not defined here. When in doubt, reference the token tables below before writing a single className.

---

## 1. Color Tokens

These are the only colors permitted in the UI. Use the Tailwind class names or CSS variables — never hardcode arbitrary hex values.

**Primary**

| Token | Hex | Tailwind class | Use |
|---|---|---|---|
| Vora Violet 400 | `#9B5DE5` | `bg-[#9B5DE5]` / `text-[#9B5DE5]` | Accents, listening state, gradient top |
| Vora Violet 500 | `#7B2CBF` | `bg-[#7B2CBF]` / `text-[#7B2CBF]` | Primary buttons, active mic, focus rings |
| Vora Violet 700 | `#3C096C` | `bg-[#3C096C]` / `text-[#3C096C]` | Gradient base, wordmark, body copy on light |
| Vora Ink | `#1A0B2E` | `bg-[#1A0B2E]` / `text-[#1A0B2E]` | Dark surfaces, idle mic button |

**Neutral**

| Token | Hex | Tailwind class | Use |
|---|---|---|---|
| Paper | `#FFFFFF` | `bg-white` | Default surface |
| Mist | `#F5F0FF` | `bg-[#F5F0FF]` | Cards, panels, history entries |
| Stone 200 | `#E5E0EC` | `border-[#E5E0EC]` | Dividers, disabled borders |
| Stone 500 | `#6B6577` | `text-[#6B6577]` | Secondary text, captions |
| Stone 900 | `#1F1B2E` | `text-[#1F1B2E]` | Primary text on light surfaces |

**Status — always pair with a text label, never color alone**

| State | Hex | Use |
|---|---|---|
| Listening | `#9B5DE5` | Mic active, animated pulse |
| Thinking | `#FFB347` | Awaiting Claude response |
| Executing | `#4ADE80` | Action in progress, success |
| Error | `#EF4444` | Failures, destructive confirmations |
| Confirming | `#7B2CBF` | Destructive action pending voice confirm |

**Brand gradient — logo only, never on buttons or backgrounds:**
```css
linear-gradient(180deg, #9B5DE5 0%, #3C096C 100%)
```

---

## 2. Typography

Primary typeface: **Inter** (loaded via Google Fonts in `index.html`).

```css
font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

| Style | Size | Weight | Use |
|---|---|---|---|
| H1 | 1.75 rem (28 px) | 600 | Side panel title |
| H2 | 1.375 rem (22 px) | 600 | Section headings |
| Body | 1.0 rem (16 px) | 400 | Default copy |
| Small | 0.875 rem (14 px) | 400 | Secondary copy, transcript text |
| Caption | 0.75 rem (12 px) | 500 | Timestamps, labels — +0.02 em tracking |

**Hard rule: never set body copy below 14 px.** Vora's users rely on screen magnification.

---

## 3. Layout

- Side panel width: ~360 px (Chrome side panel default)
- Inner padding: 16 px
- Section spacing: 24 px between blocks
- Spacing scale — 4 px base unit: 4, 8, 12, 16, 24, 32, 48, 64. No arbitrary values.
- Mic button: 64 × 64 px circle, horizontally centered
- Minimum tap target: 44 × 44 px on all interactive elements

---

## 4. Components

### Activation button (mic toggle)
- Size: 64 × 64 px circle (`h-16 w-16 rounded-full`)
- Idle: `bg-[#1A0B2E]`, hover lifts to `bg-[#3C096C]` with subtle violet glow ring
- Active: `bg-[#7B2CBF]` + listening pulse animation + violet glow ring `shadow-[0_0_0_8px_rgba(155,93,229,0.22)]`
- Focus ring: `outline-2 outline-offset-2 outline-[#7B2CBF]`
- Ping ring on active: `bg-[#9B5DE5] opacity-20 animate-ping` (hidden under `prefers-reduced-motion`)

### Status indicator
- Pill shape: `rounded-pill px-3 py-1`
- Background uses the Mist or state-tinted surface (never the raw status hex as background)
- Always shows: colored dot + text label — never color alone
- `role="status" aria-live="polite" aria-atomic="true"`

### Command history entries
- Background: Mist `#F5F0FF`, border: Stone 200 `#E5E0EC`
- Rounded: `rounded-lg`
- Padding: `px-3 py-2`
- Success indicator: emerald-600 ✓ / red-500 × with `aria-label`

### Settings panel
- Collapsed: plain text link trigger
- Expanded: white card with Stone 200 border, 12 px padding, 16 px section gaps
- All inputs: Stone 300 border, 2 px focus ring in Violet 500
- Save button: Vora Ink `#1A0B2E` background, white text

---

## 5. Motion

Three permitted animations — all defined in `popup.css`:

| Animation | Class | Behavior |
|---|---|---|
| Listening pulse | `.vora-mic-pulse` | scale 1.00 → 1.04, 1.6 s ease-in-out, looping |
| Confirm bounce | `.vora-confirm-bounce` | scale 1.00 → 1.08 → 1.00, 420 ms one-shot |
| Overlay pill in/out | CSS keyframes in `overlay.ts` | 200 ms ease-out in, 160 ms ease-in out |

**`prefers-reduced-motion: reduce` is mandatory:**
- Pulse swaps to opacity 1.0 ↔ 0.7 (no scale)
- Shimmer disabled entirely
- Use `motion-safe:` Tailwind prefix or the `.vora-mic-pulse` class which handles this via `@media` in `popup.css`

---

## 6. Iconography

- Library: **Lucide React** (already installed)
- Stroke: default 1.5 px — never use filled variants
- Sizes: 16, 20, or 24 px only — never arbitrary sizes
- Always `aria-hidden` on decorative icons; provide `aria-label` on the parent button

---

## 7. Overlay (Shadow DOM — `overlay.ts`)

Tailwind is not available in content scripts. Use inline CSS with the exact hex values from the token table above. The overlay must:

- Use Shadow DOM (`attachShadow({ mode: 'closed' })`) — never leak styles into the host page
- Position: `fixed`, `bottom: 24px`, `right: 24px`
- Z-index: `2147483647`
- Pill shape: `border-radius: 999px`
- Animate in: `opacity 0→1 + translateY(8px→0)` over 200 ms ease-out
- Never block page content or trap focus (`pointer-events: none` on host)

---

## 8. Accessibility (non-negotiable)

- **Focus rings**: 2 px solid `#7B2CBF`, 2 px offset, on every focusable element. Never `outline: none` without replacement.
- **Color independence**: every state uses icon + text label in addition to color.
- **Tap targets**: minimum 44 × 44 px.
- **Reduced motion**: all animations respect `prefers-reduced-motion`.
- **Contrast**: every text/background pair passes WCAG AA (4.5:1 body, 3:1 large/UI).
- **Zoom**: layout works at 200% browser zoom without horizontal scroll.

---

## 9. Voice & tone

| Do | Don't |
|---|---|
| "About to send your email. Say yes to send." | "I'm so sorry, but I think I might be about to send..." |
| "I couldn't find a search box on this page." | "Search functionality is not available within the current DOM context." |
| "Try again — I missed that." | "Speech recognition error: NO_MATCH." |

Plain language. Active voice. Under 20 words per TTS message. Decisions stated, not negotiated.

---

## 10. What Kiro must never do

- Never introduce a color not in the token tables above
- Never set font size below 14 px
- Never use `outline: none` without an immediate focus ring replacement
- Never communicate state through color alone — always add a label
- Never add motion without a `prefers-reduced-motion` fallback
- Never use filled Lucide icons or mix icon libraries
- Never apply the brand gradient to anything other than the logo mark
- Never use arbitrary spacing values — only the 4 px scale
