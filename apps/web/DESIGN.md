# Randi web: design in one page

The full system is [docs/Frontend.md §2](../../docs/Frontend.md); the canvas is the visual reference.
Tokens live in `app/globals.css` (`:root`).

- **Colours:** ink `#0E0B10`, protea `#D0216A` (actions), sun `#FFD13B` (Testnet, highlights),
  sand `#F4F2EF`, page `#F6F5F3`. **Green `#12A150` means Paid** and nothing else.
- **Type:** Archivo (display 900, uppercase, −0.055em; UI 500–800), JetBrains Mono for amounts in
  lists, references, addresses and hashes.
- **Logo:** `components/Logo.tsx`: the R whose bowl is a coin; the wordmark's i carries the coin.
- **Dashboard shell:** dark 248 px sidebar on desktop; under 820 px a bottom tab bar (Home,
  Requests, centre +, Payments, More). White cards, 1 px `#ECE8EE` border, radius 20–24.
- **Payment page:** mobile first (360 px), card up to 480 px, own CSS module, imports no dashboard code.
- **Money:** amounts stay decimal strings; `lib/format.ts` never uses floats.
- **Status:** always an icon plus a word (`components/StatusPill.tsx`).
- **Motion:** ease-out `cubic-bezier(.22,1,.36,1)`; everything has a reduced-motion path.
