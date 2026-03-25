import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const MyLearning = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Tables<"courses">[]>([]);
  const [loading, setLoading] = useState(true);

  const acquiredIds = useMemo(() => new Set<string>(), []);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);

      const [txRes, exRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("course_id")
          .eq("buyer_id", user.id)
          .eq("status", "completed"),
        supabase
          .from("exchanges")
          .select("requested_course_id, offered_course_id, requester_id, owner_id")
          .eq("status", "accepted")
          .or(`requester_id.eq.${user.id},owner_id.eq.${user.id}`),
      ]);

      acquiredIds.clear();
      for (const row of txRes.data ?? []) {
        if (row.course_id) acquiredIds.add(row.course_id);
      }

      for (const ex of exRes.data ?? []) {
        if (ex.requester_id === user.id && ex.requested_course_id) acquiredIds.add(ex.requested_course_id);
        if (ex.owner_id === user.id && ex.offered_course_id) acquiredIds.add(ex.offered_course_id);
      }

      const ids = [...acquiredIds];
      if (ids.length === 0) {
        setCourses([]);
        setLoading(false);
        return;
      }

      const { data: found } = await supabase
        .from("courses")
        .select("*")
        .in("id", ids)
        .neq("user_id", user.id)
        .order("created_at", { ascending: false });

      setCourses(found ?? []);
      setLoading(false);
    };

    load();
  }, [user, acquiredIds]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">My Learning</h1>
          <p className="mt-1 text-muted-foreground">Courses you have acquired by purchase or exchange</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground">No acquired courses yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Buy or exchange a course to see it here</p>
            <Button className="mt-4" asChild>
              <Link href="/courses">Browse courses</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <Card key={course.id} className="overflow-hidden border-border/50 transition-shadow hover:shadow-lg">
                <Link href={`/courses/${course.id}`}>
                  {course.thumbnail_url && (
                    <div className="aspect-video w-full overflow-hidden bg-muted">
                      <img src={course.thumbnail_url} alt={course.title} className="h-full w-full object-cover" />
                    </div>
                  )}
                </Link>
                <CardContent className="p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{course.category}</Badge>
                    <Badge variant="outline" className="text-xs">
                      {course.availability === "sale" ? "For Sale" : course.availability === "exchange" ? "For Exchange" : "Sale & Exchange"}
                    </Badge>
                  </div>
                  <Link href={`/courses/${course.id}`}>
                    <h3 className="font-display text-lg font-semibold text-foreground line-clamp-1 hover:text-primary transition-colors">
                      {course.title}
                    </h3>
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{course.description}</p>
                  <div className="mt-4">
                    <Button className="w-full" asChild>
                      <Link href={`/courses/${course.id}`}>Open course</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default MyLearning;
