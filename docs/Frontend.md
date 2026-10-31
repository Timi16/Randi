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
| Wallet | Each wallet's own library, loaded only when used: `@stellar/freighter-api`, `@creit.tech/xbull-wallet-connect`, `@albedo-link/intent` (the same ones Stellar Wallets Kit wraps; the kit itself pulled in Ledger, Trezor, WalletConnect and their advisories for wallets Randi doesn't offer). Wallet proof is a SEP-53 signed message, so only Freighter and xBull can prove a wallet (Albedo can't sign messages); all three can pay on the payment page |
| QR codes | A small QR library rendering the SEP-7 payment link |
| Tests | Unit tests of `lib/` (Vitest) and an end-to-end walkthrough on Testnet (`e2e/walkthrough.mjs`, Playwright) |

Folder plan:

```
apps/web/
  DESIGN.md                 short summary of section 2 (v3 tokens + rules)
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

## 2. Design system (v3)

Chosen 30 Oct 2026 after the "Specimen" pass was rejected. Pattern and motion follow the
reference site the client chose (stitch.me): giant black uppercase headlines that move, editorial
photography of real people in bold colour, very round surfaces, pill buttons, a 3D card carousel, a
marquee, expanding cards, and a page that lifts off a dark footer. The brand, colours, type, copy
and photos are Randi's own; nothing is copied from the reference.

That pattern is for the **landing page**. The merchant area is a plain **fintech dashboard** (§2.8):
same colours and type, but a dark sidebar, white cards and smaller text, because merchants use it
every day.

Visual reference: the **Randi design** canvas (https://claude.ai/artifact/8PLRDWPvpX3ahEnSbpmp1P):
landing page, system, logo, motion, every dashboard page on desktop, the dashboard on mobile, sign
up / sign in with setup, and the customer pay and connect-wallet flow. Boards marked Play are
clickable.

### 2.1 Rules that are not style

1. **Green means USDC arrived.** `--paid` only on Paid, Overpaid and received totals.
2. **ZAR is asked, USDC is sent.** Both always shown; on the payer's page USDC is the giant figure.
3. **Testnet is always on screen.** Sun-yellow "Stellar Testnet" badge in every header and a yellow strip on every payment page, plus "test money, no real value" near the pay button.
4. **No state the backend lacks.** Pending, Part-paid, Paid, Overpaid, Expired, Cancelled, Failed. "Paid." only after the worker verifies.
5. **People photos carry no labels or credits on the site** (the client's choice; the Unsplash License doesn't require credit). Unsplash photos come without model releases, so copy never claims a pictured person uses Randi.

### 2.2 Colour

| Token | Hex | Use |
| --- | --- | --- |
| `--ink` | `#0E0B10` | Text, dark sections, footer, secondary buttons |
| `--protea` | `#D0216A` (hover `#B11A59`) | The main action, accents, the rotating headline word |
| `--sun` | `#FFD13B` | Badges, highlights, Testnet, the "+" chip on dark buttons |
| `--sand` | `#F4F2EF` | Cards, fields, soft sections |
| `--paper` | `#FFFFFF` | Page |
| `--muted` | `#6B6470` / body `#3B3640` / on dark `#CFC9D3` | Secondary text |
| `--line` | `#E7E3E9` (inputs `#CFC9D3`) | Dividers, field borders |
| `--paid` | `#12A150` (text `#0E8A44`) | USDC arrived. Nothing else |
| `--usdc` | `#2775CA` | The USDC chip |

### 2.3 Type

**Archivo** for everything (Google Fonts, variable width and weight). Display: weight 900,
`font-stretch: 108%`, uppercase, letter-spacing −0.055em, line-height 0.84, 44–152 px. Body: 400–500
at 15–19 px, sentence case. **JetBrains Mono** for references, addresses and hashes.

### 2.4 Shape

Radius 12 (inputs) · 16–24 (cards, rows) · 28–40 (sections, photos, phone) · pill (buttons, tags,
switches). Buttons are pills with a round "+" or arrow chip at the right that turns 90° on hover.
Sections are rounded panels inset 12–24 px from the page edge; the main page has 48 px bottom
corners and lifts off the ink footer.

### 2.5 Motion

| Moment | Spec |
| --- | --- |
| Headline word swap | "Get paid in USDC. / in seconds. / with proof." every 2.2 s, 900 ms, `cubic-bezier(1,.02,0,.85)` |
| Hero entrance | Headline rises 900 ms; request card floats in at 500 ms; Paid pill pops at 1.2 s; both then float ±14 px, 5–6 s, alternate |
| Marquee | Business types ("Salons ✦ Spaza shops ✦ Bakeries…"), 38 s linear loop |
| 3D card carousel | Example requests on photo cards; every 3.2 s, 1500 ms `cubic-bezier(.87,.12,.11,.88)`, perspective 1800 px, ±16° turn |
| Pill switch | Pricing mode, sign up / sign in; 620 ms `cubic-bezier(.73,.49,0,.89)` (500 ms in the dashboard) |
| Expanding cards | How it works; the open card grows to 3.2× in 700 ms ease-out, body rises in |
| Till counter | USDC digits roll 520 ms each, 40 ms apart, as rand is typed |
| Paid. | Word slams in 700 ms (from +40 px, 115% scale); green check pops at 450 ms |
| Everything else | `cubic-bezier(.22,1,.36,1)`, 120–450 ms; photos zoom 6% on hover |

`prefers-reduced-motion`: loops stop, swaps are instant, entrances show the end state.

### 2.6 Logo

**Mark:** a geometric **R** drawn on a 120-unit grid: a 20-unit stem, a coin for the bowl (radius 19,
the USDC that lands) and a 20-unit leg. A 6-unit cut in the background colour separates the coin
from the stem and leg (8 units under 32 px). The R is the rand; the coin is the USDC. App icon: ink
rounded square (radius 30/120), white R, sun coin. Ship it as one SVG; never set the R in a font.

**Wordmark:** lowercase **randi** in Archivo 900, width 105%, tracked −3.5%, with the dot of the i
replaced by the same coin. Coin colour: sun on dark, protea on light; never green, because green means
Paid. Lockup gap is half the mark's width. Full sheet on the Logo board of the design canvas.

### 2.7 Photography

Editorial portraits of real people against bold colour, plus South African street life. All from
Unsplash under the Unsplash License, which doesn't require credit; the site shows none, so the photographers are recorded here: Ahmed Nasiru (hero and phone
section), Prince Akachi, Shedrack Salami, Steward Masweneng, Mpumelelo Macu, Karabo Mdluli, Dion
Martins, abolova. Before launch, replace people shown next to example amounts with commissioned
photography and model releases.

### 2.8 Dashboard shell

- **Desktop (over 820 px):** dark ink sidebar, 248 px: logo, nav (Overview, Requests, Payments,
  Wallets, Settings) with line icons, active row `#221D26` with a sun-yellow icon; a protea
  "New request" button; a Testnet card; the business name and sign-out at the bottom.
- **Top bar:** white, 68 px: page title and kicker, search, Testnet pill, avatar.
- **Page:** background `#F6F5F3`; cards `#FFFFFF`, 1 px `#ECE8EE` border, radius 20–24, no heavy
  shadows. Body text 13–15 px; headline figures in Archivo 800–900, not the giant landing display.
- **Mobile (820 px and under):** the sidebar goes; a white bottom tab bar takes over: Home,
  Requests, a raised protea **+** in the centre (New request), Payments, More (Wallets, Settings,
  sign out). Tables become stacked rows; dialogs become bottom sheets.

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

The merchant area uses the **dashboard shell** in §2.8: sidebar on desktop, bottom tab bar with a centre "+" on phones, Testnet always visible, "New request" always one tap away. Every "Open app" button on the landing page goes to `/overview` (or `/login` when signed out).

---

## 4. Landing page (`/`)

Order: header (logo, How it works, What's checked, FAQs, Testnet badge, Sign in, "Open app +") →
hero: one ink panel, split in two. Left: "New" tag line, four-line
display headline ("Charge / in rand. / Get paid / *in USDC.*", last line rotates in sun), sub, "Open
app +" and "See a payment page", and three facts (~10 s to Paid · your rate · your wallet). Right:
the photo with a live payment card on top that loops waiting → payment seen → Paid · verified on
Stellar, and a "+27.03 USDC received" note that drops in on Paid. On phones the photo stacks under
the text → marquee of business types → "Any price. Any hustle." 3D carousel of example
requests → "No app. No account. Just pay." dark panel with a phone showing the payment page and a
photo → "Four steps. Zero sums." expanding cards → "Two amounts. One gets checked." with the till
counter → "Paid means paid." protea panel listing what gets checked → "Mzansi gets paid." photo grid
→ FAQs accordion → "Start charging in rand." → ink footer with the giant wordmark. Copy in
[Copy.md](Copy.md). No partner logos, stats or testimonials until they are real.

Scroll motion: sections rise in once as they enter the view; steps, "what's checked" rows and FAQs stagger; the people photos wipe up and settle from a zoom; the hero and customer photos drift slowly. The hero headline is sized to its own column (`13cqi`), so the longest rotating word always fits. All of it is off under reduced motion.

## 5. Merchant screens

### 5.1 Sign-up and onboarding

- **Sign up / sign in:** one page with a pill switch (Create account / Sign in). Sign up asks for
  business name, email, password, then goes straight to `/get-started`. A photo panel sits on the
  right on desktop and is hidden on phones.
- **Get started checklist** (each step shows done / to do):
  1. **Add your receiving wallet**: paste a `G…` address. Live hint if it looks like an `S…` secret: *"That's a secret key. Never share it. Paste the address that starts with G."* (The API refuses it too.)
  2. **Prove it's yours**: "Verify with Freighter" opens Freighter to sign a message. No funds move.
  3. **Make sure it can receive USDC**: shows account and trustline checks with a fix-it hint ("Add a USDC trustline in your wallet") and a "Check again" button.
  4. **Choose how you price** (optional): manual, or set a fixed rate.
  5. **Create your first request.**

  The design shows this as two cards, **Connect your wallet** (steps 1–3 in the connect sheet from
  §5.7) and **Set your rate** (step 4), then "Open dashboard". Each card turns green when done.

### 5.2 Overview (`/overview`)

- Cards: **Requested (ZAR)** this month · **Collected (USDC)** this month · **Open requests** · **Needs attention** (links to filtered list).
- Recent requests (5) with status pills.
- Recent payments (5) with outcome pills.
- Empty state for new merchants points to "Create your first request".
- **Hide amounts:** an eye button next to "Received this month". Tapping it replaces the month total,
  the "Asked for" tile and the chart values with dots (`•••••• USDC`, `R •••••`); the chart shape
  stays. Shown by default; the choice is remembered on that device (`localStorage`, key
  `randi.hideAmounts`). Single request amounts, the activity feed and new-payment alerts are never
  hidden, because the merchant needs them to serve the customer in front of them. The button has
  `aria-pressed` and the label "Hide amounts" / "Show amounts".

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
- Wallet cards (label, short address, Verified / Takes USDC chips, "Check again").
- **Connect a wallet** dialog (bottom sheet on phones), three steps: 1. pick Freighter, xBull or
  "Paste an address" (with the secret-key guard); 2. sign the proof message in the wallet; 3. Randi
  runs the account and trustline checks live, then "Use this wallet". A pasted address is verified
  later with a wallet that can sign.
- Remove (explains that open requests keep working).

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

### 6.3 Pay with a wallet

"Pay with wallet" opens a sheet listing Freighter, xBull and Albedo, with
"Pay from any other wallet" (address, amount, memo, each with Copy) underneath. The sheet closes
only with its × button or Escape. For the wallet the customer picks:

1. Check the wallet is available; if not, show a link and the manual steps.
2. Check the wallet is on **Testnet**; if not: *"Switch your wallet to Testnet, then try again."*
3. Check the customer's account has a USDC trustline and enough balance; show what's missing before asking them to sign.
4. Show a review (amount, to, memo, network), build the payment (USDC, exact amount, memo = reference) and ask the wallet to sign.
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

- Real `<button>`, `<a>`, `<label for>` everywhere; visible focus ring (protea, 2 px offset; green stays reserved for Paid).
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

`pnpm e2e` covers F1, F2, F8, F9, F10, F11, F12 and F13 against a local API and worker with a real
Testnet payment (unit tests cover F9 too). A headless browser can't load a wallet extension, so the
walkthrough proves wallet ownership with the same SEP-53 signature through the API and sends the
customer's payment from Node. F3–F7 (stream blocked, wallet on Mainnet, no trustline, submit
timeout, closed requests) are handled in the code (`useCheckout`, `lib/wallets.ts`,
`lib/stellar-pay.ts`) but not yet automated.
