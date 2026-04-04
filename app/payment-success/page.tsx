"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Download, X, FileText } from "lucide-react";

interface TransactionDetails {
  id: string;
  tx_ref: string;
  amount: number;
  status: string;
  created_at: string;
  course: {
    title: string;
  };
}

export default function PaymentSuccessPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [state, setState] = useState<"loading" | "success" | "failed">("loading");
  const [transaction, setTransaction] = useState<TransactionDetails | null>(null);
  const [showReceipt, setShowReceipt] = useState(true);
  const txRef = params.get("tx_ref") ?? "";
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
          // Fetch transaction details for receipt
          const { data: txData } = await supabase
            .from("transactions")
            .select("id, tx_ref, amount, status, created_at, course:courses(title)")
            .eq("id", transactionId)
            .single();
          if (txData) {
            setTransaction(txData as unknown as TransactionDetails);
          }
          return;
        }

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
  }, [loading, transactionId, txRef]);

  const handleDownloadReceipt = () => {
    window.print();
  };

  const handleClose = () => {
    setShowReceipt(false);
    router.push("/dashboard");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (state === "loading") {
    return (
      <div className="container mx-auto max-w-xl py-16">
        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Verifying your payment...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="container mx-auto max-w-xl py-16">
        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3 text-destructive">
              <XCircle className="h-5 w-5" /> Payment failed or could not be verified.
            </div>
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

  // Success state with receipt
  return (
    <div className="container mx-auto max-w-2xl py-8">
      {!showReceipt ? (
        <Card>
          <CardHeader>
            <CardTitle>Payment Successful</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3 text-success">
              <CheckCircle2 className="h-5 w-5" /> Your course has been unlocked!
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/my-learning">Start Learning</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Receipt Card - Printable */}
          <div className="print:block">
            <Card className="border-2 border-primary/20">
              <CardHeader className="bg-primary/5 border-b border-primary/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-6 w-6 text-primary" />
                    <CardTitle>Payment Receipt</CardTitle>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-success flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> PAID
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                {/* Receipt Details */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Transaction Reference</p>
                      <p className="font-medium">{transaction?.tx_ref || txRef}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Date & Time</p>
                      <p className="font-medium">
                        {transaction?.created_at ? formatDate(transaction.created_at) : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Course</p>
                      <p className="font-medium">{transaction?.course?.title || "Course Purchase"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Amount Paid</p>
                      <p className="font-medium text-lg">
                        ETB {transaction?.amount?.toFixed(2) || "0.00"}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4 mt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Payment Method</span>
                      <span className="font-medium">Chapa (ETB)</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-medium text-success">Completed</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-3 pt-4 border-t border-border print:hidden">
                  <Button onClick={handleDownloadReceipt} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" /> Download Receipt
                  </Button>
                  <Button onClick={handleClose} variant="outline" className="gap-2">
                    <X className="h-4 w-4" /> Close
                  </Button>
                  <Button asChild className="ml-auto">
                    <Link href="/dashboard">Go to Dashboard</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Instructions for user */}
          <p className="text-center text-sm text-muted-foreground mt-4 print:hidden">
            Keep this receipt for your records. Click "Download Receipt" to save as PDF.
          </p>
        </>
      )}
    </div>
  );
}
