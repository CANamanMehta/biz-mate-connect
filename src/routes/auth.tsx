import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | AOM CRM" },
      { name: "description", content: "Secure sign in for A O Mittal & Associates LLP's internal CRM." },
      { property: "og:title", content: "Sign in | AOM CRM" },
      { property: "og:description", content: "Secure access to the AOM business development workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    if (isResetMode) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setIsSubmitting(false);
      if (resetError) setError(resetError.message);
      else setMessage("Check your email for a secure password reset link.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setIsSubmitting(false);
      setError("The email or password is incorrect, or this account has not been invited.");
      return;
    }

    const { error: linkError } = await supabase.rpc("link_current_partner");
    if (linkError) {
      await supabase.auth.signOut();
      setIsSubmitting(false);
      setError("No active AOM partner invitation matches this email. Contact an administrator.");
      return;
    }

    await navigate({ to: "/dashboard", replace: true });
  }

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-primary px-14 py-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-y-0 right-0 w-px bg-primary-foreground/15" />
        <div className="relative flex items-center gap-4">
          <div className="flex size-12 items-center justify-center border border-primary-foreground/25 font-display text-xl font-semibold">AOM</div>
          <div>
            <p className="font-display text-lg font-semibold">AOM CRM</p>
            <p className="text-xs text-primary-foreground/65">Business development workspace</p>
          </div>
        </div>

        <div className="relative max-w-xl pb-10">
          <div className="mb-7 h-1 w-14 bg-accent" />
          <h1 className="font-display text-5xl font-semibold leading-tight">Relationships built with clarity.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-primary-foreground/70">
            A secure workspace for opportunities, client relationships, meetings, and shared growth across AOM.
          </p>
        </div>

        <p className="relative text-xs text-primary-foreground/50">Internal and confidential</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex size-11 items-center justify-center bg-primary font-display text-sm font-semibold text-primary-foreground">AOM</div>
            <div>
              <p className="font-display font-semibold text-primary">AOM CRM</p>
              <p className="text-xs text-muted-foreground">A O Mittal & Associates LLP</p>
            </div>
          </div>

          <div className="mb-8">
            <p className="mb-3 text-xs font-semibold uppercase text-accent">A O Mittal &amp; Associates LLP</p>
            <h2 className="font-display text-3xl font-semibold text-primary">
              {isResetMode ? "Reset your password" : "Welcome back"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isResetMode
                ? "Enter your invited email address to receive a reset link."
                : "Sign in with your invited AOM account."}
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 pl-10" placeholder="name@aomllp.com" required />
              </div>
            </div>

            {!isResetMode && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Button type="button" variant="link" className="h-auto p-0 text-xs text-accent" onClick={() => { setIsResetMode(true); setError(""); setMessage(""); }}>
                    Forgot password?
                  </Button>
                </div>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 px-10" required />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
            )}

            {error && <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
            {message && <p role="status" className="border-l-2 border-accent bg-accent/5 px-3 py-2 text-sm text-foreground">{message}</p>}

            <Button type="submit" className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isSubmitting}>
              {isSubmitting ? "Please wait…" : isResetMode ? "Send reset link" : "Sign in"}
              {!isSubmitting && <ArrowRight aria-hidden="true" />}
            </Button>

            {isResetMode && (
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setIsResetMode(false); setError(""); setMessage(""); }}>
                Back to sign in
              </Button>
            )}
          </form>

          <p className="mt-9 border-t border-border pt-5 text-center text-xs leading-5 text-muted-foreground">
            Access is invitation-only. Contact an AOM administrator if you need an account.
          </p>
        </div>
      </section>
    </main>
  );
}