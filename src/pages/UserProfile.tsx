"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Star, ArrowLeft } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function UserProfile() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [ownerCourseAvgRating, setOwnerCourseAvgRating] = useState<number | null>(null);
  const [ownerCourseRatingsCount, setOwnerCourseRatingsCount] = useState(0);
  const [coursesUploaded, setCoursesUploaded] = useState(0);
  const [coursesSold, setCoursesSold] = useState(0);
  const [coursesBought, setCoursesBought] = useState(0);
  const [exchangesSent, setExchangesSent] = useState(0);
  const [exchangesReceived, setExchangesReceived] = useState(0);
  const [exchangesAccepted, setExchangesAccepted] = useState(0);
  const [recentCourses, setRecentCourses] = useState<Array<Pick<Tables<"courses">, "id" | "title" | "created_at">>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);

      const [
        profileRes,
        uploadedIdsRes,
        uploadedRes,
        soldRes,
        boughtRes,
        exSentRes,
        exRecvRes,
        exAcceptedRes,
        recentCoursesRes,
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", id).single(),
        supabase.from("courses").select("id").eq("user_id", id),
        (supabase.from("courses") as any).select("id", { count: "exact", head: true }).eq("user_id", id),
        (supabase.from("transactions") as any)
          .select("id", { count: "exact", head: true })
          .eq("seller_id", id)
          .eq("status", "completed"),
        (supabase.from("transactions") as any)
          .select("id", { count: "exact", head: true })
          .eq("buyer_id", id)
          .eq("status", "completed"),
        (supabase.from("exchanges") as any).select("id", { count: "exact", head: true }).eq("requester_id", id),
        (supabase.from("exchanges") as any).select("id", { count: "exact", head: true }).eq("owner_id", id),
        (supabase.from("exchanges") as any)
          .select("id", { count: "exact", head: true })
          .eq("status", "accepted")
          .or(`requester_id.eq.${id},owner_id.eq.${id}`),
        supabase.from("courses").select("id, title, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(6),
      ]);

      setProfile(profileRes.data ?? null);

      const courseIds = (uploadedIdsRes.data ?? []).map((c: any) => String(c.id)).filter(Boolean);
      if (courseIds.length === 0) {
        setOwnerCourseAvgRating(null);
        setOwnerCourseRatingsCount(0);
      } else {
        const { data: courseRatings } = await supabase
          .from("course_ratings")
          .select("score")
          .in("course_id", courseIds);
        const list = courseRatings ?? [];
        setOwnerCourseRatingsCount(list.length);
        if (list.length === 0) {
          setOwnerCourseAvgRating(null);
        } else {
          const avg = list.reduce((sum: number, r: any) => sum + Number(r.score ?? 0), 0) / list.length;
          setOwnerCourseAvgRating(avg);
        }
      }

      setCoursesUploaded(Number((uploadedRes as any)?.count ?? 0));
      setCoursesSold(Number((soldRes as any)?.count ?? 0));
      setCoursesBought(Number((boughtRes as any)?.count ?? 0));
      setExchangesSent(Number((exSentRes as any)?.count ?? 0));
      setExchangesReceived(Number((exRecvRes as any)?.count ?? 0));
      setExchangesAccepted(Number((exAcceptedRes as any)?.count ?? 0));
      setRecentCourses((recentCoursesRes.data ?? []) as any);
      setLoading(false);
    };

    load();
  }, [id]);

  const name = profile?.full_name?.trim() || "User";
  const initials = name
    ? name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8 space-y-4">
          <Button variant="ghost" className="gap-2" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <p className="text-muted-foreground">User not found</p>
          <Button asChild variant="outline">
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-display text-xl font-bold text-foreground">LearnXchange</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href={`/courses?owner=${id}`}>{name}'s courses</Link>
            </Button>
          </div>
        </div>
      </nav>

      <div className="container py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Button variant="ghost" className="gap-2 w-fit" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <Avatar className="h-24 w-24">
                  {profile.avatar_url ? <AvatarImage src={profile.avatar_url} alt={name} /> : null}
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-display">{initials}</AvatarFallback>
                </Avatar>

                <div className="flex-1 text-center sm:text-left">
                  <h1 className="font-display text-3xl font-bold text-foreground">{name}</h1>
                  <div className="mt-2 flex items-center justify-center gap-1 text-sm text-warning sm:justify-start">
                    <Star className="h-4 w-4 fill-current" />
                    <span className="font-medium">{ownerCourseAvgRating === null ? "0.0" : ownerCourseAvgRating.toFixed(1)}</span>
                    <span className="text-muted-foreground">· {ownerCourseRatingsCount === 0 ? "No ratings yet" : `${ownerCourseRatingsCount} rating${ownerCourseRatingsCount === 1 ? "" : "s"}`}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Courses uploaded</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">{coursesUploaded}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Courses sold</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">{coursesSold}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Courses bought</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">{coursesBought}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Exchanges sent</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">{exchangesSent}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Exchanges received</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">{exchangesReceived}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Accepted exchanges</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">{exchangesAccepted}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg font-semibold text-foreground">Recent uploads</h2>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/courses?owner=${id}`}>{name}'s courses</Link>
                </Button>
              </div>

              {recentCourses.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No courses uploaded yet.</p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {recentCourses.map((c) => (
                    <Link
                      key={c.id}
                      href={`/courses/${c.id}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium text-foreground line-clamp-1">{c.title}</span>
                      <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
