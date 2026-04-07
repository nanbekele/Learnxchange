import { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Upload, Repeat, DollarSign, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import SellerEarnings from "@/components/SellerEarnings";

interface CourseWithDetails extends Tables<"courses"> {}
interface BuyerDetails { full_name: string | null; email: string | null; }

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const displayName = user?.user_metadata?.full_name || "User";

  const [bought, setBought] = useState<(Tables<"transactions"> & { course?: CourseWithDetails })[]>([]);
  const [sold, setSold] = useState<(Tables<"transactions"> & { course?: CourseWithDetails; buyer?: BuyerDetails })[]>([]);
  const [exchanges, setExchanges] = useState<Tables<"exchanges">[]>([]);
  const [loading, setLoading] = useState(true);
  const [earningsPending, setEarningsPending] = useState(0);
  const [earningsAvailable, setEarningsAvailable] = useState(0);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [boughtRes, soldRes, exchRes] = await Promise.all([
        supabase.from("transactions").select("*").eq("buyer_id", user.id),
        supabase.from("transactions").select("*").eq("seller_id", user.id),
        supabase.from("exchanges").select("*").or(`requester_id.eq.${user.id},owner_id.eq.${user.id}`).eq("status", "accepted"),
      ]);

      const { data: earnings } = await supabase
        .from("seller_earnings")
        .select("amount, status, available_at")
        .eq("seller_id", user.id);

      const now = Date.now();
      const pending = (earnings ?? [])
        .filter((e) => String(e.status) === "pending")
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const available = (earnings ?? [])
        .filter((e) => String(e.status) === "pending" && new Date(String(e.available_at)).getTime() <= now)
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);

      setEarningsPending(pending);
      setEarningsAvailable(available);

      // Fetch course and buyer details for transactions
      const allCourseIds = [
        ...(boughtRes.data ?? []).map((t) => t.course_id),
        ...(soldRes.data ?? []).map((t) => t.course_id),
      ];
      const allBuyerIds = [
        ...(soldRes.data ?? []).map((t) => t.buyer_id),
      ];
      const uniqueIds = [...new Set(allCourseIds)];
      const uniqueBuyerIds = [...new Set(allBuyerIds)];
      let coursesMap: Record<string, CourseWithDetails> = {};
      let buyersMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (uniqueIds.length > 0) {
        const { data: courses } = await supabase.from("courses").select("*").in("id", uniqueIds);
        courses?.forEach((c) => { coursesMap[c.id] = c; });
      }
      if (uniqueBuyerIds.length > 0) {
        const { data: buyers } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", uniqueBuyerIds);
        buyers?.forEach((b) => { buyersMap[b.user_id] = b; });
      }

      setBought((boughtRes.data ?? []).map((t) => ({ ...t, course: coursesMap[t.course_id] })));
      setSold((soldRes.data ?? []).map((t) => ({ ...t, course: coursesMap[t.course_id], buyer: buyersMap[t.buyer_id] })));
      setExchanges(exchRes.data ?? []);
      setLoading(false);
    };
    load();
  }, [user]);

  const totalEarnings = sold.reduce((sum, t) => sum + Number(t.seller_amount ?? 0), 0);

  const requestWithdrawal = async () => {
    if (!user) return;
    setWithdrawing(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      let token = sessionRes.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token;
      }
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
        throw new Error(String(json?.error ?? "Failed to request withdrawal"));
      }

      toast({ title: "Withdrawal requested", description: json?.message });
      // Refresh balances
      const { data: earnings } = await supabase
        .from("seller_earnings")
        .select("amount, status, available_at")
        .eq("seller_id", user.id);
      const now = Date.now();
      const pending = (earnings ?? [])
        .filter((e) => String(e.status) === "pending")
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const available = (earnings ?? [])
        .filter((e) => String(e.status) === "pending" && new Date(String(e.available_at)).getTime() <= now)
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);
      setEarningsPending(pending);
      setEarningsAvailable(available);
    } catch (err: any) {
      toast({ title: "Withdrawal failed", description: err.message, variant: "destructive" });
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Welcome back, {displayName}</h1>
          <p className="mt-1 text-muted-foreground">Here's an overview of your learning activity</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Bought", value: String(bought.length), icon: ShoppingCart, color: "text-primary" },
            { label: "Sold", value: String(sold.length), icon: Upload, color: "text-accent" },
            { label: "Exchanged", value: String(exchanges.length), icon: Repeat, color: "text-warning" },
            { label: "Earnings", value: `ETB ${totalEarnings.toFixed(2)}`, icon: DollarSign, color: "text-success" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl bg-muted p-3 ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="font-display text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Earnings balances */}
        {user ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Seller Earnings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <div className="text-sm text-muted-foreground">Pending (includes hold)</div>
                <div className="font-display text-2xl font-bold text-foreground">ETB {Number(earningsPending).toFixed(2)}</div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm text-muted-foreground">Available to withdraw</div>
                <div className="font-display text-2xl font-bold text-foreground">ETB {Number(earningsAvailable).toFixed(2)}</div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={requestWithdrawal}
                  disabled={withdrawing || earningsAvailable <= 0}
                >
                  {withdrawing ? "Requesting…" : "Request Withdrawal"}
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/profile">Add Telebirr number</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <Tabs defaultValue="bought" className="space-y-4">
            <TabsList>
              <TabsTrigger value="bought">Bought ({bought.length})</TabsTrigger>
              <TabsTrigger value="sold">Sold ({sold.length})</TabsTrigger>
              <TabsTrigger value="exchanged">Exchanged ({exchanges.length})</TabsTrigger>
              <TabsTrigger value="earnings">Earnings</TabsTrigger>
            </TabsList>
            <TabsContent value="bought">
              <Card>
                <CardHeader><CardTitle className="text-lg">Purchased Courses</CardTitle></CardHeader>
                <CardContent>
                  {bought.length === 0 ? (
                    <p className="text-muted-foreground">No purchases yet. <Link href="/courses" className="text-primary hover:underline">Browse courses</Link></p>
                  ) : (
                    <div className="space-y-3">
                      {bought.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                          <div>
                            <p className="font-medium text-foreground">{t.course?.title ?? "Untitled"}</p>
                            <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                          </div>
                          <Badge variant="secondary">ETB {Number(t.amount).toFixed(2)}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="sold">
              <Card>
                <CardHeader><CardTitle className="text-lg">Sold Courses</CardTitle></CardHeader>
                <CardContent>
                  {sold.length === 0 ? (
                    <p className="text-muted-foreground">No sales yet. <Link href="/courses/create" className="text-primary hover:underline">Create a course</Link></p>
                  ) : (
                    <div className="space-y-3">
                      {sold.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                          <div>
                            <p className="font-medium text-foreground">{t.course?.title ?? "Untitled"}</p>
                            <p className="text-xs text-muted-foreground">
                              Bought by: <span className="text-foreground/80">{t.buyer?.full_name || t.buyer?.email || "Unknown"}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                          </div>
                          <Badge className="bg-success text-success-foreground">ETB {Number(t.seller_amount ?? t.amount).toFixed(2)}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="exchanged">
              <Card>
                <CardHeader><CardTitle className="text-lg">Exchanged Courses</CardTitle></CardHeader>
                <CardContent>
                  {exchanges.length === 0 ? (
                    <p className="text-muted-foreground">No exchanges yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {exchanges.map((ex) => (
                        <div key={ex.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">Exchange completed</p>
                            <p className="text-xs text-muted-foreground">{new Date(ex.created_at).toLocaleDateString()}</p>
                          </div>
                          <Badge variant="outline">Accepted</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="earnings">
              <SellerEarnings />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
};

export default Dashboard;
