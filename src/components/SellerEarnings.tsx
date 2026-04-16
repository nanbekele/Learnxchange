"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Wallet, Clock, CheckCircle, DollarSign, User, AlertCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface EarningsSummary {
  pending: number;
  available: number;
  totalEarned: number;
  requested: number;
  paid: number;
}

export default function SellerEarnings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{ full_name: string | null; email: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<{ method: string; account_name: string; account_number: string } | null>(null);
  const [earnings, setEarnings] = useState<Tables<"seller_earnings">[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<Tables<"payout_requests">[]>([]);
  const [summary, setSummary] = useState<EarningsSummary>({
    pending: 0,
    available: 0,
    totalEarned: 0,
    requested: 0,
    paid: 0,
  });

  const fetchEarnings = async () => {
    setLoading(true);
    try {
      const { data: earningsData, error: earningsError } = await supabase
        .from("seller_earnings")
        .select("*")
        .eq("seller_id", user!.id)
        .order("created_at", { ascending: false });

      if (earningsError) throw earningsError;

      const { data: payoutData, error: payoutError } = await supabase
        .from("payout_requests")
        .select("*")
        .eq("seller_id", user!.id)
        .order("requested_at", { ascending: false });

      if (payoutError) throw payoutError;

      setEarnings(earningsData || []);
      setPayoutRequests(payoutData || []);

      // Calculate summary
      const now = new Date().toISOString();
      const summary = (earningsData || []).reduce(
        (acc, e) => {
          const amount = Number(e.amount);
          acc.totalEarned += amount;

          if (e.status === "pending") {
            if (e.available_at <= now) {
              acc.available += amount;
            } else {
              acc.pending += amount;
            }
          } else if (e.status === "requested") {
            acc.requested += amount;
          } else if (e.status === "paid") {
            acc.paid += amount;
          }
          return acc;
        },
        { pending: 0, available: 0, totalEarned: 0, requested: 0, paid: 0 }
      );

      setSummary(summary);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchEarnings();
  }, [user]);

  const openVerifyDialog = async () => {
    if (!user) return;
    setRequesting(true);
    try {
      // Fetch user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, user_id")
        .eq("user_id", user.id)
        .single();

      // Fetch payment method
      const { data: payment } = await supabase
        .from("user_payment_methods")
        .select("method, account_name, account_number")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      setUserProfile({ full_name: profile?.full_name ?? null, email: user.email ?? "" });
      setPaymentMethod(payment ?? null);
      setVerifyDialogOpen(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!user) return;
    setRequesting(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/payouts/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to request payout");
      }

      toast({
        title: "Withdrawal Requested",
        description: json.message || `Requested ETB ${json.amount?.toFixed(2)}`,
      });
      setVerifyDialogOpen(false);
      fetchEarnings();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-muted p-2 text-primary">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Available to Withdraw</p>
              <p className="font-display text-lg font-bold text-foreground">
                ETB {summary.available.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-muted p-2 text-warning">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="font-display text-lg font-bold text-foreground">
                ETB {summary.pending.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-muted p-2 text-accent">
              <DollarSign className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Requested</p>
              <p className="font-display text-lg font-bold text-foreground">
                ETB {summary.requested.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-muted p-2 text-success">
              <CheckCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Paid Out</p>
              <p className="font-display text-lg font-bold text-foreground">
                ETB {summary.paid.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Withdraw Button */}
      {summary.available > 0 && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-foreground">ETB {summary.available.toFixed(2)} available to withdraw</p>
              <p className="text-xs text-muted-foreground">
                Funds will be transferred to your default payment method
              </p>
            </div>
            <Button onClick={openVerifyDialog} disabled={requesting} className="gap-2">
              {requesting && <Loader2 className="h-4 w-4 animate-spin" />}
              Withdraw Funds
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Earnings History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Earnings History</CardTitle>
        </CardHeader>
        <CardContent>
          {earnings.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No earnings yet</p>
          ) : (
            <div className="space-y-2">
              {earnings.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      ETB {Number(e.amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.status === "pending" && e.available_at > new Date().toISOString()
                        ? `Available ${new Date(e.available_at).toLocaleDateString()}`
                        : `Earned ${new Date(e.created_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge
                    variant={
                      e.status === "paid"
                        ? "default"
                        : e.status === "requested"
                        ? "secondary"
                        : e.available_at <= new Date().toISOString()
                        ? "outline"
                        : "secondary"
                    }
                  >
                    {e.status === "pending" && e.available_at <= new Date().toISOString()
                      ? "available"
                      : e.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payout Requests */}
      {payoutRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Withdrawal Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {payoutRequests.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      ETB {Number(p.amount).toFixed(2)} via {p.method}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.account_name} · {p.account_number} · Requested{" "}
                      {new Date(p.requested_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant={
                      p.status === "paid"
                        ? "default"
                        : p.status === "rejected"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {p.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Withdrawal Verification Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Verify Your Information
            </DialogTitle>
            <DialogDescription>
              Please confirm your details before requesting withdrawal. This information will be used for the payout.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Profile Info */}
            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
              <h4 className="text-sm font-medium text-foreground">Profile Information</h4>
              <div className="grid gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Full Name</Label>
                  <p className="text-sm font-medium text-foreground">
                    {userProfile?.full_name || <span className="text-destructive italic">Not set</span>}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="text-sm font-medium text-foreground">{userProfile?.email}</p>
                </div>
              </div>
              {!userProfile?.full_name && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Please set your full name in your profile
                </p>
              )}
            </div>

            {/* Payment Method */}
            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
              <h4 className="text-sm font-medium text-foreground">Payment Method</h4>
              {paymentMethod ? (
                <div className="grid gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Method</Label>
                    <p className="text-sm font-medium text-foreground capitalize">{paymentMethod.method}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Account Name</Label>
                    <p className="text-sm font-medium text-foreground">{paymentMethod.account_name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Account Number</Label>
                    <p className="text-sm font-medium text-foreground">{paymentMethod.account_number}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-sm text-destructive flex items-center justify-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    No payment method set up
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Please add a Telebirr account in your profile first
                  </p>
                </div>
              )}
            </div>

            {/* Withdrawal Amount */}
            <div className="rounded-lg border border-success/30 bg-success/5 p-4">
              <Label className="text-xs text-muted-foreground">Amount to Withdraw</Label>
              <p className="text-lg font-bold text-success">ETB {summary.available.toFixed(2)}</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRequestPayout}
              disabled={requesting || !paymentMethod || !userProfile?.full_name}
              className="gap-2"
            >
              {requesting && <Loader2 className="h-4 w-4 animate-spin" />}
              {!paymentMethod
                ? "Add Payment Method"
                : !userProfile?.full_name
                ? "Update Profile"
                : "Confirm Withdrawal"}
            </Button>
          </DialogFooter>

          {(!paymentMethod || !userProfile?.full_name) && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              <a href="/profile" className="text-primary hover:underline">
                Go to Profile to complete your information →
              </a>
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
