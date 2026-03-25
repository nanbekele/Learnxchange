import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { History, Loader2, Check, X, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const METHODS_MAP: Record<string, string> = {
  telebirr: "Telebirr",
  ebirr: "eBirr",
  paypal: "PayPal",
  bank: "Direct Bank Transfer",
};

interface PaymentInfo {
  method: string;
  account_name: string;
  account_number: string;
}

const Transactions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Tables<"transactions">[]>([]);
  const [exchanges, setExchanges] = useState<Tables<"exchanges">[]>([]);
  const [coursesMap, setCoursesMap] = useState<Record<string, Tables<"courses">>>({});
  const [profilesMap, setProfilesMap] = useState<Record<string, Tables<"profiles">>>({});
  const [loading, setLoading] = useState(true);
  const [ratedTransactionIds, setRatedTransactionIds] = useState<Record<string, boolean>>({});
  const [ratedExchangeIds, setRatedExchangeIds] = useState<Record<string, boolean>>({});
  // Seller payment detail dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSellerName, setPaymentSellerName] = useState("");

  // Rating dialog
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingScore, setRatingScore] = useState("5");
  const [ratingComment, setRatingComment] = useState("");
  const [ratingTarget, setRatingTarget] = useState<
    | { type: "transaction"; id: string; ratedId: string; ratedName: string }
    | { type: "exchange"; id: string; ratedId: string; ratedName: string }
    | null
  >(null);

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

  const transactionIds = useMemo(() => transactions.map((t) => t.id), [transactions]);
  const exchangeIds = useMemo(() => exchanges.map((e) => e.id), [exchanges]);

  const fetchMyRatings = async () => {
    if (!user) return;

    const txIds = transactionIds;
    const exIds = exchangeIds;

    const [txRatingsRes, exRatingsRes] = await Promise.all([
      txIds.length > 0
        ? supabase.from("ratings").select("transaction_id").eq("rater_id", user.id).in("transaction_id", txIds)
        : Promise.resolve({ data: [] as any[] } as any),
      exIds.length > 0
        ? supabase.from("ratings").select("exchange_id").eq("rater_id", user.id).in("exchange_id", exIds)
        : Promise.resolve({ data: [] as any[] } as any),
    ]);

    const txMap: Record<string, boolean> = {};
    (txRatingsRes.data ?? []).forEach((r: any) => {
      if (r.transaction_id) txMap[r.transaction_id] = true;
    });
    const exMap: Record<string, boolean> = {};
    (exRatingsRes.data ?? []).forEach((r: any) => {
      if (r.exchange_id) exMap[r.exchange_id] = true;
    });

    setRatedTransactionIds(txMap);
    setRatedExchangeIds(exMap);
  };

  useEffect(() => {
    if (!user) return;
    fetchMyRatings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, transactionIds.join(","), exchangeIds.join(",")]);

  const handleExchangeAction = async (exchangeId: string, action: "accepted" | "rejected") => {
    const { error } = await supabase.from("exchanges").update({ status: action }).eq("id", exchangeId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: action === "accepted" ? "Exchange accepted!" : "Exchange rejected" });
      fetchData();
    }
  };

  const showSellerPayment = async (sellerId: string) => {
    setPaymentLoading(true);
    setPaymentDialogOpen(true);
    setPaymentInfo(null);
    const [pmRes, profileRes] = await Promise.all([
      supabase.from("user_payment_methods").select("method, account_name, account_number").eq("user_id", sellerId).eq("is_default", true).limit(1),
      supabase.from("profiles").select("full_name").eq("user_id", sellerId).single(),
    ]);
    setPaymentSellerName(profileRes.data?.full_name || "Seller");
    if (pmRes.data && pmRes.data.length > 0) {
      setPaymentInfo(pmRes.data[0] as PaymentInfo);
    }
    setPaymentLoading(false);
  };

  const openRatingDialog = async (target: { type: "transaction" | "exchange"; id: string; ratedId: string }) => {
    if (!user) return;
    setRatingScore("5");
    setRatingComment("");
    setRatingDialogOpen(true);
    setRatingTarget(null);

    const { data: prof } = await supabase.from("profiles").select("full_name").eq("user_id", target.ratedId).single();
    const ratedName = prof?.full_name || "User";
    setRatingTarget({ type: target.type as any, id: target.id, ratedId: target.ratedId, ratedName });
  };

  const submitRating = async () => {
    if (!user || !ratingTarget) return;
    setRatingSubmitting(true);
    try {
      const payload: any = {
        rater_id: user.id,
        rated_id: ratingTarget.ratedId,
        score: parseInt(ratingScore, 10),
        comment: ratingComment.trim() ? ratingComment.trim() : null,
        transaction_id: ratingTarget.type === "transaction" ? ratingTarget.id : null,
        exchange_id: ratingTarget.type === "exchange" ? ratingTarget.id : null,
      };
      const { error } = await supabase.from("ratings").insert(payload);
      if (error) throw error;
      toast({ title: "Thanks for your rating!" });
      setRatingDialogOpen(false);
      await fetchMyRatings();
    } catch (err: any) {
      toast({ title: "Rating failed", description: err.message, variant: "destructive" });
    } finally {
      setRatingSubmitting(false);
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
                          onShowPayment={showSellerPayment}
                          onRate={(sellerId: string) => openRatingDialog({ type: "transaction", id: t.id, ratedId: sellerId })}
                          canRate={t.status === "completed" && t.buyer_id === user!.id && !ratedTransactionIds[t.id]}
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
                          onRate={(ratedId: string) => openRatingDialog({ type: "exchange", id: ex.id, ratedId })}
                          canRate={ex.status === "accepted" && !ratedExchangeIds[ex.id]}
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
                          onShowPayment={showSellerPayment}
                          onRate={(sellerId: string) => openRatingDialog({ type: "transaction", id: t.id, ratedId: sellerId })}
                          canRate={t.status === "completed" && !ratedTransactionIds[t.id]}
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
                          onShowPayment={showSellerPayment}
                          onRate={() => {}}
                          canRate={false}
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
                          onRate={(ratedId: string) => openRatingDialog({ type: "exchange", id: ex.id, ratedId })}
                          canRate={ex.status === "accepted" && !ratedExchangeIds[ex.id]}
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

      {/* Seller Payment Details Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" /> Seller Payment Details
            </DialogTitle>
          </DialogHeader>
          {paymentLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : paymentInfo ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Send payment to <strong className="text-foreground">{paymentSellerName}</strong> using:</p>
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="font-medium text-foreground">{METHODS_MAP[paymentInfo.method] || paymentInfo.method}</span>
                </div>
                <p className="text-sm text-muted-foreground">Account Name: <span className="text-foreground font-medium">{paymentInfo.account_name}</span></p>
                <p className="text-sm text-muted-foreground">Account Number: <span className="text-foreground font-medium">{paymentInfo.account_number}</span></p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">Seller has not set up payment details yet.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Rating Dialog */}
      <Dialog open={ratingDialogOpen} onOpenChange={setRatingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate {ratingTarget?.ratedName ?? "User"}</DialogTitle>
          </DialogHeader>
          {!ratingTarget ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Score</Label>
                <Select value={ratingScore} onValueChange={setRatingScore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select score" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 - Excellent</SelectItem>
                    <SelectItem value="4">4 - Good</SelectItem>
                    <SelectItem value="3">3 - Average</SelectItem>
                    <SelectItem value="2">2 - Poor</SelectItem>
                    <SelectItem value="1">1 - Very poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Comment (optional)</Label>
                <Textarea value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} placeholder="Share feedback about the course or exchange..." />
              </div>
              <Button className="w-full" onClick={submitRating} disabled={ratingSubmitting}>
                {ratingSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Rating
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

const TransactionRow = ({
  t,
  userId,
  courseId,
  courseName,
  courseOwnerName,
  onShowPayment,
  onRate,
  canRate,
}: {
  t: Tables<"transactions">;
  userId: string;
  courseId: string;
  courseName: string;
  courseOwnerName: string;
  onShowPayment: (sellerId: string) => void;
  onRate: (sellerId: string) => void;
  canRate: boolean;
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
        {isBuyer && t.status === "completed" && (
          <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => onShowPayment(t.seller_id)}>
            <Wallet className="h-3.5 w-3.5" /> Pay Seller
          </Button>
        )}
        {isBuyer && canRate && (
          <Button size="sm" variant="outline" className="text-xs" onClick={() => onRate(t.seller_id)}>
            Rate Seller
          </Button>
        )}
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
  onRate,
  canRate,
}: {
  ex: Tables<"exchanges">;
  userId: string;
  coursesMap: Record<string, Tables<"courses">>;
  profilesMap: Record<string, Tables<"profiles">>;
  onAction: (id: string, action: "accepted" | "rejected") => void;
  onRate: (ratedId: string) => void;
  canRate: boolean;
}) => {
  const isOwner = ex.owner_id === userId;
  const requestedCourseRow = coursesMap[ex.requested_course_id];
  const offeredCourseRow = coursesMap[ex.offered_course_id];
  const requestedCourse = requestedCourseRow?.title ?? "Untitled";
  const offeredCourse = offeredCourseRow?.title ?? "Untitled";
  const requestedOwnerName = requestedCourseRow?.user_id ? profilesMap[requestedCourseRow.user_id]?.full_name : "";
  const offeredOwnerName = offeredCourseRow?.user_id ? profilesMap[offeredCourseRow.user_id]?.full_name : "";
  const otherUserId = isOwner ? ex.requester_id : ex.owner_id;

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
            <Button size="sm" variant="ghost" className="text-success" onClick={() => onAction(ex.id, "accepted")}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onAction(ex.id, "rejected")}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            {ex.status === "accepted" && canRate && (
              <Button size="sm" variant="outline" className="text-xs" onClick={() => onRate(otherUserId)}>
                Rate User
              </Button>
            )}
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
