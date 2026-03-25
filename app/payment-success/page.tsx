"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function PaymentSuccessPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [state, setState] = useState<"loading" | "success" | "failed">("loading");
  const txRef = params.get("tx_ref") ?? "";
  // Some providers incorrectly HTML-encode '&' as '&amp;' in the returned URL.
  const transactionId = params.get("transaction_id") ?? params.get("amp;transaction_id") ?? "";

  useEffect(() => {
    const run = async () => {
      // Wait for AuthContext hydration; otherwise we may redirect to /login even though a session exists.
      if (loading) return;

      if (!txRef || !transactionId) {
        setState("failed");
        return;
      }

      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) {
        // Session missing (or expired). Don't immediately redirect; show failed state.
        setState("failed");
        return;
      }

      for (let attempt = 0; attempt < 8; attempt++) {
        const res = await fetch("/api/chapa/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ txRef, transactionId }),
        });

        if (res.ok) {
          setState("success");
          return;
        }

        // 202 = still processing on Chapa side, wait and retry.
        if (res.status === 202) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        setState("failed");
        return;
      }

      setState("failed");
    };

    run();
  }, [loading, router, transactionId, txRef, user]);

  return (
    <div className="container mx-auto max-w-xl py-16">
      <Card>
        <CardHeader>
          <CardTitle>Payment Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {state === "loading" ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Verifying your payment...
            </div>
          ) : state === "success" ? (
            <div className="flex items-center gap-3 text-success">
              <CheckCircle2 className="h-5 w-5" /> Payment verified. Course unlocked.
            </div>
          ) : (
            <div className="flex items-center gap-3 text-destructive">
              <XCircle className="h-5 w-5" /> Payment failed or could not be verified.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/courses">Browse Courses</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
