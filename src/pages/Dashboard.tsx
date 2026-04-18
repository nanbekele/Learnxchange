import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

interface CourseWithDetails extends Tables<"courses"> {}
interface BuyerDetails { full_name: string | null; email: string | null; }

const Dashboard = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const displayName = user?.user_metadata?.full_name || "User";

  const [bought, setBought] = useState<(Tables<"transactions"> & { course?: CourseWithDetails })[]>([]);
  const [sold, setSold] = useState<(Tables<"transactions"> & { course?: CourseWithDetails; buyer?: BuyerDetails })[]>([]);
  const [exchanges, setExchanges] = useState<Tables<"exchanges">[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [earningsPending, setEarningsPending] = useState(0);
  const [earningsAvailable, setEarningsAvailable] = useState(0);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    const fetchRecommended = async () => {
      if (!user) {
        setRecommended([]);
        return;
      }

      setRecLoading(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) {
          setRecommended([]);
          return;
        }

        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ user_id: user.id }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setRecommended([]);
          return;
        }

        setRecommended(Array.isArray(json?.courses) ? json.courses : []);
      } finally {
        setRecLoading(false);
      }
    };

    fetchRecommended();
  }, [user?.id]);

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

      // Set base lists immediately so the dashboard renders fast.
      // Course/profile enrichment happens in the background.
      setBought((boughtRes.data ?? []).map((t) => ({ ...t })) as any);
      setSold((soldRes.data ?? []).map((t) => ({ ...t })) as any);
      setExchanges(exchRes.data ?? []);
      setLoading(false);

      // Fetch course and buyer details for transactions (background enrichment)
      const allCourseIds = [
        ...(boughtRes.data ?? []).map((t) => t.course_id),
        ...(soldRes.data ?? []).map((t) => t.course_id),
      ];
      const allBuyerIds = [
        ...(soldRes.data ?? []).map((t) => t.buyer_id),
      ];
      const uniqueIds = Array.from(new Set(allCourseIds.filter(Boolean).map(String)));
      const uniqueBuyerIds = Array.from(new Set(allBuyerIds.filter(Boolean).map(String)));

      const [coursesRes, buyersRes] = await Promise.all([
        uniqueIds.length > 0
          ? supabase.from("courses").select("*").in("id", uniqueIds)
          : Promise.resolve({ data: [] as any[] } as any),
        uniqueBuyerIds.length > 0
          ? supabase.from("profiles").select("user_id, full_name, email").in("user_id", uniqueBuyerIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      const coursesMap: Record<string, CourseWithDetails> = {};
      ((coursesRes as any)?.data ?? []).forEach((c: any) => {
        if (c?.id) coursesMap[String(c.id)] = c;
      });

      const buyersMap: Record<string, { full_name: string | null; email: string | null }> = {};
      ((buyersRes as any)?.data ?? []).forEach((b: any) => {
        if (b?.user_id) buyersMap[String(b.user_id)] = b;
      });

      setBought((boughtRes.data ?? []).map((t) => ({ ...t, course: coursesMap[String(t.course_id)] })));
      setSold((soldRes.data ?? []).map((t) => ({
        ...t,
        course: coursesMap[String(t.course_id)],
        buyer: buyersMap[String(t.buyer_id)],
      })));
    };
    load();
  }, [user]);

  const totalEarnings = sold
    .filter((t) => t.status === "completed")
    .reduce((sum, t) => sum + Number(t.seller_amount ?? 0), 0);

  const analytics = (() => {
    const DAYS = 14;
    const dayMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    const start = new Date(today.getTime() - (DAYS - 1) * dayMs);

    const toDayKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };
    const dayLabel = (key: string) => {
      const [y, m, d] = key.split("-").map((x) => Number(x));
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
    };

    const days: {
      key: string;
      label: string;
      boughtCount: number;
      soldCount: number;
      spent: number;
      earned: number;
    }[] = [];

    for (let i = 0; i < DAYS; i++) {
      const dt = new Date(start.getTime() + i * dayMs);
      const key = toDayKey(dt);
      days.push({ key, label: dayLabel(key), boughtCount: 0, soldCount: 0, spent: 0, earned: 0 });
    }

    const byKey: Record<string, (typeof days)[number]> = {};
    days.forEach((d) => {
      byKey[d.key] = d;
    });

    bought.forEach((t) => {
      if (!t.created_at) return;
      const key = toDayKey(new Date(String(t.created_at)));
      const b = byKey[key];
      if (!b) return;
      b.boughtCount += 1;
      b.spent += Number(t.amount ?? 0);
    });

    sold.forEach((t) => {
      if (!t.created_at) return;
      const key = toDayKey(new Date(String(t.created_at)));
      const b = byKey[key];
      if (!b) return;
      b.soldCount += 1;
      b.earned += Number(t.seller_amount ?? 0);
    });

    const activityBreakdown = [
      { name: "Bought", value: bought.length },
      { name: "Sold", value: sold.length },
      { name: "Exchanged", value: exchanges.length },
    ].filter((x) => x.value > 0);

    return {
      days,
      activityBreakdown,
      totals: {
        spent: bought.reduce((s, t) => s + Number(t.amount ?? 0), 0),
        earned: sold.reduce((s, t) => s + Number(t.seller_amount ?? 0), 0),
      },
    };
  })();

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
          <Tabs defaultValue="analytics" className="space-y-4">
            <TabsList>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="bought">Bought ({bought.length})</TabsTrigger>
              <TabsTrigger value="sold">Sold ({sold.length})</TabsTrigger>
              <TabsTrigger value="exchanged">Exchanged ({exchanges.length})</TabsTrigger>
              <TabsTrigger value="earnings">Earnings</TabsTrigger>
            </TabsList>
            <TabsContent value="analytics">
              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recommended for You</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {recLoading ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="h-44 rounded-xl border border-border/50 bg-muted/30" />
                        ))}
                      </div>
                    ) : recommended.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Recommendations will improve as you browse and purchase courses.
                      </p>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {recommended.map((course: any) => (
                          <Card
                            key={course.id}
                            className="cursor-pointer overflow-hidden border-border/50 transition-shadow hover:shadow-lg"
                            onClick={() => router.push(`/courses/${course.id}`)}
                          >
                            {course.thumbnail_url && (
                              <div className="aspect-video w-full overflow-hidden bg-muted">
                                <img src={course.thumbnail_url} alt={course.title} className="h-full w-full object-cover" />
                              </div>
                            )}
                            <CardContent className="p-5">
                              <div className="mb-2 flex items-center gap-2">
                                {course.category && <Badge variant="secondary" className="text-xs">{course.category}</Badge>}
                                {course.availability && (
                                  <Badge variant="outline" className="text-xs">
                                    {course.availability === "sale" ? "For Sale" : course.availability === "exchange" ? "For Exchange" : "Sale & Exchange"}
                                  </Badge>
                                )}
                              </div>
                              <h3 className="font-display text-lg font-semibold text-foreground line-clamp-1">{course.title}</h3>
                              {Number(course.price ?? 0) > 0 && (
                                <p className="mt-2 font-display text-xl font-bold text-primary">ETB {Number(course.price).toFixed(2)}</p>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Purchases & Sales (Last 14 Days)</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        Spent: ETB {analytics.totals.spent.toFixed(2)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      className="h-[260px] w-full"
                      config={{
                        boughtCount: { label: "Bought", color: "hsl(var(--primary))" },
                        soldCount: { label: "Sold", color: "hsl(var(--accent))" },
                      }}
                    >
                      <LineChart data={analytics.days} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} width={36} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Line type="monotone" dataKey="boughtCount" stroke="var(--color-boughtCount)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="soldCount" stroke="var(--color-soldCount)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Spent vs Earned (Last 14 Days)</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        Earned: ETB {analytics.totals.earned.toFixed(2)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      className="h-[260px] w-full"
                      config={{
                        spent: { label: "Spent", color: "hsl(var(--warning))" },
                        earned: { label: "Earned", color: "hsl(var(--success))" },
                      }}
                    >
                      <BarChart data={analytics.days} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis width={52} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar dataKey="spent" fill="var(--color-spent)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="earned" fill="var(--color-earned)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Activity Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.activityBreakdown.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No activity yet.</p>
                    ) : (
                      <ChartContainer
                        className="h-[260px] w-full"
                        config={{
                          Bought: { label: "Bought", color: "hsl(var(--primary))" },
                          Sold: { label: "Sold", color: "hsl(var(--accent))" },
                          Exchanged: { label: "Exchanged", color: "hsl(var(--warning))" },
                        }}
                      >
                        <PieChart>
                          <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                          <Pie
                            data={analytics.activityBreakdown}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={60}
                            outerRadius={92}
                            strokeWidth={1}
                          >
                            {analytics.activityBreakdown.map((d, i) => {
                              const key = String(d.name);
                              const colorVar = `--color-${key}`;
                              return <Cell key={`${key}-${i}`} fill={`var(${colorVar}, hsl(var(--primary)))`} />;
                            })}
                          </Pie>
                          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                        </PieChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
                </div>
              </div>
            </TabsContent>
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
