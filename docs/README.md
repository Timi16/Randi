# Randi docs

Randi lets South African businesses create payment requests priced in **ZAR**, share a payment page,
receive the matching **USDC** payment on **Stellar Testnet**, and have the system verify the payment
on-chain and mark the request **Paid**. Testnet only: no real money moves.

```
Create ZAR request → Share payment page → Customer pays USDC → Stellar detects payment → Verify → Paid
```

| Doc | What it covers | Read it when |
| --- | --- | --- |
| [Architecture.md](Architecture.md) | The whole system on one page: parts, flow, the ZAR/USDC money model, key decisions, how each line of David's brief is met, decisions on the open questions | First, always |
| [Backend.md](Backend.md) | API + worker: data model, pricing rules, payment reference, status machine, Stellar detection, verification rules, REST API, security, config, test plan | Building or changing anything server-side |
| [Frontend.md](Frontend.md) | Design system (colour, type, components, voice) and every screen: merchant dashboard and the public customer payment page, with wireframes and states | Building or changing anything in the web app |
| [Copy.md](Copy.md) | Every word on every surface: voice, landing page, payment page, merchant screens, errors | Writing or reviewing any user-facing text |
| [Build-plan.md](Build-plan.md) | Phases with gate checks, the demo scenario, and the evidence David asked for | Planning work and before calling anything "done" |

Status: backend built and verified on Testnet (30 Oct 2026); web app next. The design is based on
PayLink (our live Stellar Testnet payment-request app). Architecture.md explains what is reused, what
is new, and what was removed. [Evidence.md](Evidence.md) is the latest Testnet run.
