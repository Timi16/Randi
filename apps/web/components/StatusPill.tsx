import { PAYMENT_OUTCOME, REQUEST_STATUS, type IconName } from "@/lib/status";
import type { PaymentOutcome, RequestStatus } from "@/lib/types";
import { Icon, type IconKey } from "./Icon";

const ICONS: Record<IconName, IconKey> = { check: "check", clock: "clock", alert: "alert", cross: "cross", dash: "dash", half: "half" };

/** Status is never colour alone: always an icon and a word. */
export function StatusPill({ status }: { status: RequestStatus }) {
  const spec = REQUEST_STATUS[status];
  return (
    <span className={`pill tone-${spec.tone}`}>
      <Icon name={ICONS[spec.icon]} size={13} stroke={2.6} />
      {spec.label}
    </span>
  );
}

export function OutcomePill({ outcome }: { outcome: PaymentOutcome }) {
  const spec = PAYMENT_OUTCOME[outcome];
  return (
    <span className={`pill tone-${spec.tone}`} title={spec.explain}>
      <Icon name={ICONS[spec.icon]} size={13} stroke={2.6} />
      {spec.label}
    </span>
  );
}
