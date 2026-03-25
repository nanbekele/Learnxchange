import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, PlusCircle, BookOpen, GraduationCap, Star } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import AppLayout from "@/components/AppLayout";
import type { Tables } from "@/integrations/supabase/types";

const CoursesContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerId = searchParams.get("owner");
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [courses, setCourses] = useState<Tables<"courses">[]>([]);
  const [ownersMap, setOwnersMap] = useState<Record<string, Tables<"profiles">>>({});
  const [ownerFilterName, setOwnerFilterName] = useState<string>("");
  const [courseRatingsMap, setCourseRatingsMap] = useState<Record<string, { avg: number; count: number }>>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchCourses = async () => {
      setLoading(true);
      let query = supabase.from("courses").select("*").eq("status", "active").order("created_at", { ascending: false });

      if (ownerId) query = query.eq("user_id", ownerId);
      if (category !== "all") query = query.eq("category", category);
      if (availability !== "all") query = query.eq("availability", availability);
      if (searchQuery.trim()) query = query.ilike("title", `%${searchQuery}%`);

      const { data } = await query;
      const nextCourses = data ?? [];
      setCourses(nextCourses);

      const courseIds = nextCourses.map((c) => c.id);
      if (courseIds.length > 0) {
        const { data: ratings } = await supabase
          .from("course_ratings")
          .select("course_id, score")
          .in("course_id", courseIds);
        const acc: Record<string, { sum: number; count: number }> = {};
        (ratings ?? []).forEach((r: any) => {
          const cid = String(r.course_id);
          if (!acc[cid]) acc[cid] = { sum: 0, count: 0 };
          acc[cid].sum += Number(r.score ?? 0);
          acc[cid].count += 1;
        });
        const map: Record<string, { avg: number; count: number }> = {};
        for (const [cid, v] of Object.entries(acc)) {
          if (v.count > 0) map[cid] = { avg: v.sum / v.count, count: v.count };
        }
        setCourseRatingsMap(map);
      } else {
        setCourseRatingsMap({});
      }

      const ownerIds = [...new Set(nextCourses.map((c) => c.user_id).filter(Boolean))];
      if (ownerIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("*").in("user_id", ownerIds);
        const map: Record<string, Tables<"profiles">> = {};
        (profs ?? []).forEach((p) => {
          map[p.user_id] = p;
        });
        setOwnersMap(map);
      } else {
        setOwnersMap({});
      }
      setLoading(false);
    };
    fetchCourses();
  }, [category, availability, searchQuery, ownerId]);

  useEffect(() => {
    if (!ownerId) {
      setOwnerFilterName("");
      return;
    }
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", ownerId)
      .single()
      .then(({ data }) => {
        setOwnerFilterName(data?.full_name || "User");
      });
  }, [ownerId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            {ownerId ? "Courses" : "Browse Courses"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {ownerId ? `${ownerFilterName || "User"}'s courses` : "Discover learning resources from the community"}
          </p>
        </div>
        {user && (
          <Button asChild className="gap-2">
            <Link href="/courses/create">
              <PlusCircle className="h-4 w-4" />
              Create Course
            </Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="programming">Programming</SelectItem>
            <SelectItem value="design">Design</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="language">Language</SelectItem>
            <SelectItem value="science">Science</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={availability} onValueChange={setAvailability}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="sale">For Sale</SelectItem>
            <SelectItem value="exchange">For Exchange</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Courses Grid or Empty State */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            No courses yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Be the first to share your knowledge!
          </p>
          {user && (
            <Button className="mt-4 gap-2" asChild>
              <Link href="/courses/create">
                <PlusCircle className="h-4 w-4" />
                Create Course
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card
              key={course.id}
              className="relative cursor-pointer overflow-hidden border-border/50 transition-shadow hover:shadow-lg"
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/courses/${course.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/courses/${course.id}`);
                }
              }}
            >
                <button
                  type="button"
                  className="absolute right-3 top-3 z-10 rounded-full border border-border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(`/courses/${course.id}?rate=1`);
                  }}
                  aria-label="Rate this course"
                  title="Rate this course"
                >
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-primary" />
                    {courseRatingsMap[course.id] ? (
                      <>
                        <span className="text-foreground font-medium">{courseRatingsMap[course.id]!.avg.toFixed(1)}</span>
                        <span>({courseRatingsMap[course.id]!.count})</span>
                      </>
                    ) : (
                      <span>No ratings</span>
                    )}
                  </span>
                </button>
                {course.thumbnail_url && (
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    <img src={course.thumbnail_url} alt={course.title} className="h-full w-full object-cover" />
                  </div>
                )}
                <CardContent className="p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{course.category}</Badge>
                    <Badge variant="outline" className="text-xs">
                      {course.availability === "sale" ? "For Sale" : course.availability === "exchange" ? "For Exchange" : "Sale & Exchange"}
                    </Badge>
                  </div>
                  <h3 className="font-display text-lg font-semibold text-foreground line-clamp-1">{course.title}</h3>
                  {ownersMap[course.user_id]?.full_name ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Owner:{" "}
                      <Link
                        href={`/users/${course.user_id}`}
                        className="text-foreground/90 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ownersMap[course.user_id]!.full_name}
                      </Link>
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{course.description}</p>
                  {course.price > 0 && (
                    <p className="mt-3 font-display text-xl font-bold text-primary">ETB {Number(course.price).toFixed(2)}</p>
                  )}
                </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const Courses = () => {
  const { user } = useAuth();

  // Logged-in users see the full app layout
  if (user) {
    return (
      <AppLayout>
        <CoursesContent />
      </AppLayout>
    );
  }

  // Non-logged-in users see a standalone page
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
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>
      <div className="container py-8">
        <CoursesContent />
      </div>
    </div>
  );
};

export default Courses;
