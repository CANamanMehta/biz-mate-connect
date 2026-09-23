import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password | AOM CRM" },
      { name: "description", content: "Set a new password for your AOM CRM account." },
      { property: "og:title", content: "Reset password | AOM CRM" },
      { property: "og:description", content: "Secure AOM CRM password recovery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const isRecoveryLink =
      window.location.hash.includes("type=recovery") ||
      window.location.hash.includes("type=invite") ||
      window.location.search.includes("type=recovery") ||
      window.location.search.includes("type=invite");
    void supabase.auth.getSession().then(({ data }) => {
      setHasRecoverySession(Boolean(data.session) && isRecoveryLink);
      setIsChecking(false);
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);
    if (updateError) setError(updateError.message);
    else setComplete(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-5 py-10">
      <section className="w-full max-w-md border border-border bg-background p-7 shadow-sm sm:p-9">
        <div className="mb-8 flex size-12 items-center justify-center bg-primary text-primary-foreground">
          {complete ? <CheckCircle2 aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
        </div>
        <p className="mb-2 text-xs font-semibold uppercase text-accent">AOM CRM</p>
        <h1 className="font-display text-3xl font-semibold text-primary">{complete ? "Password updated" : "Choose a new password"}</h1>

        {complete ? (
          <div className="mt-6">
            <p className="text-sm leading-6 text-muted-foreground">Your password is ready. Return to sign in to continue.</p>
            <Button className="mt-6 w-full" onClick={() => void navigate({ to: "/auth", replace: true })}>Return to sign in</Button>
          </div>
        ) : isChecking ? (
          <p className="mt-5 text-sm text-muted-foreground">Checking your secure link…</p>
        ) : !hasRecoverySession ? (
          <div className="mt-5">
            <p role="alert" className="text-sm leading-6 text-destructive">This reset link is invalid or has expired.</p>
            <Button variant="outline" className="mt-6 w-full" onClick={() => void navigate({ to: "/auth", replace: true })}>Request another link</Button>
          </div>
        ) : (
          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-11" required />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isSubmitting}>{isSubmitting ? "Updating…" : "Update password"}</Button>
          </form>
        )}
      </section>
    </main>
  );
}