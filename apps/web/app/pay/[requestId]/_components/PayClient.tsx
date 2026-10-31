"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { Mark, Wordmark } from "@/components/Logo";
import { QrCode } from "@/components/QrCode";
import { explorerTx } from "@/lib/config";
import { countdown, formatAmount, formatDateTime, formatTime, formatZar, fromStroops, initials, isPositive, plainAmount, shortAddress, shortHash, toStroops } from "@/lib/format";
import { useNow } from "@/lib/live";
import { isOpen, isSettled } from "@/lib/status";
import type { Checkout } from "@/lib/types";
import styles from "./pay.module.css";
import { useCheckout } from "./useCheckout";
import { WalletSheet } from "./WalletSheet";

/** The customer payment page (docs/Frontend.md §6). It only shows what the API says. */
export function PayClient({ requestId }: { requestId: string }) {
  const { state, retry, setEager } = useCheckout(requestId);

  return (
    <div className={styles.page}>
      <div className={styles.testnet} role="note">
        Stellar Testnet · test money, no real value
      </div>
      <main className={styles.wrap}>
        {state.phase === "loading" && <LoadingCard />}
        {state.phase === "not-found" && (
          <div className={styles.card}>
            <div className="empty">
              <strong>We can&apos;t find this payment request</strong>
              <span>Check the link, or ask the business to send it again.</span>
            </div>
          </div>
        )}
        {state.phase === "error" && (
          <div className={styles.card}>
            <div className="empty">
              <strong>We can&apos;t load this payment right now</strong>
              <span>{state.message}</span>
              <button type="button" className="btn btn-dark" onClick={retry} style={{ marginTop: 8 }}>
                Try again
              </button>
            </div>
          </div>
        )}
        {state.phase === "ready" &&
          (isSettled(state.checkout.status) ? (
            <PaidView checkout={state.checkout} />
          ) : (
            <OpenView checkout={state.checkout} live={state.live} setEager={setEager} />
          ))}
        <footer className={styles.foot}>
          <span>
            Request ID <span className="mono">{requestId}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            Verified on Stellar by <Wordmark size={13} />
          </span>
        </footer>
      </main>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className={styles.card} aria-busy="true" aria-label="Loading the payment request">
      <div className="row">
        <div className="skeleton" style={{ width: 44, height: 44, borderRadius: "50%" }} />
        <div className="skeleton" style={{ width: 160, height: 18 }} />
      </div>
      <div className="skeleton" style={{ height: 170, borderRadius: 22 }} />
      <div className="skeleton" style={{ height: 58, borderRadius: 18 }} />
    </div>
  );
}

function MerchantHeader({ checkout }: { checkout: Checkout }) {
  return (
    <div className={styles.merchant}>
      <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>
        {initials(checkout.businessName)}
      </span>
      <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Payment request from</span>
        <span className={styles.merchantName}>{checkout.businessName}</span>
        {checkout.walletVerified && (
          <span className={styles.verified}>
            <Icon name="check" size={12} stroke={3} style={{ verticalAlign: "-1px" }} /> Verified wallet
          </span>
        )}
      </span>
      <Mark size={30} />
    </div>
  );
}

function rateLine(c: Checkout): string {
  if (c.pricing.mode === "FIXED_RATE" && c.pricing.rate) {
    return `Rate set by ${c.businessName}: R${formatAmount(c.pricing.rate)} = 1 USDC. Not a live exchange rate.`;
  }
  return `${c.businessName} set this USDC amount. It isn't a live exchange rate.`;
}

function Amounts({ checkout }: { checkout: Checkout }) {
  const partial = checkout.status === "PARTIALLY_PAID";
  const due = partial ? checkout.usdcRemaining : checkout.usdcAmount;
  const title = [checkout.description, checkout.customerRef && `#${checkout.customerRef.replace(/^#/, "")}`].filter(Boolean).join(" · ") || "Amount requested";
  return (
    <div className={styles.amounts}>
      <div className={styles.amountsTop}>
        <span>{title}</span>
        <span className={styles.zar}>{formatZar(checkout.zarAmount)}</span>
      </div>
      <span className={styles.sendLabel}>{partial ? "Still to send" : "Send exactly"}</span>
      <div className={styles.usdc}>
        <span className={styles.usdcFigure}>{formatAmount(due)}</span>
        <span className={styles.usdcUnit}>
          <span className={styles.usdcDot}>$</span>USDC
        </span>
      </div>
      {partial && (
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--sun)" }}>
          {formatAmount(checkout.usdcRemaining)} USDC still due ({formatAmount(checkout.usdcReceived)} of {formatAmount(checkout.usdcAmount)} received)
        </span>
      )}
      <span className={styles.rate}>{rateLine(checkout)}</span>
    </div>
  );
}

const REJECT_TEXT: Record<string, string> = {
  WRONG_ASSET: "only USDC is accepted",
  WRONG_ISSUER: "it wasn't Circle's USDC (same name, different issuer)",
  WRONG_WALLET: "it went to a different wallet",
};

function Rejected({ checkout }: { checkout: Checkout }) {
  if (!checkout.rejectedPayments.length) return null;
  return (
    <>
      {checkout.rejectedPayments.map((p) => (
        <div key={p.txHash} className="alert alert-warn" role="alert">
          <Icon name="alert" size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            We saw a payment of {formatAmount(p.amount)} {p.asset.code} with this reference. It wasn&apos;t applied because {REJECT_TEXT[p.outcome] ?? "it didn't match this request"}.
          </span>
        </div>
      ))}
    </>
  );
}

interface Sent {
  hash: string | null;
  note: string | null;
}

function OpenView({ checkout, live, setEager }: { checkout: Checkout; live: boolean; setEager: (eager: boolean) => void }) {
  const now = useNow(1000);
  const [sheet, setSheet] = useState(false);
  const [manual, setManual] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const open = isOpen(checkout.status);
  const pastExpiry = new Date(checkout.expiresAt).getTime() <= now;
  const payable = open && !pastExpiry && checkout.canReceive;
  const biz = checkout.businessName;

  useEffect(() => setEager(sent !== null), [sent, setEager]);

  const closedMessage = (() => {
    if (checkout.status === "EXPIRED" || (open && pastExpiry)) {
      return `This request expired at ${formatTime(checkout.expiresAt)}. Don't send a payment. Ask ${biz} for a new link.`;
    }
    if (checkout.status === "CANCELLED") return `${biz} cancelled this request. Don't send a payment.`;
    if (checkout.status === "FAILED") return "This request can't be paid any more (the test network was reset). Ask for a new link.";
    if (!checkout.canReceive) return `${biz}'s wallet can't receive USDC right now. Please contact them.`;
    return null;
  })();

  return (
    <div className={styles.card}>
      <MerchantHeader checkout={checkout} />
      <Rejected checkout={checkout} />
      <Amounts checkout={checkout} />

      {closedMessage ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="alert" role="alert">
            <Icon name="alert" size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{closedMessage}</span>
          </div>
          {!open && isPositive(checkout.usdcReceived) && (
            <div className="alert alert-info">
              {formatAmount(checkout.usdcReceived)} USDC was received on this request. {biz} can send it back to you.
            </div>
          )}
          {checkout.supportContact && (
            <span className="hint">
              Contact {biz}: <strong>{checkout.supportContact}</strong>
            </span>
          )}
        </div>
      ) : sent ? (
        <div className={styles.sending} role="status" aria-live="polite">
          <div className="row" style={{ fontWeight: 800 }}>
            <span className="spinner" style={{ color: "var(--protea)" }} />
            Sent. Waiting for Stellar to confirm…
          </div>
          <div className={styles.bar}>
            <div className={styles.barFill} />
          </div>
          {sent.hash && (
            <span className="hint">
              tx <span className="mono">{shortHash(sent.hash)}</span> · usually under 10 seconds
            </span>
          )}
          {sent.note && <span className="hint">{sent.note}</span>}
          <span className="hint">This page updates by itself. Only a payment Stellar confirms marks it paid.</span>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <div className={styles.status}>
            <span className="row" style={{ gap: 8 }}>
              <span className={styles.statusDot} />
              Waiting for your payment
            </span>
            <span className="mono" aria-label={`Expires in ${countdown(checkout.expiresAt, now)}`}>
              {countdown(checkout.expiresAt, now)}
            </span>
          </div>
          {payable && (
            <button type="button" className={styles.payBtn} onClick={() => setSheet(true)}>
              Pay {formatAmount(checkout.usdcRemaining)} USDC with a wallet
              <span className={styles.payBtnChip}>
                <Icon name="arrowRight" size={18} stroke={2.6} />
              </span>
            </button>
          )}
          <button type="button" className={styles.manualToggle} aria-expanded={manual} aria-controls="manual-pay" onClick={() => setManual((m) => !m)}>
            Pay from any other wallet
            <Icon name={manual ? "dash" : "plus"} size={18} />
          </button>
          {manual && <ManualPay checkout={checkout} />}
          {!live && <span className="hint" style={{ textAlign: "center" }}>Reconnecting… the status stays correct.</span>}
        </div>
      )}

      {sheet && (
        <WalletSheet
          checkout={checkout}
          onClose={() => setSheet(false)}
          onManual={() => {
            setSheet(false);
            setManual(true);
          }}
          onSent={(hash, note) => {
            setSheet(false);
            setSent({ hash, note });
          }}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value, copy, mono = false, copyLabel }: { label: string; value: React.ReactNode; copy?: string; mono?: boolean; copyLabel?: string }) {
  return (
    <div className={styles.detailRow}>
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span className={styles.detailLabel}>{label}</span>
        <span className={`${styles.detailValue} ${mono ? "mono break" : ""}`}>{value}</span>
      </div>
      {copy && <CopyButton value={copy} ariaLabel={copyLabel ?? `Copy ${label.toLowerCase()}`} />}
    </div>
  );
}

/** "Or pay from any Stellar wallet" (§6.2): steps, every detail with Copy, the SEP-7 QR. */
function ManualPay({ checkout }: { checkout: Checkout }) {
  const amount = formatAmount(checkout.usdcRemaining);
  return (
    <div id="manual-pay" className={styles.manual}>
      <ol className={styles.steps}>
        <li>
          Make sure your wallet is on <strong>Stellar Testnet</strong> (test money only).
        </li>
        <li>
          Your wallet needs <strong>Testnet USDC</strong>.
          <details className={styles.disclosure} style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 13, color: "var(--protea)" }}>How do I get some?</summary>
            <span className="hint">
              Get test XLM from <a href="https://lab.stellar.org/account/fund?$=network$id=testnet" target="_blank" rel="noreferrer">Friendbot</a>, add a USDC trustline (issuer below), then get test USDC from{" "}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                Circle&apos;s faucet
              </a>{" "}
              (choose Stellar Testnet).
            </span>
          </details>
        </li>
        <li>
          Send <strong>exactly {amount} USDC</strong> to the address below.
        </li>
        <li>
          Put <strong className="mono">{checkout.reference}</strong> in the <strong>memo</strong> field. Without it we can&apos;t match your payment.
        </li>
        <li>Keep this page open. It updates by itself when Stellar confirms the payment, usually within 10 seconds.</li>
      </ol>

      <div className={styles.memo}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--sun-fg)" }}>Reference · wallets call this the memo (text)</span>
        <div className="between">
          <span className={styles.memoValue}>{checkout.reference}</span>
          <CopyButton value={checkout.reference} ariaLabel="Copy reference" />
        </div>
      </div>

      <div className={styles.detailRows}>
        <DetailRow label="Network" value="Stellar Testnet" />
        <DetailRow label="Send to" value={checkout.wallet} copy={checkout.wallet} mono copyLabel="Copy address" />
        <DetailRow label="Amount" value={`${amount} USDC`} copy={plainAmount(checkout.usdcRemaining)} copyLabel="Copy amount" />
        <DetailRow
          label="Asset"
          value={
            <>
              USDC · issuer <span className="mono" title={checkout.asset.issuer ?? undefined}>{shortAddress(checkout.asset.issuer ?? "")}</span>
            </>
          }
          copy={checkout.asset.issuer ?? undefined}
          copyLabel="Copy USDC issuer"
        />
      </div>

      <div className={styles.qr}>
        <QrCode value={checkout.sep7Uri} size={184} label="QR code with the address, amount, USDC and reference" />
        <span>Scan with a Stellar wallet that reads payment QR codes (SEP-7). Everything fills in for you.</span>
        <CopyButton value={checkout.sep7Uri} label="Copy payment link" copiedLabel="Payment link copied" className="btn btn-outline btn-sm btn-block" />
      </div>

      <details className={`${styles.disclosure} ${styles.detailRows}`} style={{ padding: "12px 14px" }}>
        <summary>
          Wallet can&apos;t add a text memo? <Icon name="plus" size={16} />
        </summary>
        <div className="stack" style={{ gap: 10 }}>
          <span className="hint">Use one of these instead. Send the same amount of USDC.</span>
          <DetailRow label="Memo ID (choose the ID memo type)" value={checkout.memoId} copy={checkout.memoId} mono copyLabel="Copy memo ID" />
          <DetailRow label="Or send here with no memo at all" value={checkout.muxedAddress} copy={checkout.muxedAddress} mono copyLabel="Copy the address that needs no memo" />
        </div>
      </details>
      {checkout.supportContact && (
        <span className="hint" style={{ textAlign: "center" }}>
          Need help? Contact {checkout.businessName}: <strong>{checkout.supportContact}</strong>
        </span>
      )}
    </div>
  );
}

function PaidView({ checkout }: { checkout: Checkout }) {
  const extra = toStroops(checkout.usdcReceived) - toStroops(checkout.usdcAmount);
  const extraText = extra > 0n ? formatAmount(fromStroops(extra)) : null;
  const title = [checkout.description, checkout.customerRef && `#${checkout.customerRef.replace(/^#/, "")}`].filter(Boolean).join(" · ") || "Payment";
  return (
    <div className={styles.paid} role="status" aria-live="polite">
      <div className="between">
        <span style={{ fontWeight: 800, fontSize: 15 }}>{checkout.businessName}</span>
        <Wordmark size={18} color="#fff" coin="#FFD13B" />
      </div>
      <div className={styles.paidHead}>
        <span className={styles.paidWord}>Paid.</span>
        <span className={styles.paidCheck}>
          <Icon name="check" size={30} stroke={3.4} style={{ color: "#fff" }} />
        </span>
      </div>
      <span style={{ fontWeight: 600 }}>Verified on Stellar Testnet. You can close this page.</span>
      <div className={styles.receipt}>
        <div className={styles.receiptRow}>
          <span className="muted">{title}</span>
          <strong>{formatZar(checkout.zarAmount)}</strong>
        </div>
        <div className={styles.receiptRow}>
          <span className="muted">Received</span>
          <strong>{formatAmount(checkout.usdcReceived)} USDC</strong>
        </div>
        {checkout.paidAt && (
          <div className={styles.receiptRow}>
            <span className="muted">Paid at</span>
            <span>{formatDateTime(checkout.paidAt)}</span>
          </div>
        )}
        {checkout.paidTxHash && (
          <div className={styles.receiptRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <span className="muted">Transaction</span>
            <span className="mono break" style={{ fontSize: 12 }}>
              {checkout.paidTxHash}
            </span>
            <div className="row wrap">
              <CopyButton value={checkout.paidTxHash} label="Copy hash" ariaLabel="Copy transaction hash" />
              <a className="btn btn-outline btn-sm" href={explorerTx(checkout.paidTxHash)} target="_blank" rel="noreferrer">
                View on stellar.expert <Icon name="external" size={14} />
              </a>
            </div>
          </div>
        )}
      </div>
      {extraText && (
        <span style={{ fontWeight: 600 }}>
          You sent {extraText} USDC more than asked. {checkout.businessName} can send the extra back.
        </span>
      )}
    </div>
  );
}
