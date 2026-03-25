import { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, PlusCircle, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

const MyCourses = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [courses, setCourses] = useState<Tables<"courses">[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCourses = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("courses")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setCourses(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchCourses(); }, [user]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting course", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Course deleted" });
      setCourses((prev) => prev.filter((c) => c.id !== id));
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">My Courses</h1>
            <p className="mt-1 text-muted-foreground">Manage courses you've created</p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/courses/create"><PlusCircle className="h-4 w-4" />Create Course</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground">No courses created</h3>
            <p className="mt-1 text-sm text-muted-foreground">Start sharing your knowledge</p>
            <Button className="mt-4 gap-2" asChild>
              <Link href="/courses/create"><PlusCircle className="h-4 w-4" />Create Course</Link>
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
                    <h3 className="font-display text-lg font-semibold text-foreground line-clamp-1 hover:text-primary transition-colors">{course.title}</h3>
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{course.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    {course.price > 0 && <p className="font-display text-xl font-bold text-primary">ETB {Number(course.price).toFixed(2)}</p>}
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(course.id)}>
                      <Trash2 className="h-4 w-4" />
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

export default MyCourses;
