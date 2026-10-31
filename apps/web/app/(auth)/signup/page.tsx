import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../_components/AuthForm";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
