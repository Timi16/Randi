import type { Metadata } from "next";
import { PayClient } from "./_components/PayClient";

export const metadata: Metadata = { title: "Pay", robots: { index: false } };

export default async function PayPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <PayClient requestId={requestId} />;
}
