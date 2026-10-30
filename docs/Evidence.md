# Randi — Testnet evidence

Generated 2026-10-30T21:55:27.121Z by `pnpm scenario` against http://localhost:4300. Stellar **Testnet** only: no real money.

- Merchant: scenario-1793396795071@example.com · fixed rate **R18.50 = 1 USDC** (set by the merchant, not a live exchange rate)
- USDC issuer for this run: `GA6QTKY6XOLISRGTXC4U7M3L7O22EA63BXMRQSQAELOJEHZADG4B32NU`. The scenario issues its own testnet USDC so it can fund the payer; in normal use Randi is configured with Circle's testnet issuer. A payment in USDC from any other issuer is rejected as counterfeit (case D4).
- 20 payment requests created · 24 real Testnet transactions sent

## David's checklist

| Requirement | Proven by | Result |
| --- | --- | --- |
| At least three payment requests can be created successfully | D1, D2, D3 | PASS |
| Each request has a unique payment ID, payment reference, recipient address, amount, expiry and status | D1 | PASS |
| A merchant can share a payment page with a customer | D1 | PASS |
| At least five actual Stellar Testnet payment transactions are completed successfully | D1, D2, D7, P4, P13 | PASS |
| The system automatically detects a valid payment and marks the request Paid | D1, D2 | PASS |
| Each verified payment has a transaction hash linked to the correct payment request | D1, D2, D7 | PASS |
| A transaction with an incorrect amount is rejected or remains unpaid | D3, P18 | PASS |
| An invalid or expired payment request cannot be incorrectly marked as paid | D6, D8, D9 | PASS |
| Duplicate transaction events do not result in duplicate payment recognition | D7 | PASS |
| Payments in an unsupported asset or to an incorrect recipient are rejected | D4, D5 | PASS |
| The complete flow can be demonstrated from creation through verification and confirmation | D1 | PASS |

## Every case

| Case | What it checks | Result |
| --- | --- | --- |
| D1 | R92.50 at R18.50 -> 5.00 USDC; exact payment is detected, verified and PAID with its tx hash | PASS |
| D2 | two partial payments: PARTIALLY_PAID, then PAID on the exact sum | PASS |
| D3 | incorrect amount (too little) stays unpaid | PASS |
| D4 | unsupported asset: XLM, and counterfeit USDC, are rejected; the request stays PENDING | PASS |
| D5 | incorrect recipient: another merchant's reference paid to our wallet is rejected | PASS |
| D6 | a cancelled (invalid) request cannot be marked paid | PASS |
| D7 | duplicate: paying an already-paid request again is DUPLICATE; the status does not change | PASS |
| D8 | no endpoint marks a request paid from a claimed hash | PASS |
| P3 | unknown reference -> UNKNOWN_MEMO, unmatched | PASS |
| P4 | reference typed lowercase with separators -> COUNTED | PASS |
| P5 | MEMO_ID -> MEMO_TYPE_MISMATCH, unmatched | PASS |
| P11 | overpay -> OVERPAID, excess flagged for refund | PASS |
| P13 | two payment ops in one tx -> both COUNTED, summed | PASS |
| P14 | path payment XLM -> USDC counted by the USDC received | PASS |
| P15 | Soroban SAC transfer to the request's muxed address -> COUNTED, PAID | PASS |
| P2 | no reference -> NO_MEMO, then the merchant links it (still verified) | PASS |
| P18 | one stroop short -> PARTIALLY_PAID, never rounded | PASS |
| P19 | failed transaction -> nothing recorded | PASS |
| P20 | fee-bump transaction -> COUNTED with both hashes | PASS |
| T7 | expiry outside 5 min - 30 days -> 400 | PASS |
| T1 | paid before expiry -> PAID (and stays PAID after expiry) | PASS |
| T3 | partial, then expiry -> EXPIRED with the amount received | PASS |
| D9 | an expired request cannot be marked paid: a late payment is LATE and it stays EXPIRED | PASS |
| T1b | request paid before expiry is still PAID | PASS |

## Payment requests

| Case | Merchant | Request ID | Reference | Recipient | ZAR | USDC | Pricing | Expires | Final status | Verified tx |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Scenario Shop | [fxr2JzPW0n63](http://localhost:3000/pay/fxr2JzPW0n63) | `RDA309TYKP` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:16:37.466Z | PAID | [fb6f92…628d](https://stellar.expert/explorer/testnet/tx/fb6f9245621610ff89ec1ad5ca8dd04aaa96c5d5108cbb16c46efe50e786628d) |
| D2 | Scenario Shop | [SIkXU3hzSVQs](http://localhost:3000/pay/SIkXU3hzSVQs) | `RDXWQVCZH6` | `GDXJYU…OLZK` | R250.00 | 13.5000000 | manual | 2026-10-30T22:16:46.058Z | PAID | [d667f3…639a](https://stellar.expert/explorer/testnet/tx/d667f310d139d9370b38df0fc49e27d63a736b7b7c959b95462074bb540f639a) |
| D3 | Scenario Shop | [6XY3gP3XrrAQ](http://localhost:3000/pay/6XY3gP3XrrAQ) | `RDZ4J6D636` | `GDXJYU…OLZK` | R185.00 | 10.0000000 | fixed R18.5000 | 2026-10-30T22:16:57.029Z | PARTIALLY_PAID | — |
| D4 | Scenario Shop | [0QGGVXrHzEtQ](http://localhost:3000/pay/0QGGVXrHzEtQ) | `RDQ29ZYCZR` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:17:02.078Z | PENDING | — |
| D5 | Other Shop | [G7qnB4P7nFr2](http://localhost:3000/pay/G7qnB4P7nFr2) | `RD7RRJGGP4` | `GCSU6N…7D7F` | R92.50 | 5.0000000 | manual | 2026-10-30T22:17:12.039Z | PENDING | — |
| D6 | Scenario Shop | [1O5uIyFKCwbH](http://localhost:3000/pay/1O5uIyFKCwbH) | `RDYZCW58GW` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:17:18.999Z | CANCELLED | — |
| D7 | Scenario Shop | [Ce1TYMw3HPn1](http://localhost:3000/pay/Ce1TYMw3HPn1) | `RD6KPZN2DD` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:17:27.107Z | PAID | [e10f18…b99d](https://stellar.expert/explorer/testnet/tx/e10f186bc7381231ebad0bd68ad9cd9a6817dd429c5f76c3c02eec0d5fa0b99d) |
| D8 | Scenario Shop | [aY2DqIDgekLF](http://localhost:3000/pay/aY2DqIDgekLF) | `RD8N7K427C` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:17:42.075Z | PENDING | — |
| P4 | Scenario Shop | [yPqWiB7SdMiB](http://localhost:3000/pay/yPqWiB7SdMiB) | `RDKCTAENJ5` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:17:49.021Z | PAID | [a4e0c1…67f9](https://stellar.expert/explorer/testnet/tx/a4e0c18b98932f0de45b6c1086b3654537244504b4ce8fd64b0fb5a789e067f9) |
| P11 | Scenario Shop | [GMgEWarRWB5T](http://localhost:3000/pay/GMgEWarRWB5T) | `RDG1ZZ26H0` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:18:04.069Z | OVERPAID | [94a1cd…9a40](https://stellar.expert/explorer/testnet/tx/94a1cdadb3da0240ed515bed94b8fbcd8e07fcf1b4ac7a66a036a370787b9a40) |
| P13 | Scenario Shop | [p7gcm3ZUp3du](http://localhost:3000/pay/p7gcm3ZUp3du) | `RDD9ATW0G8` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:18:11.990Z | PAID | [9e1e8b…a711](https://stellar.expert/explorer/testnet/tx/9e1e8b118b7be407d74379c1de9056ee6e83ad3bdf0c0e67d9fe5186832fa711) |
| P14 | Scenario Shop | [CAbXk9lWFyOX](http://localhost:3000/pay/CAbXk9lWFyOX) | `RD4C8P47SY` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:18:18.984Z | PAID | [232694…c6df](https://stellar.expert/explorer/testnet/tx/2326943662fea07ccc8b83eef79b69a00f952624233b06bd71906f54b81ec6df) |
| P15 | Scenario Shop | [NdTkyM01s5lV](http://localhost:3000/pay/NdTkyM01s5lV) | `RDPFQ2THWK` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:18:30.841Z | PAID | [1bea78…dbc2](https://stellar.expert/explorer/testnet/tx/1bea787304279bc471345172ffd3501b1aa1a46b9525f2a8cf16c4773d05dbc2) |
| P2 | Scenario Shop | [PBN8G6BURufJ](http://localhost:3000/pay/PBN8G6BURufJ) | `RD865VP9N0` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:18:36.084Z | PAID | [f33385…d21d](https://stellar.expert/explorer/testnet/tx/f33385d3ac6596b3baf56f9edb0164052cdecdf123c328d77460be8f076bd21d) |
| P18 | Scenario Shop | [AgXVIJdh3krz](http://localhost:3000/pay/AgXVIJdh3krz) | `RD3NX0NCRT` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:18:49.217Z | PARTIALLY_PAID | — |
| P19 | Scenario Shop | [kz4OxLPEkICW](http://localhost:3000/pay/kz4OxLPEkICW) | `RDKKYEY2CS` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:18:57.021Z | PENDING | — |
| P20 | Scenario Shop | [4nKlcThLJTjk](http://localhost:3000/pay/4nKlcThLJTjk) | `RDCFBSDFA8` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T22:19:20.087Z | PAID | [6b7a3d…afcc](https://stellar.expert/explorer/testnet/tx/6b7a3d38464e31aef99ae0cd89e6eaa1f4e7757dbf47550c6630c617cafaafcc) |
| T1 | Scenario Shop | [qIe6E8MBKz04](http://localhost:3000/pay/qIe6E8MBKz04) | `RDH4JNJNBV` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T21:54:26.996Z | PAID | [538f7f…98e7](https://stellar.expert/explorer/testnet/tx/538f7f782d7b1513f3f66cf3c3a154fe37ba41180c7aff526fbea8b9b57f98e7) |
| D9 | Scenario Shop | [RLwf8wFuuFCi](http://localhost:3000/pay/RLwf8wFuuFCi) | `RD51AMV0BE` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T21:54:27.015Z | EXPIRED | — |
| T3 | Scenario Shop | [zY41vpDbuAXL](http://localhost:3000/pay/zY41vpDbuAXL) | `RD764WGXMH` | `GDXJYU…OLZK` | R92.50 | 5.0000000 | fixed R18.5000 | 2026-10-30T21:54:27.034Z | EXPIRED | — |

## Testnet transactions

| Case | Transaction | What was sent | Randi's outcome | For request |
| --- | --- | --- | --- | --- |
| D1 | [fb6f92…628d](https://stellar.expert/explorer/testnet/tx/fb6f9245621610ff89ec1ad5ca8dd04aaa96c5d5108cbb16c46efe50e786628d) | 5 USDC with the right reference | COUNTED | fxr2JzPW0n63 |
| D2 | [98423d…3f48](https://stellar.expert/explorer/testnet/tx/98423d301c12e048aca3e1f8f31819b5f5f13da07c48419384ebfa30a15a3f48) | 5 of 13.50 USDC | COUNTED | SIkXU3hzSVQs |
| D2 | [d667f3…639a](https://stellar.expert/explorer/testnet/tx/d667f310d139d9370b38df0fc49e27d63a736b7b7c959b95462074bb540f639a) | the remaining 8.50 USDC | COUNTED | SIkXU3hzSVQs |
| D3 | [cbb4ab…62c4](https://stellar.expert/explorer/testnet/tx/cbb4ab3842834db98c9611d67702ef490105dac7b28139f94ae7177cc3ba62c4) | 9 USDC for a 10 USDC request | COUNTED (partial) | 6XY3gP3XrrAQ |
| D4 | [c5766c…ac3d](https://stellar.expert/explorer/testnet/tx/c5766c8342be4b929f92c8766c91f56be8b56aabf4eee3df9c0b7ea63163ac3d) | 5 XLM with the right reference | WRONG_ASSET | 0QGGVXrHzEtQ |
| D4 | [8a17fb…3584](https://stellar.expert/explorer/testnet/tx/8a17fb476ce7f73b1d78d8af484b43f95b9a080e613c64d99a204c2a4f163584) | 5 "USDC" from a fake issuer | WRONG_ISSUER | 0QGGVXrHzEtQ |
| D5 | [142c99…a4f6](https://stellar.expert/explorer/testnet/tx/142c99f99639f50b26758e91e43bbf119f92c52f18b62c237277cbf583fca4f6) | Other Shop's reference, sent to Scenario Shop's wallet | WRONG_WALLET | G7qnB4P7nFr2 |
| D6 | [4ff77f…c114](https://stellar.expert/explorer/testnet/tx/4ff77faece99ec5024f01f73ad9884877d3c7a5d79ee66bf0c190a1307aac114) | 5 USDC to a cancelled request | AFTER_CANCEL | 1O5uIyFKCwbH |
| D7 | [e10f18…b99d](https://stellar.expert/explorer/testnet/tx/e10f186bc7381231ebad0bd68ad9cd9a6817dd429c5f76c3c02eec0d5fa0b99d) | 5 USDC | COUNTED | Ce1TYMw3HPn1 |
| D7 | [a4e16a…a18a](https://stellar.expert/explorer/testnet/tx/a4e16ae3ca935d5b504853b0b1a41e4a11091452affdd98a700fe38840eca18a) | the same 5 USDC again | DUPLICATE | Ce1TYMw3HPn1 |
| P3 | [46e6f5…d22d](https://stellar.expert/explorer/testnet/tx/46e6f56c42f98c1c49e3eb71ac8632a2b73414c2886f54e1128cece6a2ced22d) | 1 USDC with a reference that belongs to no request | UNKNOWN_MEMO | — |
| P4 | [a4e0c1…67f9](https://stellar.expert/explorer/testnet/tx/a4e0c18b98932f0de45b6c1086b3654537244504b4ce8fd64b0fb5a789e067f9) | 5 USDC with the reference typed as "rd-kcta enj5" | COUNTED | yPqWiB7SdMiB |
| P5 | [fed9ee…e791](https://stellar.expert/explorer/testnet/tx/fed9eeca0f77ff41114a718fd1807db3bc17ae117435a73c6e87708d27d8e791) | 1 USDC with an unrelated numeric memo | MEMO_TYPE_MISMATCH | — |
| P11 | [94a1cd…9a40](https://stellar.expert/explorer/testnet/tx/94a1cdadb3da0240ed515bed94b8fbcd8e07fcf1b4ac7a66a036a370787b9a40) | 6 USDC for a 5 USDC request | COUNTED (overpaid) | GMgEWarRWB5T |
| P13 | [9e1e8b…a711](https://stellar.expert/explorer/testnet/tx/9e1e8b118b7be407d74379c1de9056ee6e83ad3bdf0c0e67d9fe5186832fa711) | 2 + 3 USDC in one transaction | COUNTED x2 | p7gcm3ZUp3du |
| P14 | [232694…c6df](https://stellar.expert/explorer/testnet/tx/2326943662fea07ccc8b83eef79b69a00f952624233b06bd71906f54b81ec6df) | path payment: payer sends XLM, wallet receives 5 USDC | COUNTED | CAbXk9lWFyOX |
| P15 | [1bea78…dbc2](https://stellar.expert/explorer/testnet/tx/1bea787304279bc471345172ffd3501b1aa1a46b9525f2a8cf16c4773d05dbc2) | contract transfer of 5 USDC to the request's muxed address | COUNTED | NdTkyM01s5lV |
| P2 | [f33385…d21d](https://stellar.expert/explorer/testnet/tx/f33385d3ac6596b3baf56f9edb0164052cdecdf123c328d77460be8f076bd21d) | 5 USDC with no memo | NO_MEMO -> linked -> COUNTED | PBN8G6BURufJ |
| P18 | [47a252…e1e5](https://stellar.expert/explorer/testnet/tx/47a2525ab596b6b416df7ebff3fdb9454cf94ea21863beb4e86344a0e738e1e5) | 4.9999999 USDC for a 5 USDC request | COUNTED (partial) | AgXVIJdh3krz |
| P19 | [8215d7…3683](https://stellar.expert/explorer/testnet/tx/8215d7f69621ce34065629e4f3c4b5727914302d945d0612c0aa6bb19e693683) | a transaction that failed on-chain | nothing recorded | kz4OxLPEkICW |
| P20 | [6b7a3d…afcc](https://stellar.expert/explorer/testnet/tx/6b7a3d38464e31aef99ae0cd89e6eaa1f4e7757dbf47550c6630c617cafaafcc) | 5 USDC inside a fee-bump transaction | COUNTED | 4nKlcThLJTjk |
| T1 | [538f7f…98e7](https://stellar.expert/explorer/testnet/tx/538f7f782d7b1513f3f66cf3c3a154fe37ba41180c7aff526fbea8b9b57f98e7) | 5 USDC before expiry | COUNTED | qIe6E8MBKz04 |
| T3 | [b02f1b…2746](https://stellar.expert/explorer/testnet/tx/b02f1b241294afbd671d315fbe74c0ecadc3d257712d289b7cb62fd43be12746) | 2 of 5 USDC before expiry | COUNTED (partial) | zY41vpDbuAXL |
| D9 | [8e38f2…4e52](https://stellar.expert/explorer/testnet/tx/8e38f28372d7bcb335d4719f63dc46442675372a05e1717c50c721c65eaf4e52) | 5 USDC after the request expired | LATE | RLwf8wFuuFCi |
