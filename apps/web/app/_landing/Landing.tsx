"use client";

import { formatStroops, parseZar, usdcForZar } from "@randi/shared";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Lockup, Mark, Wordmark } from "@/components/Logo";
import { formatAmount } from "@/lib/format";
import styles from "./landing.module.css";

const WORDS = ["in USDC.", "in seconds.", "with proof."];
const MARQUEE = ["Salons", "Spaza shops", "Bakeries", "Market stalls", "Tailors", "Kota spots", "Barbers", "Caterers", "Car washes", "Beadwork"];

// Example prices at R18.50 = 1 USDC (worked out with the same maths as the API).
const EXAMPLES = [
  { what: "Knotless braids", zar: "R650.00", usdc: "35.14", img: "/photos/braids-fan.jpg", pos: "50% 30%", credit: "Shedrack Salami", alt: "A woman with long braids holding a yellow fan" },
  { what: "Beadwork necklace", zar: "R450.00", usdc: "24.33", img: "/photos/red-headwrap.jpg", pos: "50% 25%", credit: "Steward Masweneng", alt: "A smiling woman in a red headwrap and beaded necklaces" },
  { what: "Phone screen repair", zar: "R350.00", usdc: "18.92", img: "/photos/market-phone.jpg", pos: "50% 25%", credit: "proudlyswazi", alt: "A woman with braids talking on her phone at an outdoor market" },
  { what: "Sneaker clean", zar: "R180.00", usdc: "9.73", img: "/photos/red-crate.jpg", pos: "50% 50%", credit: "abolova", alt: "A man in black crouching on a red crate in a field" },
  { what: "Suit hire, one day", zar: "R2,220.00", usdc: "120.00", img: "/photos/corduroy.jpg", pos: "50% 20%", credit: "Dion Martins", alt: "A man in sunglasses, corduroy jacket and paisley tie" },
  { what: "Festival face paint", zar: "R120.00", usdc: "6.49", img: "/photos/face-paint.jpg", pos: "50% 40%", credit: "Mpumelelo Macu", alt: "Two people with white face paint in a township street" },
  { what: "Kota and chips", zar: "R85.00", usdc: "4.60", img: "/photos/aloe.jpg", pos: "50% 30%", credit: "Karabo Mdluli", alt: "A young man in a black sweater in front of aloe plants" },
];

const STEPS = [
  { n: "01", title: "Ask in rand", body: "Type R500.00. Randi works out the USDC from your own rate.", bg: "var(--sun)", fg: "var(--ink)" },
  { n: "02", title: "Send the link", body: "WhatsApp, email or a QR on the counter.", bg: "var(--ink)", fg: "#fff" },
  { n: "03", title: "They pay USDC", body: "Any Stellar wallet. One tap with Freighter, xBull or Albedo.", bg: "var(--sand)", fg: "var(--ink)" },
  { n: "04", title: "Paid, with proof", body: "Checked on Stellar in about 10 seconds, with the transaction hash.", bg: "var(--protea)", fg: "#fff" },
];

const CASES = [
  { did: "Exact USDC, right wallet", tag: "Paid", bg: "var(--paid)", fg: "#fff" },
  { did: "Paid less than asked", tag: "Part-paid", bg: "var(--sun)", fg: "var(--ink)" },
  { did: "Sent XLM, not USDC", tag: "Rejected", bg: "var(--ink)", fg: "#fff" },
  { did: 'Fake "USDC" from another issuer', tag: "Rejected", bg: "var(--ink)", fg: "#fff" },
  { did: "Paid the same request twice", tag: "Flagged to send back", bg: "#fff", fg: "var(--protea)" },
  { did: "Pasted a hash, said they paid", tag: "Ignored", bg: "#fff", fg: "var(--protea)" },
];

const TILES = [
  { img: "/photos/market-phone.jpg", rows: 2, pos: "50% 25%", credit: "proudlyswazi / Unsplash", alt: "A woman with braids on her phone outdoors" },
  { img: "/photos/bucket-hat.jpg", rows: 1, pos: "60% 40%", credit: "abolova / Unsplash", alt: "A woman in a leopard bucket hat in a Johannesburg lane" },
  { img: "/photos/braids-fan.jpg", rows: 2, pos: "50% 30%", credit: "Shedrack Salami / Unsplash", alt: "A woman with braids and a yellow fan" },
  { img: "/photos/face-paint.jpg", rows: 1, pos: "50% 40%", credit: "Mpumelelo Macu / Unsplash", alt: "Two people in face paint on a street" },
  { img: "/photos/red-headwrap.jpg", rows: 2, pos: "50% 25%", credit: "Steward Masweneng / Unsplash", alt: "A woman in a red headwrap smiling" },
  { img: "/photos/corduroy.jpg", rows: 1, pos: "50% 20%", credit: "Dion Martins / Unsplash", alt: "A man in a corduroy jacket and sunglasses" },
  { img: "/photos/red-crate.jpg", rows: 1, pos: "50% 50%", credit: "abolova / Unsplash", alt: "A man crouching on a red crate" },
];

const FAQS = [
  { q: "Is this real money?", a: "No. Randi runs on Stellar Testnet, so every payment uses test USDC with no real value. Get some from Circle's faucet and try it end to end." },
  { q: "Where does the rand price come from?", a: "From you. Type the USDC yourself, or set your own fixed rate and Randi divides and rounds up to the cent. Randi never looks up exchange rates." },
  { q: "Does my customer need an account?", a: "No. They open your link and pay from any Stellar wallet. With Freighter, xBull or Albedo it's one tap; with any other wallet they copy the address, amount and reference." },
  { q: "What if they pay the wrong amount?", a: "Too little and the request shows what's still due. Too much and it's Paid, with the extra flagged for you to send back. The wrong asset is rejected." },
  { q: "How quickly does it say Paid?", a: "Usually within 10 seconds of the payment, once Stellar has closed the ledger and Randi has checked it." },
  { q: "Does Randi hold my money?", a: "Never. Payments go straight to your own wallet. Randi only reads the network and never asks for a secret key." },
];

const WAITING = { barW: "8%", barBg: "#E0A800", barMs: 250, dotBg: "var(--sun-soft)", pulse: "#E0A800", title: "Waiting for payment", note: "Expires in 29:41", mono: false };
const PAY_STAGES = [
  WAITING,
  { barW: "72%", barBg: "var(--ink)", barMs: 1400, dotBg: "var(--row)", pulse: "var(--ink)", title: "Payment seen", note: "Checking it on Stellar…", mono: false },
  { barW: "100%", barBg: "var(--paid)", barMs: 500, dotBg: "var(--paid)", pulse: "var(--paid)", title: "Paid · verified on Stellar", note: "tx 53b94f…67a4", mono: true },
];
const HOLD = [2800, 1500, 3400];

function usdcAt1850(zar: string): string {
  const cents = parseZar(zar.trim());
  if (cents === null || cents === 0n) return "0.00";
  return formatAmount(formatStroops(usdcForZar(cents, 185_000n))).replace(/,/g, "");
}

function Cta({ href, children, dark = true }: { href: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <Link href={href} className="cta" style={{ background: dark ? "var(--ink)" : "var(--protea)", color: "#fff" }}>
      {children}
      <span className="chip" style={{ background: dark ? "var(--sun)" : "#fff", color: dark ? "var(--ink)" : "var(--protea)" }}>
        <Icon name="plus" size={16} stroke={3} />
      </span>
    </Link>
  );
}

export function Landing() {
  const [word, setWord] = useState(0);
  const [car, setCar] = useState(0);
  const [pay, setPay] = useState(0);
  const [step, setStep] = useState(0);
  const [faq, setFaq] = useState(0);
  const [zar, setZar] = useState("500.00");

  useEffect(() => {
    const w = setInterval(() => setWord((i) => (i + 1) % WORDS.length), 2200);
    const c = setInterval(() => setCar((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => {
      clearInterval(w);
      clearInterval(c);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPay((p) => (p + 1) % 3), HOLD[pay]);
    return () => clearTimeout(t);
  }, [pay]);

  const stage = PAY_STAGES[pay] ?? WAITING;
  const paid = pay === 2;
  const usdc = usdcAt1850(zar);
  const n = EXAMPLES.length;

  return (
    <div className={styles.root}>
      <div className={styles.sheet}>
        <header className={styles.header}>
          <Link href="/" aria-label="Randi home" style={{ textDecoration: "none" }}>
            <Lockup size={28} />
          </Link>
          <nav aria-label="Main" className={styles.nav}>
            <a href="#how" className={styles.navLink}>
              How it works
            </a>
            <a href="#checked" className={styles.navLink}>
              What&apos;s checked
            </a>
            <a href="#faq" className={styles.navLink}>
              FAQs
            </a>
            <Link href="/login" className={styles.navLink}>
              Sign in
            </Link>
            <Link href="/overview" className="cta" style={{ height: 46, padding: "0 8px 0 20px", background: "var(--ink)", color: "#fff", fontSize: 15 }}>
              Open app
              <span className="chip" style={{ width: 32, height: 32, background: "var(--sun)", color: "var(--ink)" }}>
                <Icon name="plus" size={14} stroke={3} />
              </span>
            </Link>
          </nav>
        </header>

        <section id="top" className={styles.heroWrap}>
          <div className={styles.hero}>
            <div className={styles.heroText}>
              <span className={styles.eyebrow}>
                <span className={styles.eyebrowTag}>New</span>Payment requests for South African businesses
              </span>
              <h1 className={styles.h1}>
                <span style={{ display: "block" }}>Charge</span>
                <span style={{ display: "block" }}>in rand.</span>
                <span style={{ display: "block" }}>Get paid</span>
                <span className={styles.rotator} aria-live="off">
                  <span className={styles.rotatorInner} style={{ transform: `translateY(-${(word * 12) / 10}em)` }}>
                    {WORDS.map((w) => (
                      <span key={w}>{w}</span>
                    ))}
                  </span>
                </span>
              </h1>
              <p className={styles.heroSub}>Bill in rand. Get USDC straight to your wallet, confirmed on Stellar in seconds.</p>
              <div className={styles.ctas}>
                <Cta href="/overview" dark={false}>
                  Open app
                </Cta>
                <a href="#customer" className={styles.ghost}>
                  See a payment page
                </a>
              </div>
              <div className={styles.facts}>
                {[
                  ["~10 s", "from payment to Paid"],
                  ["Your rate", "no exchange-rate feed"],
                  ["Your wallet", "Randi never holds money"],
                ].map(([big, small]) => (
                  <div key={big} className={styles.fact}>
                    <span className={styles.factBig}>{big}</span>
                    <span className={styles.factSmall}>{small}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.heroMedia}>
              <div className={styles.photo}>
                <Image src="/photos/hero-wave.jpg" alt="A woman in a green print dress smiles at her phone and waves, against a magenta wall" fill priority sizes="(max-width: 1000px) 100vw, 50vw" style={{ objectFit: "cover", objectPosition: "46% 20%" }} />
                <div className={styles.liveCard} aria-live="polite">
                  <div className="row" style={{ gap: 8 }}>
                    <Mark size={26} />
                    <span style={{ fontWeight: 800, fontSize: 14, flexGrow: 1 }}>Thandi&apos;s Bakery</span>
                    <span className="testnet-pill" style={{ height: 22, fontSize: 10 }}>
                      Testnet
                    </span>
                  </div>
                  <div className="stack" style={{ gap: 2 }}>
                    <span className="hint" style={{ fontSize: 12 }}>
                      Birthday cake · #1042
                    </span>
                    <span style={{ fontWeight: 900, fontSize: 40, letterSpacing: "-0.045em", lineHeight: 1 }}>R500.00</span>
                  </div>
                  <div className="between" style={{ padding: "10px 12px", borderRadius: 14, background: "var(--page)", fontSize: 13 }}>
                    <span className="row" style={{ gap: 8, fontWeight: 700 }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--usdc)", color: "#fff", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>$</span>
                      27.03 USDC
                    </span>
                    <span className="mono" style={{ fontSize: 12, color: "#4A4450" }}>
                      memo RD7K2M9QXA
                    </span>
                  </div>
                  <div className={styles.bar}>
                    <div className={styles.barFill} style={{ width: stage.barW, background: stage.barBg, ["--bar-ms" as string]: `${stage.barMs}ms` }} />
                  </div>
                  <div className="row" style={{ minHeight: 36 }}>
                    <span className={styles.statusDot} style={{ background: stage.dotBg }}>
                      {paid ? <Icon name="check" size={16} stroke={3.2} style={{ color: "#fff", animation: "pop 420ms var(--ease) both" }} /> : <span className={styles.pulse} style={{ background: stage.pulse }} />}
                    </span>
                    <span className="stack" style={{ gap: 0 }}>
                      <strong style={{ fontSize: 14 }}>{stage.title}</strong>
                      <span className={stage.mono ? "mono hint" : "hint"} style={{ fontSize: 12 }}>
                        {stage.note}
                      </span>
                    </span>
                  </div>
                </div>
                <div className={styles.toast} style={{ opacity: paid ? 1 : 0, transform: paid ? "none" : "translateY(-12px)" }} aria-hidden={!paid}>
                  <span style={{ width: 30, height: 30, borderRadius: 10, background: "var(--paid)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="check" size={14} stroke={3.2} />
                  </span>
                  <span className="stack" style={{ gap: 0 }}>
                    <strong style={{ fontSize: 13 }}>+27.03 USDC received</strong>
                    <span style={{ fontSize: 11, color: "var(--on-dark-2)" }}>Your wallet · just now</span>
                  </span>
                </div>
                <span className={styles.credit}>Photo: Ahmed Nasiru / Unsplash · example request</span>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Who it's for" className={styles.marquee}>
          <div className={styles.marqueeTrack}>
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={`${m}-${i}`} className={styles.marqueeItem} aria-hidden={i >= MARQUEE.length}>
                {m}
                <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 0c.9 6.3 5.7 11.1 12 12-6.3.9-11.1 5.7-12 12-.9-6.3-5.7-11.1-12-12 6.3-.9 11.1-5.7 12-12z" fill="#FFD13B" />
                </svg>
              </span>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.carouselHead}>
            <h2 className={styles.h2}>
              Any price.
              <br />
              Any hustle.
            </h2>
            <div className="stack" style={{ maxWidth: 360 }}>
              <p style={{ margin: 0, color: "var(--text-2)" }}>Type it in rand. Randi works out the USDC.</p>
              <div className="row">
                <button type="button" className={styles.roundBtn} aria-label="Previous example" onClick={() => setCar((c) => (c - 1 + n) % n)}>
                  <Icon name="arrowLeft" size={18} stroke={2.5} />
                </button>
                <button type="button" className={styles.roundBtnDark} aria-label="Next example" onClick={() => setCar((c) => (c + 1) % n)}>
                  <Icon name="arrowRight" size={18} stroke={2.5} />
                </button>
              </div>
            </div>
          </div>
          <div className={styles.stage}>
            {EXAMPLES.map((e, i) => {
              let off = (i - car + n) % n;
              if (off > n / 2) off -= n;
              const a = Math.abs(off);
              return (
                <div
                  key={e.what}
                  className={styles.card3d}
                  aria-hidden={off !== 0}
                  style={{ transform: `translateX(${off * 74}%) translateZ(${-a * 220}px) rotateY(${-off * 16}deg)`, opacity: a > 2 ? 0 : 1 - a * 0.15, zIndex: 10 - a }}
                >
                  <Image src={e.img} alt={e.alt} fill sizes="320px" style={{ objectFit: "cover", objectPosition: e.pos }} />
                  <div className={styles.cardFoot}>
                    <div className="stack" style={{ gap: 4 }}>
                      <span className="hint" style={{ fontSize: 12, fontWeight: 600 }}>
                        {e.what}
                      </span>
                      <span style={{ fontWeight: 900, fontSize: 24, letterSpacing: "-0.04em", lineHeight: 1 }}>{e.zar}</span>
                    </div>
                    <span className={styles.usdcTag}>{e.usdc} USDC</span>
                  </div>
                  <span className={styles.photoTag}>Example · {e.credit}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section id="customer" className={styles.panelWrap}>
          <div className={styles.darkPanel}>
            <div className="stack" style={{ flex: "1 1 340px", minWidth: 0, gap: 22 }}>
              <span className={styles.tag}>For your customer</span>
              <h2 className={styles.h2}>
                No app. No account.
                <br />
                <span style={{ color: "var(--sun)" }}>Just pay.</span>
              </h2>
              <p style={{ margin: 0, fontSize: 16, color: "#CFC9D3", maxWidth: 440 }}>They open your link and pay from any Stellar wallet. The page flips to Paid by itself.</p>
            </div>
            <div style={{ flex: "0 0 auto", margin: "0 auto" }}>
              <div className={styles.phone}>
                <div className={styles.phoneScreen}>
                  <div style={{ background: "var(--sun)", fontSize: 10, fontWeight: 700, textAlign: "center", padding: "22px 0 6px" }}>Stellar Testnet · test money</div>
                  <div className="row" style={{ padding: "16px 16px 0", gap: 8 }}>
                    <span className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                      TB
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Thandi&apos;s Bakery</span>
                  </div>
                  <div className="stack" style={{ padding: "14px 16px", gap: 4 }}>
                    <span className="hint" style={{ fontSize: 11 }}>
                      Birthday cake · R500.00
                    </span>
                    <span style={{ fontWeight: 900, fontSize: 46, letterSpacing: "-0.05em", lineHeight: 0.95 }}>27.03</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>USDC to send</span>
                  </div>
                  <div className="stack" style={{ margin: "0 16px", padding: "10px 12px", borderRadius: 14, background: "var(--sand)", gap: 2 }}>
                    <span className="hint" style={{ fontSize: 10 }}>
                      Reference (memo)
                    </span>
                    <span className="mono" style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.06em" }}>
                      RD7K2M9QXA
                    </span>
                  </div>
                  <div style={{ margin: "12px 16px 0", height: 46, borderRadius: 999, background: "var(--protea)", color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>Pay with wallet</div>
                  <div className="between" style={{ margin: "14px 16px 0", padding: "10px 12px", borderRadius: 14, border: "1.5px dashed #D9D4DD", fontSize: 11, color: "var(--muted)" }}>
                    <span>Waiting for payment</span>
                    <span className="mono">24:51</span>
                  </div>
                </div>
              </div>
            </div>
            <figure className={styles.figure}>
              <Image src="/photos/phone-yellow.jpg" alt="A woman in a green print dress holds up her phone and smiles, against a yellow wall" fill sizes="(max-width: 900px) 100vw, 30vw" style={{ objectFit: "cover", objectPosition: "30% 50%" }} />
              <figcaption style={{ position: "absolute", left: 16, bottom: 14, fontSize: 11, color: "rgba(14, 11, 16, 0.75)" }}>Photo: Ahmed Nasiru / Unsplash</figcaption>
            </figure>
          </div>
        </section>

        <section id="how" className={`${styles.container} ${styles.section}`}>
          <h2 className={styles.h2} style={{ marginBottom: 36 }}>
            Four steps.
            <br />
            Zero sums.
          </h2>
          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <button key={s.n} type="button" className={styles.step} aria-expanded={step === i} onClick={() => setStep(i)} style={{ flex: step === i ? "3.2 1 380px" : "1 1 200px", background: s.bg, color: s.fg }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>
                  {s.n}
                </span>
                <span className="stack" style={{ gap: 14 }}>
                  <span className={styles.display} style={{ fontSize: "clamp(20px, 1.8vw, 28px)" }}>
                    {s.title}
                  </span>
                  {step === i && <span style={{ fontSize: 15, fontWeight: 400, maxWidth: 420, animation: "rd-in 600ms var(--ease) both" }}>{s.body}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={`${styles.container} ${styles.section}`} style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center" }}>
          <div className="stack" style={{ flex: "1 1 380px", minWidth: 0, gap: 18 }}>
            <span className={styles.tag}>Your rate, not a live exchange rate</span>
            <h2 className={styles.h2}>
              Two amounts.
              <br />
              One gets checked.
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: "var(--text-2)", maxWidth: 480 }}>Your customer sees both. Randi only checks the USDC.</p>
          </div>
          <div className={styles.amountBox}>
            <label className="stack" style={{ gap: 8, fontSize: 14, fontWeight: 600 }}>
              Type a price in rand
              <span className={styles.zarField}>
                <span style={{ fontWeight: 900, fontSize: 28, letterSpacing: "-0.04em" }}>R</span>
                <input value={zar} onChange={(e) => setZar(e.target.value.replace(",", ".").replace(/[^\d.]/g, "").slice(0, 10))} inputMode="decimal" aria-label="Price in rand" />
                <span className="hint" style={{ whiteSpace: "nowrap" }}>
                  at R18.50 / USDC
                </span>
              </span>
            </label>
            <div className="stack" style={{ gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)" }}>Your customer sends</span>
              <div className="row wrap" style={{ alignItems: "baseline", gap: 14 }}>
                <div className={styles.odometer} aria-label={`${usdc} USDC`}>
                  {[...usdc].map((ch, i) =>
                    ch >= "0" && ch <= "9" ? (
                      <span key={`${i}-${usdc.length}`} className={styles.digit} aria-hidden="true">
                        <span className={styles.digitStrip} style={{ transform: `translateY(-${Number.parseInt(ch, 10) * 10}%)`, transitionDelay: `${(usdc.length - 1 - i) * 40}ms` }}>
                          {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                            <span key={d}>{d}</span>
                          ))}
                        </span>
                      </span>
                    ) : (
                      <span key={`${i}-dot`} aria-hidden="true">
                        {ch}
                      </span>
                    ),
                  )}
                </div>
                <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.04em" }}>USDC</span>
              </div>
              <span className="hint">Rounded up to the next cent, so you&apos;re never short.</span>
            </div>
          </div>
        </section>

        <section id="checked" className={styles.panelWrap} style={{ paddingTop: "clamp(72px, 12vh, 128px)" }}>
          <div className={styles.proteaPanel}>
            <div className="stack" style={{ flex: "1 1 380px", minWidth: 0, gap: 20 }}>
              <h2 className={styles.h2}>Paid means paid.</h2>
              <p style={{ margin: 0, fontSize: 16, maxWidth: 420, color: "#FFE3EE" }}>Only a real Stellar transaction counts. Screenshots don&apos;t.</p>
            </div>
            <div style={{ flex: "1 1 460px", minWidth: 0 }}>
              {CASES.map((c) => (
                <div key={c.did} className={styles.caseRow}>
                  <span>{c.did}</span>
                  <span className={styles.caseTag} style={{ background: c.bg, color: c.fg }}>
                    {c.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.container} ${styles.section}`}>
          <h2 className={styles.h2} style={{ marginBottom: 32 }}>
            Mzansi
            <br />
            gets paid.
          </h2>
          <div className={styles.tiles}>
            {TILES.map((t) => (
              <figure key={t.img + t.rows} className={styles.tile} style={{ gridRow: `span ${t.rows}` }}>
                <Image src={t.img} alt={t.alt} fill sizes="(max-width: 700px) 100vw, 25vw" style={{ objectFit: "cover", objectPosition: t.pos }} />
                <figcaption className={styles.tileCredit}>{t.credit}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="faq" className={`${styles.container} ${styles.section}`} style={{ display: "flex", flexWrap: "wrap", gap: 40 }}>
          <h2 className={styles.h2} style={{ flex: "1 1 300px" }}>
            FAQs
          </h2>
          <div style={{ flex: "2 1 520px", minWidth: 0 }}>
            {FAQS.map((f, i) => {
              const open = faq === i;
              return (
                <div key={f.q} className={styles.faqItem}>
                  <button type="button" className={styles.faqBtn} aria-expanded={open} onClick={() => setFaq(open ? -1 : i)}>
                    {f.q}
                    <span className={styles.faqChip} style={{ background: open ? "var(--protea)" : "var(--ink)", transform: `rotate(${open ? 45 : 0}deg)` }}>
                      <Icon name="plus" size={14} stroke={3} />
                    </span>
                  </button>
                  {open && <p style={{ margin: "0 0 24px", fontSize: 17, lineHeight: 1.55, color: "var(--text-2)", maxWidth: 640 }}>{f.a}</p>}
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.container} style={{ padding: "clamp(96px, 14vh, 160px) clamp(20px, 3vw, 40px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 32, textAlign: "center" }}>
          <h2 className={styles.display} style={{ fontSize: "clamp(36px, 4.6vw, 72px)", fontStretch: "110%" }}>
            Start charging
            <br />
            <span style={{ color: "var(--protea)" }}>in rand.</span>
          </h2>
          <Cta href="/signup">Create your account</Cta>
          <span className="hint">Stellar Testnet only. Test money, no real value.</span>
        </section>
      </div>

      <footer className={styles.footer}>
        <div style={{ maxWidth: 1360, margin: "0 auto" }} className="stack">
          <div className="between wrap" style={{ alignItems: "flex-start", gap: 40, marginBottom: 32 }}>
            <Wordmark size={96} color="#fff" coin="#FFD13B" />
            <div className="row wrap" style={{ gap: 56, alignItems: "flex-start", fontSize: 15 }}>
              <div className="stack" style={{ gap: 12 }}>
                <span style={{ color: "var(--muted-2)", fontSize: 13 }}>Product</span>
                <a href="#how">How it works</a>
                <a href="#checked">What&apos;s checked</a>
                <a href="#faq">FAQs</a>
              </div>
              <div className="stack" style={{ gap: 12 }}>
                <span style={{ color: "var(--muted-2)", fontSize: 13 }}>Account</span>
                <Link href="/signup">Create account</Link>
                <Link href="/login">Sign in</Link>
              </div>
              <div className="stack" style={{ gap: 12 }}>
                <span style={{ color: "var(--muted-2)", fontSize: 13 }}>Testnet</span>
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                  Get test USDC
                </a>
                <a href="https://www.freighter.app" target="_blank" rel="noreferrer">
                  Get Freighter
                </a>
              </div>
            </div>
          </div>
          <div className="between wrap" style={{ paddingTop: 24, borderTop: "1px solid #2B2630", fontSize: 13, color: "var(--muted-2)" }}>
            <span>Payment requests in rand, paid in USDC. Stellar Testnet only; no real money moves.</span>
            <span>Photos via Unsplash, credited where shown.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
