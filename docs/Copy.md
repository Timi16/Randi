# Randi — Copy deck

30 Oct 2026 · Words for every surface. Use these as written; change them here first if they need to change.

## Voice

Write like a good shopkeeper's slip: plain, exact, a little dry. The reader is a South African
business owner who wants their money, and their customer, who may never have touched Stellar.

- **Say what happens, in the order it happens.** "Send the link. Your customer pays. The page says Paid."
- **Name the risk instead of soothing it.** "Leave the reference off and Randi can't tell it's yours. You'll have to link it by hand."
- **Real amounts, always.** "R500.00", "27.03 USDC". Never "some USDC" or "your payment".
- **South African English.** Colour, cancelled, organise. Rand is `R500.00`, never `ZAR 500` in prose.
- **Say Stellar where it carries weight, and USDC every time money moves.** Don't sell the chain.
- **Never:** seamless, effortless, revolutionary, the future of, web3, crypto-powered, trustless, unlock, empower, game-changer, "Not X, but Y", dramatic dashes, emoji in the product.

### Words we use

| Use | Not |
| --- | --- |
| payment request | invoice, payment link (as a noun) |
| payment reference (memo once, in brackets) | memo, tag, note |
| Paid · Part-paid · Expired · Cancelled · Failed | Completed, Partially paid, Timed out |
| your rate | exchange rate, FX, conversion |
| test money / Stellar Testnet | sandbox, demo money |
| send it back from your wallet | refund (as something Randi does) |
| verified on Stellar | confirmed, secured |

## Landing page

**Eyebrow** · Payment requests for South African businesses · Stellar Testnet

**Headline** · Charge in rand. Get paid in USDC.

**Sub** · Make a payment request in rand and send the link on WhatsApp. Randi watches Stellar until the
money lands. Then the request says Paid and shows the transaction that proves it.

**Buttons** · Create a test account · See what your customer sees

**Hero builder** (the hero is a working request, not a picture of one)
- Label: Try it. Type a rand amount.
- Rate field label: Your rate (R per 1 USDC)
- Result label: Your customer sends
- Under it: Rounded up to the next cent, so you're never short.
- Small print: Test money only. Nothing here moves real funds.

**01 · How a request travels**
1. **You ask in rand.** R500.00 for Order #1042.
2. **Randi works out the USDC.** From your own rate, rounded up to the cent.
3. **You send the link.** WhatsApp, email, or a QR code on the counter.
4. **Your customer pays.** From any Stellar wallet, with one reference in the memo.
5. **Randi checks the chain.** Right wallet, real USDC, right amount, before the deadline.
6. **It says Paid, with proof.** The same transaction hash on your screen and theirs.

**02 · Two amounts. Only one gets checked.**
Your customer sees what you charge in rand and exactly how much USDC to send. Randi only ever checks
the USDC; the rand is there so nobody has to do sums at the till.

Your rate is your number. Randi doesn't fetch exchange rates, and every payment page says so.

Example strip: `R500.00 ÷ R18.50 = 27.027…` → `27.03 USDC` · "Rounded up, so you're never short."

**03 · What happens when a payment isn't quite right**
Lead-in: Randi says Paid only after it reads the transaction on Stellar itself. A screenshot, a pasted
hash or "I've paid, promise" changes nothing.

| They did this | Randi does this |
| --- | --- |
| Sent XLM instead of USDC | Rejects it. Your request stays open. |
| Sent "USDC" from a different issuer | Rejects it and flags it as counterfeit. |
| Paid someone else's wallet | Doesn't count it for you. |
| Sent less than asked | Marks it part-paid and shows what's still due. |
| Paid twice | Keeps it Paid and flags the second payment for you to send back. |
| Paid after the deadline | Marks it expired and flags the money for you to send back. |
| Pasted a hash and said they paid | Ignores it. Only the chain counts. |

**04 · Testnet, plainly**
Randi runs on Stellar Testnet. The money is test money, so every page carries a SPECIMEN mark, the
same thing banks print on notes that aren't worth anything. Get test USDC from Circle's faucet and
try the whole thing end to end.

**Photo captions** (credit every photo, never imply a business uses Randi)
- Bo-Kaap, Cape Town · Photo: Anil Baki Durmus / Unsplash
- Rosebank Sunday Market, Johannesburg · Photo: Vije Vijendranath / Unsplash
- Bo-Kaap, Cape Town · Photo: Jean van Wyk / Unsplash
- Bo-Kaap Museum, Cape Town · Photo: Arno Smit / Unsplash

**Closing** · Make your first request in about a minute. · Button: Create a test account

**Footer** · randi · Payment requests in rand, paid in USDC · Stellar Testnet only · Docs · API reference · Get test USDC

## Customer payment page

| Where | Copy |
| --- | --- |
| Thread | STELLAR TESTNET · SPECIMEN · NO REAL VALUE |
| Above the card | Payment request from **Thandi's Bakery** · Verified wallet |
| Line | Birthday cake · Order #1042 |
| Denomination label | Requested |
| Instruction label | Send exactly |
| Rate line (fixed) | Rate set by Thandi's Bakery: R18.50 = 1 USDC. Not a live exchange rate. |
| Rate line (manual) | USDC amount set by Thandi's Bakery. |
| Waiting | Waiting for your payment · Expires in 24:51 |
| Watching line | Randi checks Stellar every few seconds. Keep this page open. |
| Pay button | Pay with Freighter |
| Guard: no extension | Install Freighter to pay in one tap, or use the details below |
| Guard: wrong network | Switch Freighter to Testnet to pay |
| Guard: no trustline | Your wallet needs a USDC trustline first |
| Guard: low balance | You have 12.40 USDC. This needs 27.03. |
| Divider | or pay from any Stellar wallet |
| Rows | Network · Asset · Send to · Reference (put this in the memo) · Amount |
| Copy button | Copy → Copied |
| QR | Scan with a Stellar wallet. It fills in the address, amount, USDC and reference. |
| Steps | 1. Switch your wallet to Stellar Testnet. 2. Send exactly 27.03 USDC to the address above. 3. Put RD7K2M9QXA in the memo. 4. Keep this page open. It updates when Stellar confirms, usually within 10 seconds. |
| Help link | How do I get test USDC? |
| Sent (local) | Sent. Waiting for Stellar to confirm… |
| Failed tx | That didn't go through: not enough USDC. Nothing was sent. Try again. |
| Part-paid | 19.03 of 27.03 USDC received. **8.00 USDC is still due.** Send it with the same reference. |
| Paid | **Paid.** Verified on Stellar Testnet. |
| Paid rows | Requested · Received · Paid at · Transaction · Reference |
| Paid link | View on stellar.expert |
| Paid footer | You can close this page. Thandi's Bakery can see it too. |
| Overpaid | You sent 2.00 USDC more than asked. Thandi's Bakery can send the extra back. |
| Rejected payment | We saw 27.03 XLM with this reference. It wasn't applied: this request takes USDC only. |
| Expired | This request expired at 14:30. Don't send anything. Ask Thandi's Bakery for a new link. |
| Cancelled | Thandi's Bakery cancelled this request. Don't send anything. |
| Failed | This request can't be paid any more: the test network was reset. Ask for a new link. |
| Can't receive | Thandi's Bakery's wallet can't take USDC right now. Let them know before you pay. |
| Not found | We can't find this payment request. Check the link you were sent. |
| Reconnecting | Reconnecting… your status is safe. |
| Trust line | Verified on Stellar by randi · Request aZ81kQp0LmX3 |

## Merchant: new request

| Where | Copy |
| --- | --- |
| Title | New payment request |
| Amount | Amount in rand |
| Pricing switch | Use my rate · R18.50 / USDC · I'll type the USDC |
| No rate set | Set your rate in Settings to use it here. |
| Preview label | Your customer sends |
| Preview note | R500.00 ÷ your rate of R18.50, rounded up to the next cent. |
| Manual note | That's R18.52 per USDC. For your information only. |
| Fields | What's it for? (e.g. Birthday cake) · Order number (optional) · Pay into · Expires after |
| Rate note | This is your own rate, not a live exchange rate. Changing it later only affects new requests. |
| Button | Create request |
| Success | Request created. Send the link to your customer. |
| Share | Copy link · Share on WhatsApp · Show QR |
| WhatsApp message | Hi! Thandi's Bakery has sent you a payment request for R500.00 (27.03 USDC on Stellar Testnet): {link} |

## Merchant: requests, payments, settings

| Where | Copy |
| --- | --- |
| List title | Payment requests |
| Filters | All · Pending · Paid · Expired · Failed · Needs attention |
| Search | Reference, order or description |
| Empty (new) | No requests yet. Make one and send the link to a customer. · Button: New request |
| Empty (filter) | Nothing here. Try another filter. |
| Needs attention reasons | Wallet can't take USDC · A payment was rejected · R… to send back |
| Stat labels | Asked for this month · Received this month · Open now · Needs attention |
| Live announcement | Order #1042 is paid. |
| Cancel dialog | Cancel this request for R500.00? · Your customer's link will stop taking payments. · Buttons: Cancel request · Keep it open |
| Unmatched | Payments without a reference. Link one to a request, or send it back. |
| Link dialog | Link 27.03 USDC to a request · Only requests on this wallet are shown. Randi still checks the time and the amount. |
| Refund owed | 2.00 USDC to send back · Send it from your wallet, then mark it here. · Button: Mark as sent back |
| Rate settings | Your rate · R ___ = 1 USDC · Last changed 30 Oct, 14:02 · This is your own number. Randi never looks up exchange rates. |

## Errors (API code → what people read)

| Code | Copy |
| --- | --- |
| VALIDATION_FAILED | Check the highlighted field. (field-level: "Use numbers only, like 500.00") |
| RATE_NOT_SET | Set your rate in Settings first, or type the USDC amount yourself. |
| AMOUNT_TOO_SMALL | That's less than 0.01 USDC. Ask for a bit more. |
| UNSUPPORTED_ASSET | Randi requests are paid in USDC only. |
| WALLET_NOT_VERIFIED | Verify this wallet before you use it. It takes one signature in Freighter. |
| ACCOUNT_NOT_FOUND | This wallet doesn't exist on Testnet yet. Fund it with Friendbot, then check again. |
| NO_TRUSTLINE | This wallet can't take USDC yet. Add a USDC trustline in your wallet, then check again. |
| TRUSTLINE_LIMIT_TOO_LOW | This wallet's USDC limit is too low for this amount. Raise it in your wallet. |
| SECRET_KEY_REJECTED | That's a secret key. Never share it with anyone. Paste the address that starts with G. |
| INVALID_SIGNATURE · CHALLENGE_EXPIRED | That signature didn't match. Try verifying again. |
| WALLET_TAKEN | Another business has verified this wallet. Use a different one. |
| INVALID_TRANSITION | This request has already moved on. Refresh to see where it is. |
| PAYMENT_NOT_LINKABLE | This payment can't be linked to that request. Only unmatched USDC on the same wallet, before the deadline. |
| IDEMPOTENCY_MISMATCH | Something changed while we were saving. Check the details and try again. |
| RATE_LIMITED | Too many tries. Wait a minute and try again. |
| HORIZON_UNAVAILABLE · SERVICE_UNAVAILABLE | We can't reach Stellar right now. Your requests are safe; try again shortly. |
| INTERNAL | Something broke on our side. Try again, and tell us if it keeps happening. |
