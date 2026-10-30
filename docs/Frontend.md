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

## 2. Design system: "Clear Rand"

Chosen 30 Oct 2026. Visual reference: the **Randi design** canvas
(https://claude.ai/artifact/8PLRDWPvpX3ahEnSbpmp1P), which has the system board and the four key
screens. The look borrows from three products and copies none of them:

| From | What we take |
| --- | --- |
| **Stripe** | Navy ink on a cool light canvas, crisp white cards with hairline borders, tabular figures, calm tables |
| **Paystack** | The checkout shape: dark header with the merchant on top, one centred card, a big green pay button, a "secured by" line at the bottom; friendly, plain copy |
| **USDT / USDC** | Money green (Tether) for money that moved or arrived; USDC blue only on the USDC chip |

### 2.1 Three ideas behind every screen

1. **Two amounts, never confused.** ZAR is what the merchant asks; USDC is what the customer sends. They always appear together in the **Amount pair**: ZAR small with the label "Requested", USDC large with "Send exactly" and the USDC chip, and the rate line under it.
2. **Proof, not promises.** "Paid" always comes with the transaction hash, the time and a stellar.expert link. Nothing says Paid without it.
3. **Testnet is never hidden.** An amber banner, *"Stellar Testnet · test money, no real value"*, sits on top of every customer page and as a chip in the merchant app bar.

### 2.2 Colour

| Token | Hex | Use |
| --- | --- | --- |
| `--ink` | `#0A2540` | Text, dark buttons |
| `--midnight` | `#061B31` | Payment page header, landing hero, avatars |
| `--slate` | `#425466` | Secondary text |
| `--mist` | `#697386` | Labels, hints (passes 4.5:1 on white and canvas) |
| `--line` | `#E3E8EE` | Borders, dividers (`#EEF1F5` between rows, `#D5DBE3` on inputs and secondary buttons) |
| `--canvas` | `#F6F9FC` | Page background |
| `--surface` | `#FFFFFF` | Cards |
| `--cyan` | `#0BA4DB` | Brand mark and merchant avatar fill (with ink text on it); never text on white |
| `--indigo` | `#4B45E3` (hover `#3A34C4`) | Every merchant action, links, focus ring, active tab |
| `--indigo-tint` | `#EEEDFD` | Selected nav item, info notes (text `#2D2899`) |
| `--mint` | `#137A60` | The customer's pay button, "Paid" and collected amounts (text on tint `#0F6A52`) |
| `--mint-tint` | `#E6F6F0` | Paid fills |
| `--usdt-green` | `#26A17B` | The Paid check icon and status dots only |
| `--usdc-blue` | `#2775CA` | USDC chip (chip fill `#EAF2FB`, text `#1D5FA8`) |
| `--amber` | `#F5A524` | Testnet, pending, part-paid (fill `#FFF6E0`, text `#8A5300`, border `#F5D78E`) |
| `--coral` | `#DF1B41` | Rejected, failed, errors (fill `#FDECEF`, text `#B3123A`) |
| grey status | fill `#EEF1F5`, text `#4A5568`, dot `#8792A2` | Expired, cancelled |

Rules: indigo is for the merchant, mint green is for money. Green never appears on a merchant
button, and indigo never appears on the customer's pay button. Light only in v1; every colour is a
token, so dark mode can come later.

### 2.3 Type

- **Inter** (400/500/600/700) for everything, with tabular figures (`font-feature-settings: 'tnum'`).
- **JetBrains Mono** (400/500) for the payment reference, addresses, request IDs and hashes.
- Scale: amount 40–44/700 (−0.03em) · page title 28/700 (−0.02em) · card title 20/600 · body 15/400 · small 13–14 · label 12/600 caps, +0.08em.

### 2.4 Shape and spacing

- Radius: payment card 18, cards 14–16, buttons and inputs 10–12, chips and pills fully round, outcome tags 6.
- Heights: inputs and buttons 44–46, the one main action 52–54, small buttons 34–36. Touch targets ≥ 44 px.
- Payment card shadow: `0 12px 32px rgba(10,37,64,0.10)`; everything else is flat with a 1 px border.
- Spacing 4 / 8 / 12 / 16 / 24 / 32 / 48; page padding 16 on phones, 24–32 on desktop; content max-width 1040.

### 2.5 Money display rules

- Amounts are strings from the API, formatted as strings (`parseFloat`/`Number()` banned).
- **ZAR:** `R1,250.00`, always 2 decimals. **USDC:** `27.03` + USDC chip, 2 decimals unless more are significant (up to 7); never round away a stroop difference on a status screen.
- **Rate line:** *"Rate set by {merchant}: R18.50 = 1 USDC. Not a live exchange rate."* Manual mode: *"USDC amount set by {merchant}."*
- Never say *exchange*, *conversion* or *live rate* about Randi's pricing (except "not a live exchange rate").

### 2.6 Status

Status is never colour alone: a pill has a dot and a word.

| Status | Pill |
| --- | --- |
| Pending, Part-paid | Amber |
| Paid, Paid · overpaid | Mint |
| Expired, Cancelled | Grey |
| Failed | Coral |

Payment outcomes are square-cornered tags: **Applied** (mint), **Rejected · wrong asset / wrong
recipient / counterfeit** (coral), **Not applied · late / already paid / after cancel** (grey),
**Unmatched** (amber).

### 2.7 Core components

| Component | What it is |
| --- | --- |
| `TestnetBanner` | Full-width amber strip on customer pages; amber chip in the merchant app bar. Never dismissable |
| `MerchantHeader` | Midnight band with the merchant's initials avatar, name and "Verified wallet"; the payment card overlaps it by 52 px (Paystack pattern) |
| `AmountPair` | Customer layout (USDC large) and merchant preview layout (same, with the "rounded up" explanation) |
| `PayButton` | Mint, 54 px, lock icon, "Pay with Freighter" |
| `DetailRows` | Network, asset (+ issuer), send to, reference (highlighted row), amount, each with Copy |
| `CopyButton` | Secondary button, "Copy" → "Copied"; `aria-label` names what it copies |
| `StatusPill`, `OutcomeTag` | §2.6 |
| `PaidProof` | Check in a mint ring, "Paid", "Verified on Stellar Testnet", rows for requested, received, paid at, transaction, reference; "View on stellar.expert" |
| `TrustLine` | Shield icon + "Verified on Stellar by randi" + request ID, at the bottom of every customer page |
| `Segmented` | Grey track, white selected segment with a soft shadow; used for pricing mode and list filters |
| `StatTile` | White card, 13 px label, 26/700 value; "Needs attention" tile has an amber border |
| `DataTable` | Caps header row, hairline rows, money right-aligned, references and hashes in mono, hash links in indigo; scrolls sideways in its box on small screens |
| `QrCode` | SEP-7 link as a QR in a 116 px tile, with a one-line explanation beside it |

### 2.8 Voice

Plain and specific, like Paystack's: say what happened and what to do next.

- ✅ "8.00 USDC is still due." · ❌ "Insufficient amount received."
- ✅ "This payment was in XLM, so it wasn't applied. Send it back from your wallet." · ❌ "WRONG_ASSET"
- ✅ "Paid. Verified on Stellar Testnet." · ❌ "Success!"
- Randi never moves money: refunds are *"Send it back from your wallet, then mark it refunded here."*
- Say "payment reference" and explain once that wallets call it the **memo**.

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

Short and honest:

1. Hero: *"Ask for rand. Get paid in USDC. Verified on Stellar."* + "Create a free test account". Testnet banner above.
2. The flow in 6 steps (the brief's product flow), with small illustrations of the dashboard and payment page.
3. "How the USDC amount is set": manual or your own fixed rate, no live FX.
4. "Proof, not promises": every Paid shows its Stellar transaction.
5. Footer: Testnet notice, link to docs.

---

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
