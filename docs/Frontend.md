# Randi — Frontend & Design

30 Oct 2026 · @Timmy · Read [Architecture.md](Architecture.md) first.

One Next.js app (`apps/web`) serves two audiences:

- **Merchants** (logged in): create ZAR requests, share them, watch them get paid.
- **Customers** (no account): open a shared link and pay in USDC.

The frontend **never decides** whether something is paid. It shows what the API says and updates live.

---

## 1. Tech and structure

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router), React, TypeScript strict |
| Styling | Plain CSS with design tokens (CSS variables) in one global stylesheet, plus small component classes. No UI kit |
| Data | Typed fetch client built on the shared Zod schemas (`packages/shared`); cookies sent with requests |
| Live status | Server-Sent Events, with polling every 5 s as fallback |
| Wallet | Freighter browser extension API (sign message for wallet proof; sign + submit payment on the payment page) |
| QR codes | A small QR library rendering the SEP-7 payment link |
| Tests | Component tests (Vitest + Testing Library) and end-to-end (Playwright) |

Folder plan:

```
apps/web/
  DESIGN.md                 short summary of section 2 ("Clear Rand" tokens + rules)
  app/
    page                    landing
    (auth)/                 signup, login
    (app)/                  merchant area, shares the app shell
      overview, requests, requests/new, requests/[id],
      payments, wallets, settings, get-started
    pay/[requestId]/        public customer payment page (own light layout)
  components/               Logo, Icon, TestnetBanner, MerchantHeader, AmountPair, PayButton,
                            DetailRows, CopyButton, StatusPill, OutcomeTag, PaidProof, TrustLine,
                            Segmented, StatTile, DataTable, QrCode, Dialog, Toast, AppShell,
                            EmptyState, Skeleton
  lib/                      api client, money formatting (string-only), live stream hook,
                            freighter helpers, SEP-7 builder, status labels
```

**Payment page stays lean:** `/pay/[requestId]` must not import dashboard code. It's opened on phones over mobile data.

---

## 2. Design system: "Specimen"

Chosen 30 Oct 2026, replacing the first "Clear Rand" pass. Visual reference: the **Randi design**
canvas (https://claude.ai/artifact/8PLRDWPvpX3ahEnSbpmp1P): system board, logo, motion (playable),
landing page (working hero) and the four key screens. Words: [Copy.md](Copy.md).

### 2.1 The concept

A Randi request is designed like an engraved banknote: guilloché line-work, a denomination in rand,
and a reference printed like a serial number. While Randi runs on Testnet, every request carries the
**SPECIMEN** overprint and a **security thread** that reads *STELLAR TESTNET · SPECIMEN · NO REAL
VALUE*. Banks print SPECIMEN on notes with no value; that is exactly what Testnet money is, so the
network warning is part of the object instead of a banner bolted on.

Structural, not skeuomorphic: line-work, overprints, serials, perforations and double rules. Never
paper textures, fake holograms, gradients or copies of real rand notes (no portraits, animals or
Reserve Bank marks).

### 2.2 Rules that are not style

1. **Green means USDC arrived.** Paid, overpaid and received totals. Never a button, icon, badge or tick.
2. **ZAR is asked, USDC is sent.** Rand is the denomination (Bodoni, corner); USDC is the instruction (Plex Mono, the largest figure on the payer's page) and the only amount checked. Never show one without the other.
3. **Testnet wears the overprint.** Thread and SPECIMEN on every surface that shows a request; the merchant app bar carries a TESTNET · SPECIMEN tag. Removed only on mainnet.
4. **Amounts and references are mono.** IBM Plex Mono, tabular figures, decimals quieter, never rounded for display, never parsed to a float. References display grouped (`RD 7K2M 9QXA`) and copy ungrouped (`RD7K2M9QXA`).
5. **No state the backend lacks.** Pending, Part-paid, Paid, Overpaid, Expired, Cancelled, Failed. "Sent, waiting for Stellar…" is the page's own state and never says Paid.

### 2.3 Colour

Palette shape: stock 66 · intaglio 22 · protea 7 · specimen 3 · paid 2. Deliberately uneven.

| Token | Hex | Use |
| --- | --- | --- |
| `--stock` | `#EEF0F3` | Page, like security paper |
| `--note` | `#FBFBFC` | Cards, fields, the note |
| `--engrave` | `#C9CCD8` | Line-work, hairlines (`#E1E3EA` between rows, `#DADDE8` for guilloché) |
| `--border` | `#7E8299` | Inputs, secondary buttons (3.4:1) |
| `--intaglio` | `#171A33` | Text, the customer's pay button, headers, the note's outer rule |
| `--intaglio-2` | `#464A63` | Secondary text |
| `--intaglio-3` | `#646880` | Labels (lightest text allowed, 4.6:1 on stock) |
| `--protea` | `#A1205A` (hover `#861A4B`, tint `#F7E6EE`) | The merchant's one action per view, links, focus, the reference |
| `--specimen` | `#9A4D00` (overprint at 10–13% alpha) | Thread, overprint, TESTNET tag |
| `--paid` | `#0D7A4F` (text `#0A6440`, tint `#E2F2EA`) | USDC arrived. Nothing else |
| `--void` | `#B42318` (text `#9A1E14`, tint `#FCE9E7`) | Rejected, failed, errors |
| `--usdc` | `#2775CA` (chip `#E6EFFA`, text `#1D5FA8`) | The asset chip only |
| pending | fill `#FFF4E5`, text `#7A3D00`, line `#EBC48F` | Pending, part-paid, needs attention |

The customer's pay button is intaglio, not green: it moves money but isn't money yet.

### 2.4 Type

| Role | Face | Where |
| --- | --- | --- |
| Display + denominations | **Bodoni Moda** (600–800, italic for headlines) | Headlines, the wordmark, rand amounts (`R` raised at half size) |
| Interface | **Hanken Grotesk** (400–700) | Everything else |
| Figures | **IBM Plex Mono** (400–600) | Every USDC amount, reference, address, hash, label caps |

Never Inter, Roboto or system-ui as the rendered face. Labels: Plex Mono 11–12 px, caps, +0.14em,
`--intaglio-3`. Amounts: integer at full weight, decimals at 0.72em in `--intaglio-2`.

### 2.5 Components

| Component | What it is |
| --- | --- |
| `Thread` | 22 px specimen band of repeated microprint, top of every customer page and the landing page |
| `Note` | Double-ruled card (1 px intaglio outer, 1 px engrave inner, 8–10 px gap) with guilloché, denomination, instruction, serial reference, SPECIMEN overprint |
| `Denomination` | Bodoni rand amount, `R` raised; label "Requested" |
| `Instruction` | "Send exactly" + Plex Mono USDC + USDC chip + rate line |
| `GuardButton` | The pay button never shows a bare disabled state: it renders the first blocker as its label ("Switch Freighter to Testnet to pay"), dashed specimen border |
| `ReferenceRow` | Protea-tinted row, serial-grouped reference, "put this in the memo", Copy copies the exact string |
| `Perforation` | Paid as a 19×7 dot matrix punched in `--paid`; with the tx hash under it |
| `Receipt` | Hairline rows, double `--paid` rule above "Received" |
| `StatusTag` | Mono caps, 3 px radius, dot + word, coloured border |
| `StatGrid` | Ruled cells; rand in Bodoni, USDC in Plex; "Needs attention" cell in pending fill |
| `MerchantHeader` | Intaglio band with wave line-work, initials disc in stock, name, "Verified wallet"; the note overlaps it |

### 2.6 Logo

A guilloché rosette (one continuous hypotrochoid line, nine lobes, one per province) engraved around
a Bodoni **R** on a stock disc, beside the lowercase Bodoni wordmark **randi** (600, −3.5%). Sizes:
full rosette ≥ 96 px, single line at 48, ring at 32, bare R at 16 (favicon). Intaglio and stock only:
never green, never gradient, never on a photo without its disc.

### 2.7 Motion

Five moments move; everything else is a 120 ms ease-out on hover. Transform and opacity only, no
loops, no bounce, no parallax. Ease-out `cubic-bezier(.2,.8,.2,1)`.

| Moment | What | Timing | Reduced motion |
| --- | --- | --- | --- |
| The engrave | Page load: the note's rosette draws itself, then the denomination rises | 1100 ms draw, 260 ms rise | Shown at once |
| The till counter (signature) | As rand is typed, each USDC digit rolls like a till counter | 420 ms per digit, 35 ms apart from the right | Instant swap |
| The send | After Freighter submits: a hairline fills once over one ledger (6 s) and holds | 6000 ms linear | Static "Sent" |
| The punch | Paid perforates column by column, then the proof line rises | 160 ms per hole, 14 ms per column, 220 ms rise | Shown at once |
| Money arriving | Dashboard total counts up; the paid row slides in with a mint wash | 600 ms count, 240 ms slide, 1.4 s wash | New values appear |

### 2.8 Imagery

Real South African places, openly licensed, always credited in a caption, never implying a
pictured business uses Randi. Used on the landing page only; product screens stay photo-free.

| Photo | Credit |
| --- | --- |
| Bo-Kaap street under Devil's Peak (hero band) | Anil Baki Durmus / Unsplash |
| Rosebank Sunday Market stall, Johannesburg | Vije Vijendranath / Unsplash |
| Crossing a Bo-Kaap street | Jean van Wyk / Unsplash |
| Blue sedan at the Bo-Kaap Museum (Testnet section) | Arno Smit / Unsplash |

No stock "happy merchant" photos, illustrated people, 3D coins or crypto imagery.

### 2.9 Voice

See [Copy.md](Copy.md): plain, exact, a little dry; South African English; real amounts always.

## 3. Route map

| Route | Who | Purpose |
| --- | --- | --- |
| `/` | Anyone | Landing: what Randi does, the flow, Testnet notice, sign-up |
| `/signup`, `/login` | Anyone | Email + password |
| `/get-started` | Merchant | Onboarding checklist |
| `/overview` | Merchant | Numbers and recent activity |
| `/requests` | Merchant | All requests with filters |
| `/requests/new` | Merchant | Create a ZAR request |
| `/requests/[id]` | Merchant | Request detail, share panel, timeline |
| `/payments` | Merchant | Every detected payment; Unmatched tab |
| `/wallets` | Merchant | Receiving wallets: add, verify, check |
| `/settings` | Merchant | Business, pricing (fixed rate), defaults, password |
| `/pay/[requestId]` | **Public** | Customer payment page |

The merchant area uses an **app shell**: left nav on desktop (Overview, Requests, Payments, Wallets, Settings), bottom tab bar on phones, Testnet banner on top, a "New request" button always visible.

---

## 4. Landing page (`/`)

Copy in [Copy.md](Copy.md). Order: thread → header (logo, How it works, What's checked, Testnet, Sign
in, Create a test account) → **hero**: headline left, a working specimen note right (type rand and a
rate; USDC rolls on the till counter; rounded up in integer maths, the same rule as the API) → Bo-Kaap
photo band → 01 How a request travels (six ruled steps) → photo pair → 02 Two amounts (worked
division with a double rule) → 03 When a payment isn't quite right (what they did / what Randi does)
→ 04 Testnet, plainly (intaglio band, SPECIMEN, photo) → closing CTA → footer. No stats, logos or
testimonials until they are real.

## 5. Merchant screens

### 5.1 Sign-up and onboarding

- **Sign up:** business name, email, password. Then straight into `/get-started`.
- **Get started checklist** (each step shows done / to do):
  1. **Add your receiving wallet**: paste a `G…` address. Live hint if it looks like an `S…` secret: *"That's a secret key. Never share it. Paste the address that starts with G."* (The API refuses it too.)
  2. **Prove it's yours**: "Verify with Freighter" opens Freighter to sign a message. No funds move.
  3. **Make sure it can receive USDC**: shows account and trustline checks with a fix-it hint ("Add a USDC trustline in your wallet") and a "Check again" button.
  4. **Choose how you price** (optional): manual, or set a fixed rate.
  5. **Create your first request.**

### 5.2 Overview (`/overview`)

- Cards: **Requested (ZAR)** this month · **Collected (USDC)** this month · **Open requests** · **Needs attention** (links to filtered list).
- Recent requests (5) with status pills.
- Recent payments (5) with outcome pills.
- Empty state for new merchants points to "Create your first request".

### 5.3 Requests list (`/requests`)

- **Filters** (segmented control): All · Pending · Paid · Expired · Failed · **Needs attention**. Plus search (reference, request ID, order number) and date range.
- **Columns** (desktop): Created · Description / order # · **ZAR** · **USDC** · Reference · Status · Expires / Paid at · Tx hash (for paid).
- Below 640 px, rows become stacked cards: description, both amounts, status pill, reference, and the tx hash under it. **The tx hash is never hidden on mobile for paid requests.**
- Updates live (merchant stream): a row flips to Paid without reload, announced in one polite live region ("Order #1042 is paid").
- "Needs attention" means: open but wallet can't receive, rejected/unapplied payments on it, or a refund is owed. Each shows a one-line reason.

### 5.4 New request (`/requests/new`)

```
┌──────────────────────────────────────────────────────────┐
│ New payment request                                      │
│                                                          │
│ Amount in rand                                           │
│ ┌──────────────────────────────┐                         │
│ │ R  500.00                    │                         │
│ └──────────────────────────────┘                         │
│                                                          │
│ How is the USDC amount set?                              │
│ ( ) I'll enter it     (•) Use my fixed rate R18.50/USDC  │
│                                                          │
│ ┌─ Customer will pay ─────────────────────────────────┐  │
│ │ 27.03 USDC                                          │  │
│ │ Rate set by you: R18.50 = 1 USDC · rounded up 0.01  │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                          │
│ Description         [ Birthday cake               ]      │
│ Order number        [ #1042                        ]      │
│ Receiving wallet    [ Main · GABC…XYZ1 ✓ verified ▾]      │
│ Expires in          [ 30 minutes ▾ ]                      │
│                                                          │
│ [        Create request        ]                         │
└──────────────────────────────────────────────────────────┘
```

Behaviour:

- **Manual mode:** a second input "Amount in USDC" appears; the preview shows the implied rate (*"That's R18.52 per USDC"*) as information only.
- **Fixed-rate mode:** USDC is calculated by the API's quote endpoint as the merchant types (debounced ~300 ms). The preview shows exactly what will be saved. If no rate is set, the option is disabled with a link: *"Set a fixed rate in Settings"*.
- Wallet dropdown shows only verified wallets; one that can't receive USDC is disabled with its reason.
- Expiry presets: 15 min, 30 min, 1 h, 24 h, 7 days, custom (5 min – 30 days).
- The form sends an `Idempotency-Key`, so double-clicking can't create two requests. The button shows a spinner while working.
- On success → the request detail page with the **share panel** open.

### 5.5 Request detail (`/requests/[id]`)

Top to bottom:

1. **Header:** description + order #, status pill, request ID, created time.
2. **Amount pair** (merchant layout): R500.00 requested · 27.03 USDC to pay · rate line · received / remaining when part-paid.
3. **Share panel** (open by default while Pending):
   - Payment link with **Copy**
   - **Share on WhatsApp** (prefilled: *"{Business} has sent you a payment request for R500.00 (27.03 USDC on Stellar Testnet): {link}"*), **Email**, and the phone's native share sheet where available
   - QR code of the **page link** (for showing on a counter screen)
   - "Open payment page" (new tab)
4. **Payment details:** wallet address, asset (USDC + issuer), network, reference, expiry, with copy buttons.
5. **Proof** (when paid): *"Paid at 14:32 · Verified on Stellar Testnet"*, the full tx hash with copy and explorer link.
6. **Timeline:** created → each payment seen (with outcome pill, amount, sender, hash) → status changes → expiry/cancel.
7. **Actions:** Cancel (only while Pending, with confirm dialog). Mark refunded (when a refund is owed; optional tx hash).

### 5.6 Payments (`/payments`)

- Tabs: **All** · **Unmatched** · **Rejected** · **Refund owed**.
- Columns: time · amount + asset · from · reference (as sent) · outcome · request (link) · tx hash.
- **Unmatched → Link to request:** dialog lists open requests on the same wallet, best match first (same amount). Explains: *"Only payments that reached this wallet in USDC can be linked. Randi still checks the time and amount."*

### 5.7 Wallets (`/wallets`)

- List: label, address, verified badge, account / trustline checks, "can receive USDC" yes/no with reason, "Check again".
- Add wallet dialog (with secret-key guard), Verify with Freighter, Remove (explains that open requests keep working).

### 5.8 Settings (`/settings`)

- **Business:** name, support contact (shown on the payment page).
- **Pricing:**
  - Default mode: *I'll enter the USDC amount* / *Use my fixed rate*
  - Fixed rate input: "R [18.50] = 1 USDC", with last-changed time
  - Note: *"This is your own rate. Randi doesn't fetch exchange rates. Changing it only affects new requests."*
- **Defaults:** receiving wallet, expiry.
- **Security:** change password, sign out.

---

## 6. Customer payment page (`/pay/[requestId]`)

The most important screen. It's opened from WhatsApp on a phone, by someone who may never have used Stellar. **Mobile first** (designed at 360 px, centred card max 480 px on desktop). No login.

### 6.1 Layout (waiting for payment)

```
┌────────────────────────────────────────┐
│ ⚠ Stellar Testnet · test money only,   │
│   no real value                        │
├────────────────────────────────────────┤
│ Payment request from                   │
│ Thandi's Bakery   ✓ verified wallet    │
│ Birthday cake · Order #1042            │
│                                        │
│ Requested               R500.00        │
│ ────────────────────────────────────   │
│ Send exactly                           │
│ 27.03 USDC                             │
│ Rate set by Thandi's Bakery:           │
│ R18.50 = 1 USDC · not a live rate      │
│                                        │
│ ◷ Waiting for payment   Expires 24:51  │
│                                        │
│ [        Pay with Freighter        ]   │
│                                        │
│ Or pay from any Stellar wallet  ▾      │
│  Network    Stellar Testnet            │
│  Asset      USDC                       │
│             issuer GBBD…LFA5   [copy]  │
│  Send to    GABC…XYZ1          [copy]  │
│  Reference  RD7K2M9QXA         [copy]  │
│  (wallets call this the memo)          │
│  Amount     27.03              [copy]  │
│  [ QR code ]                           │
│                                        │
│ Request ID aZ81kQp0LmX3                │
│ Need help? Contact Thandi's Bakery     │
└────────────────────────────────────────┘
```

Every item David listed is on this screen: ZAR amount, USDC amount, network and asset, recipient address, payment reference, instructions, status, and (when paid) the verified tx hash.

### 6.2 Instructions ("Or pay from any Stellar wallet")

Numbered, plain steps:

1. Make sure your wallet is on **Stellar Testnet** (test money only).
2. Your wallet needs **Testnet USDC**. *How do I get some?* (expands: get test XLM from Friendbot, add a USDC trustline, get test USDC from Circle's faucet).
3. Send **exactly 27.03 USDC** to the address above.
4. Put **RD7K2M9QXA** in the **memo** field. Without it we can't match your payment automatically.
5. Keep this page open. It updates by itself when Stellar confirms the payment, usually within 10 seconds.

The QR code holds a **SEP-7** payment link (destination, amount, USDC asset, memo, Testnet passphrase), so SEP-7 wallets fill everything in. Below the QR: *"Wallet can't add a memo? Use these instead"*, showing the numeric memo ID or the muxed `M…` address.

### 6.3 Pay with Freighter

1. Check Freighter is installed; if not, show a link and the manual steps.
2. Check Freighter is on **Testnet**; if not: *"Switch Freighter to Testnet, then try again."*
3. Check the customer's account has a USDC trustline and enough balance; show what's missing before asking them to sign.
4. Build the payment (USDC, exact amount, memo = reference) and ask Freighter to sign.
5. Submit. Show **"Sent — waiting for Stellar to confirm…"**. This is a *page* state only; the request is still Pending until the worker verifies it.
6. If submission times out, look up the transaction by hash. **Never resubmit automatically.**
7. If the transaction **fails**, show the reason in plain words (e.g. "Not enough USDC") with "Try again". Nothing was paid.

### 6.4 Page states

| State | What the customer sees |
| --- | --- |
| Loading | Skeleton of the card |
| Pending | Layout 6.1 |
| Sent (local) | "Sent — waiting for Stellar to confirm…" with spinner; hash shown once known |
| Part-paid | "**8.00 USDC still due** (19.03 of 27.03 received)." Instructions now show the remaining amount; same reference |
| **Paid** | Big green check: **"Paid"** · *R500.00 · 27.03 USDC received* · "Verified on Stellar Testnet" · tx hash with copy + explorer link · paid time. Instructions hidden |
| Paid · overpaid | As Paid, plus: *"You sent 2.00 USDC more than asked. Thandi's Bakery can send the extra back."* |
| Expired | "This request expired at 14:30. Don't send a payment. Ask Thandi's Bakery for a new link." Any amount already received is shown, with a note the merchant can refund it |
| Cancelled | "Thandi's Bakery cancelled this request. Don't send a payment." |
| Failed | "This request can't be paid any more (the test network was reset). Ask for a new link." |
| Wallet can't receive | Pay button and details hidden: "Thandi's Bakery's wallet can't receive USDC right now. Please contact them." |
| Payment rejected (e.g. wrong asset) | Banner on top of the current state: "We saw a payment of 5 XLM with this reference. It wasn't applied because only USDC is accepted." |
| Not found | "We can't find this payment request. Check the link." |
| Connection lost | Quiet note "Reconnecting…"; status still correct after reconnect |

**No "I've paid" button and no hash input.** The page tells the customer it's watching Stellar. Only a verified transaction changes the status.

---

## 7. Live updates

- Merchant area: one stream (`/v1/stream`) shared by all pages; updates the requests list, detail, payments and overview.
- Payment page: its own public stream; first message is the current snapshot, so a reload or reconnect can't miss "Paid".
- Fallback: if the stream fails twice, poll every 5 s.
- Live changes are announced in a single polite `aria-live` region, not by toasts stacking up.

---

## 8. Accessibility and responsive rules

- Real `<button>`, `<a>`, `<label for>` everywhere; visible focus ring (green, 2 px offset).
- Dialogs trap focus, return focus on close, close on Escape.
- Every list has loading, empty and error states.
- Status never shown by colour alone (icon + word).
- Copy buttons announce "Copied".
- Works from **360 px** wide with no horizontal scroll; tables become stacked rows below 640 px.
- The Testnet banner is visible on every page at every size.
- Text can scale to 200% without losing content.

---

## 9. Frontend test cases

Named by ID like the backend ones; end-to-end tests run against a local API with a Testnet worker.

| ID | Case | Expected |
| --- | --- | --- |
| F1 | Payment page shows ZAR, USDC, network, asset, address, reference, instructions, status | All present, labelled |
| F2 | Payment page updates to Paid without reload | Status + tx hash appear via stream |
| F3 | Stream blocked | Polling fallback still reaches Paid |
| F4 | Freighter on Mainnet | Clear "switch to Testnet" message; nothing signed |
| F5 | Customer has no USDC trustline | Explained before signing |
| F6 | Submit timeout | Looks up by hash; no second submit |
| F7 | Expired / cancelled / failed page | Payment details hidden; "don't send" message |
| F8 | New request in fixed-rate mode | Preview equals saved amount |
| F9 | Secret key pasted as wallet | Warning shown; API refuses |
| F10 | Request list at 360 px | Stacked rows; tx hash visible for paid |
| F11 | Testnet banner | Present on every route |
| F12 | Merchant B opens Merchant A's request URL | Not found |
| F13 | Payment page is opened by someone not logged in | Works fully; no merchant data beyond the allowed fields |
