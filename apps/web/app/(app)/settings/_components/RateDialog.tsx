"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Dialog } from "@/components/Dialog";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/session";
import type { PricingSettings } from "@/lib/types";
import { RateInput } from "./RateInput";

/** Set the fixed rate and make it the default way new requests are priced. */
export function RateDialog({ onClose }: { onClose: () => void }) {
  const { merchant } = useMe();
  const { mutate } = useSWRConfig();
  const [rate, setRate] = useState(merchant?.pricing.fixedRate?.replace(/0+$/, "").replace(/\.$/, "") ?? "18.50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put<{ pricing: PricingSettings }>("/v1/pricing", { fixedRate: rate.trim(), defaultMode: "FIXED_RATE" });
      await mutate("/auth/me");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Set your rate" onClose={onClose} subtitle="Your own number. Randi never looks up exchange rates.">
      <RateInput value={rate} onChange={setRate} />
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={save} disabled={busy}>
        {busy && <span className="spinner" />} Save rate
      </button>
    </Dialog>
  );
}
