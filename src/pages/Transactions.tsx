import { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History, Loader2, Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

const Transactions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Tables<"transactions">[]>([]);
  const [exchanges, setExchanges] = useState<Tables<"exchanges">[]>([]);
  const [coursesMap, setCoursesMap] = useState<Record<string, Tables<"courses">>>({});
  const [profilesMap, setProfilesMap] = useState<Record<string, Tables<"profiles">>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [txRes, exRes] = await Promise.all([
      supabase.from("transactions").select("*").or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order("created_at", { ascending: false }),
      supabase.from("exchanges").select("*").or(`requester_id.eq.${user.id},owner_id.eq.${user.id}`).order("created_at", { ascending: false }),
    ]);

    const allCourseIds = [
      ...(txRes.data ?? []).map((t) => t.course_id),
      ...(exRes.data ?? []).map((e) => e.requested_course_id),
      ...(exRes.data ?? []).map((e) => e.offered_course_id),
    ];
    const uniqueIds = [...new Set(allCourseIds)];
    let map: Record<string, Tables<"courses">> = {};
    let profMap: Record<string, Tables<"profiles">> = {};
    if (uniqueIds.length > 0) {
      const { data: courses } = await supabase.from("courses").select("*").in("id", uniqueIds);
      courses?.forEach((c) => { map[c.id] = c; });

      const ownerIds = [...new Set((courses ?? []).map((c) => c.user_id).filter(Boolean))];
      if (ownerIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("*").in("user_id", ownerIds);
        (profs ?? []).forEach((p) => {
          profMap[p.user_id] = p;
        });
      }
    }

    setTransactions(txRes.data ?? []);
    setExchanges(exRes.data ?? []);
    setCoursesMap(map);
    setProfilesMap(profMap);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  useEffect(() => {
    if (!user) return;

    const ownerChannel = supabase
      .channel(`exchanges-owner-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "exchanges",
          filter: `owner_id=eq.${user.id}`,
        },
        () => {
          toast({ title: "New exchange request", description: "Check the Exchanges tab to respond." });
          fetchData();
        },
      )
      .subscribe();

    const requesterChannel = supabase
      .channel(`exchanges-requester-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "exchanges",
          filter: `requester_id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as any;
          if (next?.status === "accepted") {
            toast({ title: "Exchange accepted", description: "Your exchange was accepted. Materials are now available." });
          } else if (next?.status === "rejected") {
            toast({ title: "Exchange rejected", description: "Your exchange request was rejected.", variant: "destructive" });
          }
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ownerChannel);
      supabase.removeChannel(requesterChannel);
    };
  }, [user, toast]);

  const handleExchangeAction = async (exchangeId: string, action: "accepted" | "rejected", ex?: Tables<"exchanges">) => {
    const { error } = await supabase.from("exchanges").update({ status: action }).eq("id", exchangeId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: action === "accepted" ? "Exchange accepted!" : "Exchange rejected" });
      const exchange = ex || exchanges.find((e) => e.id === exchangeId);
      if (exchange) {
        const requestedCourse = coursesMap[exchange.requested_course_id];
        const offeredCourse = coursesMap[exchange.offered_course_id];
        const requestedCourseTitle = requestedCourse?.title ?? "course";
        const offeredCourseTitle = offeredCourse?.title ?? "course";
        
        // In-app notification
        await supabase.from("notifications").insert({
          user_id: exchange.requester_id,
          title: action === "accepted" ? "Exchange accepted" : "Exchange rejected",
          body: action === "accepted" 
            ? `Your offer to exchange "${offeredCourseTitle}" for "${requestedCourseTitle}" was accepted.`
            : `Your offer to exchange "${offeredCourseTitle}" for "${requestedCourseTitle}" was rejected.`,
          type: action === "accepted" ? "success" : "warning",
          link: "/transactions",
        });

        // Email notification via API (non-blocking)
        try {
          await fetch("/api/exchanges/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exchangeId,
              requestedCourseId: exchange.requested_course_id,
              offeredCourseId: exchange.offered_course_id,
              requesterId: exchange.requester_id,
              ownerId: user?.id,
              action,
            }),
          });
        } catch (notifyErr) {
          console.error("Failed to send exchange email notification:", notifyErr);
        }
      }
      fetchData();
    }
  };

  const purchases = transactions.filter((t) => t.buyer_id === user?.id);
  const sales = transactions.filter((t) => t.seller_id === user?.id);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Transactions</h1>
          <p className="mt-1 text-muted-foreground">View your complete transaction history</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="purchases">Purchases ({purchases.length})</TabsTrigger>
              <TabsTrigger value="sales">Sales ({sales.length})</TabsTrigger>
              <TabsTrigger value="exchanges">Exchanges ({exchanges.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <Card>
                <CardContent className="p-6">
                  {transactions.length === 0 && exchanges.length === 0 ? (
                    <div className="flex flex-col items-center py-8">
                      <History className="mb-3 h-10 w-10 text-muted-foreground" />
                      <p className="text-muted-foreground">No transactions yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {transactions.map((t) => (
                        <TransactionRow
                          key={t.id}
                          t={t}
                          userId={user!.id}
                          courseId={t.course_id}
                          courseName={coursesMap[t.course_id]?.title ?? "Untitled"}
                          courseOwnerName={profilesMap[coursesMap[t.course_id]?.user_id ?? ""]?.full_name ?? ""}
                        />
                      ))}
                      {exchanges.map((ex) => (
                        <ExchangeRow
                          key={ex.id}
                          ex={ex}
                          userId={user!.id}
                          coursesMap={coursesMap}
                          profilesMap={profilesMap}
                          onAction={handleExchangeAction}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="purchases">
              <Card>
                <CardContent className="p-6">
                  {purchases.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No purchases yet</p>
                  ) : (
                    <div className="space-y-3">
                      {purchases.map((t) => (
                        <TransactionRow
                          key={t.id}
                          t={t}
                          userId={user!.id}
                          courseId={t.course_id}
                          courseName={coursesMap[t.course_id]?.title ?? "Untitled"}
                          courseOwnerName={profilesMap[coursesMap[t.course_id]?.user_id ?? ""]?.full_name ?? ""}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales">
              <Card>
                <CardContent className="p-6">
                  {sales.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No sales yet</p>
                  ) : (
                    <div className="space-y-3">
                      {sales.map((t) => (
                        <TransactionRow
                          key={t.id}
                          t={t}
                          userId={user!.id}
                          courseId={t.course_id}
                          courseName={coursesMap[t.course_id]?.title ?? "Untitled"}
                          courseOwnerName={profilesMap[coursesMap[t.course_id]?.user_id ?? ""]?.full_name ?? ""}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="exchanges">
              <Card>
                <CardContent className="p-6">
                  {exchanges.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No exchanges yet</p>
                  ) : (
                    <div className="space-y-3">
                      {exchanges.map((ex) => (
                        <ExchangeRow
                          key={ex.id}
                          ex={ex}
                          userId={user!.id}
                          coursesMap={coursesMap}
                          profilesMap={profilesMap}
                          onAction={handleExchangeAction}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
};

const TransactionRow = ({
  t,
  userId,
  courseId,
  courseName,
  courseOwnerName,
}: {
  t: Tables<"transactions">;
  userId: string;
  courseId: string;
  courseName: string;
  courseOwnerName: string;
}) => {
  const isBuyer = t.buyer_id === userId;
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div>
        <Link href={`/courses/${courseId}`} className="font-medium text-foreground hover:underline">
          {courseName}
        </Link>
        {courseOwnerName ? (
          <p className="text-xs text-muted-foreground">
            Owner:{" "}
            <Link href={`/users/${t.seller_id}`} className="hover:underline">
              {courseOwnerName}
            </Link>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {isBuyer ? "Purchased" : "Sold"} · {new Date(t.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge className={isBuyer ? "" : "bg-success text-success-foreground"}>
          {isBuyer ? "-" : "+"}ETB {Number(t.amount).toFixed(2)}
        </Badge>
      </div>
    </div>
  );
};

const ExchangeRow = ({
  ex, userId, coursesMap, onAction,
  profilesMap,
}: {
  ex: Tables<"exchanges">;
  userId: string;
  coursesMap: Record<string, Tables<"courses">>;
  profilesMap: Record<string, Tables<"profiles">>;
  onAction: (id: string, action: "accepted" | "rejected", ex?: Tables<"exchanges">) => void;
}) => {
  const isOwner = ex.owner_id === userId;
  const requestedCourseRow = coursesMap[ex.requested_course_id];
  const offeredCourseRow = coursesMap[ex.offered_course_id];
  const requestedCourse = requestedCourseRow?.title ?? "Untitled";
  const offeredCourse = offeredCourseRow?.title ?? "Untitled";
  const requestedOwnerName = requestedCourseRow?.user_id ? profilesMap[requestedCourseRow.user_id]?.full_name : "";
  const offeredOwnerName = offeredCourseRow?.user_id ? profilesMap[offeredCourseRow.user_id]?.full_name : "";

  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          {isOwner ? `"${offeredCourse}" offered for your "${requestedCourse}"` : `You offered "${offeredCourse}" for "${requestedCourse}"`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Link href={`/courses/${ex.requested_course_id}`} className="hover:underline">
            Open requested course
          </Link>
          <Link href={`/courses/${ex.offered_course_id}`} className="hover:underline">
            Open offered course
          </Link>
          {requestedOwnerName ? (
            <span>
              Requested owner:{" "}
              <Link href={`/users/${requestedCourseRow?.user_id}`} className="hover:underline">
                {requestedOwnerName}
              </Link>
            </span>
          ) : null}
          {offeredOwnerName ? (
            <span>
              Offered owner:{" "}
              <Link href={`/users/${offeredCourseRow?.user_id}`} className="hover:underline">
                {offeredOwnerName}
              </Link>
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{new Date(ex.created_at).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-2">
        {ex.status === "pending" && isOwner ? (
          <>
            <Button size="sm" variant="ghost" className="text-success" onClick={() => onAction(ex.id, "accepted", ex)}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onAction(ex.id, "rejected", ex)}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Badge variant={ex.status === "accepted" ? "default" : ex.status === "rejected" ? "destructive" : "secondary"}>
              {ex.status}
            </Badge>
          </>
        )}
      </div>
    </div>
  );
};

export default Transactions;
