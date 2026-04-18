import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GraduationCap, ShoppingCart, Repeat, Loader2, ArrowLeft, FileText, Wallet, CheckCircle2, Star, Download } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface SellerPaymentInfo {
  method: string;
  account_name: string;
  account_number: string;
}

const METHODS_MAP: Record<string, string> = {
  telebirr: "Telebirr",
  ebirr: "eBirr",
  paypal: "PayPal",
  bank: "Direct Bank Transfer",
};

const CourseDetail = () => {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [course, setCourse] = useState<Tables<"courses"> | null>(null);
  const [owner, setOwner] = useState<Tables<"profiles"> | null>(null);
  const [materials, setMaterials] = useState<Tables<"course_materials">[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [myCourses, setMyCourses] = useState<Tables<"courses">[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [exchanging, setExchanging] = useState(false);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(true);
  // After purchase: show seller payment details
  const [purchaseComplete, setPurchaseComplete] = useState(false);
  const [sellerPayment, setSellerPayment] = useState<SellerPaymentInfo | null>(null);
  const [materialUrls, setMaterialUrls] = useState<Record<string, string>>({});
  const [materialsUnlocked, setMaterialsUnlocked] = useState(false);
  const [hasAcquiredCourse, setHasAcquiredCourse] = useState(false);
  const [courseAvgRating, setCourseAvgRating] = useState<number | null>(null);
  const [courseRatingCount, setCourseRatingCount] = useState(0);
  const [canRateCourse, setCanRateCourse] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [myRatingScore, setMyRatingScore] = useState("5");
  const [myRatingComment, setMyRatingComment] = useState("");
  const [hasMyRating, setHasMyRating] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!canRateCourse) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("rate") === "1") {
      setRatingOpen(true);
    }
  }, [canRateCourse]);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const { data: c } = await supabase.from("courses").select("*").eq("id", id).single();
      if (c) {
        setCourse(c);
        const { data: p } = await supabase.from("profiles").select("*").eq("user_id", c.user_id).single();
        setOwner(p);
        const { data: m } = await supabase.from("course_materials").select("*").eq("course_id", c.id);
        const nextMaterials = m ?? [];
        setMaterials(nextMaterials);

        const isCourseOwner = !!user && user.id === c.user_id;

        // Entitlements:
        // - owner always
        // - completed purchase (buyer)
        // - accepted exchange where user is requester/owner and this course is either side
        // - pending exchange review: owner can preview offered course before accepting
        let unlocked = isCourseOwner;
        let acquired = isCourseOwner;
        if (!unlocked && user) {
          const [txRes, acceptedExRes, pendingReviewRes] = await Promise.all([
            supabase
              .from("transactions")
              .select("id")
              .eq("course_id", c.id)
              .eq("buyer_id", user.id)
              .eq("status", "completed")
              .limit(1),
            supabase
              .from("exchanges")
              .select("id")
              .eq("status", "accepted")
              .or(
                `and(requester_id.eq.${user.id},requested_course_id.eq.${c.id}),and(requester_id.eq.${user.id},offered_course_id.eq.${c.id}),and(owner_id.eq.${user.id},requested_course_id.eq.${c.id}),and(owner_id.eq.${user.id},offered_course_id.eq.${c.id})`,
              )
              .limit(1),
            supabase
              .from("exchanges")
              .select("id")
              .eq("status", "pending")
              .eq("owner_id", user.id)
              .eq("offered_course_id", c.id)
              .limit(1),
          ]);

          if ((txRes.data ?? []).length > 0) unlocked = true;
          if ((acceptedExRes.data ?? []).length > 0) unlocked = true;
          if ((pendingReviewRes.data ?? []).length > 0) unlocked = true;

          if ((txRes.data ?? []).length > 0) acquired = true;
          if ((acceptedExRes.data ?? []).length > 0) acquired = true;
        }

        setMaterialsUnlocked(unlocked);
        setHasAcquiredCourse(acquired);
        setCanRateCourse(!!user && !isCourseOwner && acquired);

        if (unlocked) {
          const toSign = nextMaterials.filter((x) => x.file_url && !x.file_url.startsWith("http"));
          const signedPairs = await Promise.all(
            toSign.map(async (x) => {
              const { data } = await supabase.storage
                .from("course-materials")
                .createSignedUrl(x.file_url, 60 * 10);
              return [x.id, data?.signedUrl ?? ""] as const;
            }),
          );
          setMaterialUrls((prev) => {
            const next = { ...prev };
            for (const [mid, url] of signedPairs) {
              if (url) next[mid] = url;
            }
            return next;
          });
        } else {
          setMaterialUrls({});
        }

        const { data: ratings } = await supabase
          .from("course_ratings")
          .select("score, comment, rater_id")
          .eq("course_id", c.id);
        const list = ratings ?? [];
        setCourseRatingCount(list.length);
        if (list.length > 0) {
          const avg = list.reduce((sum, r: any) => sum + Number(r.score ?? 0), 0) / list.length;
          setCourseAvgRating(avg);
        } else {
          setCourseAvgRating(null);
        }

        if (user) {
          const mine = list.find((r: any) => r.rater_id === user.id);
          if (mine) {
            setHasMyRating(true);
            setMyRatingScore(String(mine.score ?? 5));
            setMyRatingComment(mine.comment ?? "");
          } else {
            setHasMyRating(false);
            setMyRatingScore("5");
            setMyRatingComment("");
          }
        } else {
          setHasMyRating(false);
          setMyRatingScore("5");
          setMyRatingComment("");
        }
      }
      setLoading(false);
    };
    load();
  }, [id, user?.id]);

  const submitCourseRating = async () => {
    if (!user || !course) return;
    if (user.id === course.user_id) {
      toast({
        title: "Not allowed",
        description: "You can't rate your own course.",
        variant: "destructive",
      });
      return;
    }
    setRatingSubmitting(true);
    try {
      const payload: any = {
        course_id: course.id,
        rater_id: user.id,
        score: parseInt(myRatingScore, 10),
        comment: myRatingComment.trim() ? myRatingComment.trim() : null,
      };

      const { data: savedRating, error } = await supabase
        .from("course_ratings")
        .upsert(payload, { onConflict: "course_id,rater_id" })
        .select("id, course_id, rater_id, score, comment")
        .maybeSingle();

      if (error) throw error;
      if (!savedRating?.id) {
        throw new Error(
          "Rating could not be verified in the database. Please refresh and try again.",
        );
      }

      toast({ title: hasMyRating ? "Rating updated" : "Thanks for rating this course" });
      setRatingOpen(false);

      // Send notification to course owner (non-blocking)
      try {
        await fetch("/api/ratings/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId: course.id,
            raterId: user.id,
            score: parseInt(myRatingScore, 10),
            comment: myRatingComment.trim() || undefined,
          }),
        });
      } catch (notifyErr) {
        console.error("Failed to send rating notification:", notifyErr);
      }

      const { data: ratings } = await supabase
        .from("course_ratings")
        .select("score, comment, rater_id")
        .eq("course_id", course.id);
      const list = ratings ?? [];
      setCourseRatingCount(list.length);
      if (list.length > 0) {
        const avg = list.reduce((sum, r: any) => sum + Number(r.score ?? 0), 0) / list.length;
        setCourseAvgRating(avg);
      } else {
        setCourseAvgRating(null);
      }
      setHasMyRating(true);
    } catch (err: any) {
      toast({ title: "Rating failed", description: err.message, variant: "destructive" });
    } finally {
      setRatingSubmitting(false);
    }
  };

  // Check if current user has a payment method
  useEffect(() => {
    if (!user) { setCheckingPayment(false); return; }
    supabase
      .from("user_payment_methods")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .then(({ data }) => {
        setHasPaymentMethod((data ?? []).length > 0);
        setCheckingPayment(false);
      });
  }, [user]);

  useEffect(() => {
    if (user && exchangeOpen) {
      supabase
        .from("courses")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .then(({ data }) => setMyCourses(data ?? []));
    }
  }, [user, exchangeOpen]);

  const handleBuy = async () => {
    if (!user || !course) return;
    setBuying(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) throw new Error("You must be logged in");

      const res = await fetch("/api/chapa/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ courseId: course.id, returnPath: "/dashboard" }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : "Failed to start payment";
        throw new Error(msg);
      }

      toast({ title: "Redirecting to payment..." });
      window.location.href = String(json.checkoutUrl);
    } catch (err: any) {
      toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
    } finally {
      setBuying(false);
    }
  };

  const handleExchange = async () => {
    if (!user || !course || !selectedCourse) return;
    setExchanging(true);
    try {
      const { data: exchange, error } = await supabase.from("exchanges").insert({
        requested_course_id: course.id,
        offered_course_id: selectedCourse,
        requester_id: user.id,
        owner_id: course.user_id,
        status: "pending",
      }).select().single();
      if (error) throw error;
      toast({ title: "Exchange request sent!", description: "The course owner will review your request." });
      setExchangeOpen(false);

      // Send notification to course owner (non-blocking)
      if (exchange) {
        try {
          await fetch("/api/exchanges/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exchangeId: exchange.id,
              requestedCourseId: course.id,
              offeredCourseId: selectedCourse,
              requesterId: user.id,
              ownerId: course.user_id,
              action: "requested",
            }),
          });
        } catch (notifyErr) {
          console.error("Failed to send exchange notification:", notifyErr);
        }
      }

      router.push("/transactions");
    } catch (err: any) {
      toast({ title: "Exchange request failed", description: err.message, variant: "destructive" });
    } finally {
      setExchanging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Course not found</p>
        <Button asChild><Link href="/courses">Back to Courses</Link></Button>
      </div>
    );
  }

  const isOwner = user?.id === course.user_id;
  const canBuy = course.availability === "sale" || course.availability === "both";
  const canExchange = course.availability === "exchange" || course.availability === "both";
  const ownerInitials = owner?.full_name
    ? owner.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : "U";

  const content = (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" className="gap-2" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      {course.thumbnail_url && (
        <div className="overflow-hidden rounded-2xl">
          <img src={course.thumbnail_url} alt={course.title} className="h-64 w-full object-cover md:h-80" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{course.category}</Badge>
        <Badge variant="outline">
          {course.availability === "sale" ? "For Sale" : course.availability === "exchange" ? "For Exchange" : "Sale & Exchange"}
        </Badge>
      </div>

      <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">{course.title}</h1>

      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-primary font-display text-sm">{ownerInitials}</AvatarFallback>
        </Avatar>
        <div>
          <Link
            href={course?.user_id ? `/users/${course.user_id}` : "#"}
            className="text-sm font-medium text-foreground hover:underline"
          >
            {owner?.full_name || "Unknown"}
          </Link>
          <p className="text-xs text-muted-foreground">Course creator</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Rating</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Star className="h-4 w-4 text-primary" />
            <span className="text-foreground font-medium">
              {courseAvgRating === null ? "No ratings yet" : `${courseAvgRating.toFixed(1)} / 5`}
            </span>
            <span>({courseRatingCount})</span>
          </div>
          {canRateCourse ? (
            <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Star className="h-4 w-4" /> {hasMyRating ? "Edit rating" : "Rate course"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{hasMyRating ? "Edit your rating" : "Rate this course"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Score</Label>
                    <Select value={myRatingScore} onValueChange={setMyRatingScore}>
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
                    <Textarea
                      value={myRatingComment}
                      onChange={(e) => setMyRatingComment(e.target.value)}
                      placeholder="Share feedback about the course..."
                    />
                  </div>
                  <Button className="w-full" onClick={submitCourseRating} disabled={ratingSubmitting}>
                    {ratingSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <p className="text-xs text-muted-foreground">
              {user ? "You can rate this course after a completed purchase or an accepted exchange." : "Log in to rate this course."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>About this course</CardTitle></CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-muted-foreground">{course.description || "No description provided."}</p>
        </CardContent>
      </Card>

      {course.toc_url && (
        <Card>
          <CardHeader><CardTitle>Table of Contents</CardTitle></CardHeader>
          <CardContent>
            <a
              href={course.toc_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <FileText className="h-4 w-4" /> Download / View Table of Contents
            </a>
          </CardContent>
        </Card>
      )}

      {materials.length > 0 && (
        <Card id="materials">
          <CardHeader><CardTitle>Materials ({materials.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!materialsUnlocked && (
              <p className="text-sm text-muted-foreground">
                Materials are locked. You can download them after purchase or after an accepted exchange.
              </p>
            )}
            {materials.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {materialsUnlocked ? (
                  m.file_url?.startsWith("http") ? (
                    <a
                      href={m.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {m.file_name}
                    </a>
                  ) : materialUrls[m.id] ? (
                    <a
                      href={materialUrls[m.id]}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {m.file_name}
                    </a>
                  ) : (
                    <span>{m.file_name}</span>
                  )
                ) : (
                  <span>{m.file_name}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Purchase complete - show seller payment details */}
      {purchaseComplete && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" /> Purchase Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Send your payment to the seller using the details below:
            </p>
            {sellerPayment ? (
              <div className="rounded-lg border border-border bg-background p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="font-medium text-foreground">{METHODS_MAP[sellerPayment.method] || sellerPayment.method}</span>
                </div>
                <p className="text-sm text-muted-foreground">Account Name: <span className="text-foreground font-medium">{sellerPayment.account_name}</span></p>
                <p className="text-sm text-muted-foreground">Account Number: <span className="text-foreground font-medium">{sellerPayment.account_number}</span></p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Seller has not set up payment details yet. Contact them directly.</p>
            )}
            <Button onClick={() => router.push("/transactions")} variant="outline" className="w-full">
              View Transactions
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {!isOwner && user && !purchaseComplete && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row">
            {materialsUnlocked ? (
              <Button
                className="flex-1 gap-2"
                size="lg"
                onClick={async () => {
                  if (typeof window === "undefined" || materials.length === 0) return;
                  const downloadBlob = async (url: string, filename: string) => {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`Failed to download ${filename}`);
                    const blob = await res.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    try {
                      const a = document.createElement("a");
                      a.href = objectUrl;
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    } finally {
                      URL.revokeObjectURL(objectUrl);
                    }
                  };

                  toast({
                    title: "Download started",
                    description:
                      materials.length === 1
                        ? "Downloading 1 course material..."
                        : `Downloading all ${materials.length} course materials...`,
                  });

                  // Download all materials
                  try {
                    for (const m of materials) {
                      let url = m.file_url;
                      if (!url) continue;
                      const filename = m.file_name || "course-material";

                      // Get signed URL if needed
                      if (!url.startsWith("http")) {
                        const { data } = await supabase.storage.from("course-materials").createSignedUrl(url, 60 * 10);
                        url = data?.signedUrl ?? "";
                      }

                      if (url) {
                        await downloadBlob(url, filename);
                        // Small delay between downloads
                        await new Promise((r) => setTimeout(r, 300));
                      }
                    }

                    toast({
                      title: "Download complete",
                      description:
                        materials.length === 1
                          ? "Your material has been downloaded."
                          : "All materials have been downloaded.",
                    });
                  } catch (err: any) {
                    toast({
                      title: "Download failed",
                      description: err?.message || "Could not download course materials.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Download className="h-4 w-4" /> {materials.length > 1 ? "Download all materials" : "Download material"}
              </Button>
            ) : (
              canBuy && (
                <Button className="flex-1 gap-2" size="lg" onClick={handleBuy} disabled={buying || checkingPayment}>
                  {buying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  Buy for ETB {Number(course.price).toFixed(2)}
                </Button>
              )
            )}
            {canExchange && !hasAcquiredCourse && !materialsUnlocked && (
              <Dialog open={exchangeOpen} onOpenChange={setExchangeOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1 gap-2" size="lg" disabled={checkingPayment}>
                    <Repeat className="h-4 w-4" /> Request Exchange
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Request Exchange</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Select one of your courses to offer in exchange for <strong>"{course.title}"</strong>.
                  </p>
                  <div className="space-y-3 mt-4">
                    <Label>Your course to offer</Label>
                    <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                      <SelectTrigger><SelectValue placeholder="Select a course" /></SelectTrigger>
                      <SelectContent>
                        {myCourses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {myCourses.length === 0 && (
                      <p className="text-sm text-muted-foreground">You don't have any courses to offer. <Link href="/courses/create" className="text-primary hover:underline">Create one first</Link>.</p>
                    )}
                    <Button className="w-full" onClick={handleExchange} disabled={exchanging || !selectedCourse}>
                      {exchanging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Send Exchange Request
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardContent>
        </Card>
      )}

      {!user && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">Log in to buy or exchange this course</p>
            <Button asChild><Link href="/login">Log in</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );

  if (user) {
    return <AppLayout>{content}</AppLayout>;
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">LearnXchange</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" asChild><Link href="/login">Log in</Link></Button>
            <Button asChild><Link href="/register">Get Started</Link></Button>
          </div>
        </div>
      </nav>
      <div className="container py-8">{content}</div>
    </div>
  );
};

export default CourseDetail;
