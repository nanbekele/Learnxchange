import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import {
  BookOpen,
  ShoppingCart,
  Repeat,
  Upload,
  Search,
  Star,
  ArrowRight,
  GraduationCap,
  Shield,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0, 0, 0.2, 1] as const },
  }),
};

const formatCompact = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K+`;
  return `${n}+`;
};

const Landing = () => {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [courses, setCourses] = useState<Tables<"courses">[]>([]);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [ownersMap, setOwnersMap] = useState<Record<string, Tables<"profiles">>>({});
  const [courseRatingsMap, setCourseRatingsMap] = useState<Record<string, { avg: number; count: number }>>({});
  const [trustStats, setTrustStats] = useState<{ users: number | null; courses: number | null; exchanges: number | null; sold: number | null; bought: number | null }>(
    { users: null, courses: null, exchanges: null, sold: null, bought: null },
  );

  useEffect(() => {
    const fetchStats = async () => {
      const [usersRes, coursesRes, exchangesRes, soldRes, boughtRes] = await Promise.all([
        supabase.from("profiles").select("user_id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "active"),
        user ? supabase.from("exchanges").select("id", { count: "exact", head: true }) : Promise.resolve(null as any),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "completed"),
        user ? supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "completed").eq("buyer_id", user.id) : Promise.resolve(null as any),
      ]);

      setTrustStats({
        users: usersRes.error ? null : usersRes.count ?? null,
        courses: coursesRes.error ? null : coursesRes.count ?? null,
        exchanges: !user || !exchangesRes || exchangesRes.error ? null : exchangesRes.count ?? null,
        sold: soldRes.error ? null : soldRes.count ?? null,
        bought: !user || !boughtRes || boughtRes.error ? null : boughtRes.count ?? null,
      });
    };

    fetchStats();

    supabase
      .from("courses")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6)
      .then(async ({ data }) => {
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
      });
  }, []);

  useEffect(() => {
    if (!user) {
      setMyAvatarUrl(null);
      return;
    }
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setMyAvatarUrl(data?.avatar_url ?? null);
      });
  }, [user]);

  const myFullName = (user?.user_metadata as any)?.full_name || "User";
  const myInitials = myFullName
    .split(" ")
    .filter(Boolean)
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">
              LearnXchange
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/courses">Browse Courses</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/about">About</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/contact">Contact</Link>
            </Button>
            <ThemeToggle />
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-full border border-border bg-background/60 px-2 py-1 text-sm text-foreground backdrop-blur hover:bg-background/80"
                    aria-label="Open user menu"
                  >
                    <Avatar className="h-8 w-8">
                      {myAvatarUrl ? <AvatarImage src={myAvatarUrl} alt={myFullName} /> : null}
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-display">{myInitials}</AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-[160px] truncate sm:inline">{myFullName}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => router.push("/dashboard")}>Portal</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => router.push("/profile")}>My Profile</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={async () => {
                      await signOut();
                      router.push("/");
                    }}
                  >
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild>
                  <Link href="/register">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
          <div className="absolute right-0 top-1/2 h-[400px] w-[400px] rounded-full bg-accent/10 blur-[100px]" />
        </div>
        <div className="container text-center">
          <motion.div
            initial="visible"
            animate="visible"
            variants={fadeUp}
            custom={0}
          >
            <span className="mb-4 inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              🚀 The marketplace for knowledge
            </span>
          </motion.div>
          <motion.h1
            className="mx-auto max-w-4xl font-display text-4xl font-bold leading-tight text-foreground md:text-6xl lg:text-7xl"
            initial="visible"
            animate="visible"
            variants={fadeUp}
            custom={1}
          >
            Buy, Sell & Exchange{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Learning Resources
            </span>
          </motion.h1>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl"
            initial="visible"
            animate="visible"
            variants={fadeUp}
            custom={2}
          >
            Join a community of learners and educators. Share your knowledge,
            discover new courses, and grow together.
          </motion.p>
          <motion.div
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
            initial="visible"
            animate="visible"
            variants={fadeUp}
            custom={3}
          >
            <Button size="lg" className="gap-2 text-base" asChild>
              <Link href="/register">
                Start Learning <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base" asChild>
              <Link href="/courses">Browse Courses</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card py-20">
        <div className="container">
          <motion.div
            className="text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Everything you need
            </h2>
            <p className="mt-3 text-muted-foreground">
              Three ways to access the knowledge you need
            </p>
          </motion.div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: ShoppingCart,
                title: "Buy Courses",
                desc: "Purchase high-quality learning materials from verified creators at fair prices.",
                color: "bg-primary/10 text-primary",
              },
              {
                icon: Upload,
                title: "Sell Resources",
                desc: "Upload your courses, tutorials, and materials. Earn from your expertise.",
                color: "bg-accent/10 text-accent",
              },
              {
                icon: Repeat,
                title: "Exchange Knowledge",
                desc: "Trade your courses with other users. Give what you know, get what you need.",
                color: "bg-warning/10 text-warning",
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i + 1}
              >
                <Card className="h-full border-border/50 transition-shadow hover:shadow-lg">
                  <CardContent className="p-8">
                    <div
                      className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${feature.color}`}
                    >
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-display text-xl font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20">
        <div className="container">
          <motion.div
            className="text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              How it works
            </h2>
            <p className="mt-3 text-muted-foreground">
              Get started in three simple steps
            </p>
          </motion.div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: BookOpen,
                title: "Create an Account",
                desc: "Sign up for free and set up your profile in minutes.",
              },
              {
                step: "02",
                icon: Search,
                title: "Discover or Upload",
                desc: "Browse courses or upload your own learning resources.",
              },
              {
                step: "03",
                icon: Star,
                title: "Learn & Grow",
                desc: "Buy, sell, or exchange — build your knowledge and reputation.",
              },
            ].map((step, i) => (
              <motion.div
                key={step.step}
                className="text-center"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i + 1}
              >
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <span className="font-display text-2xl font-bold text-primary">
                    {step.step}
                  </span>
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-border bg-card py-20">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
            >
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
                <Shield className="h-7 w-7 text-success" />
              </div>
              <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
                Trusted by learners
              </h2>
              <p className="mt-4 text-muted-foreground">
                Every user builds their reputation through transparent ratings
                and reviews. Your trust is our priority.
              </p>
            </motion.div>
            <motion.div
              className="mt-10 grid grid-cols-5 gap-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={1}
            >
              {[
                { label: "Active Users", value: trustStats.users },
                { label: "Courses Shared", value: trustStats.courses },
                { label: "Exchanges Made", value: trustStats.exchanges },
                { label: "Courses Sold", value: trustStats.sold },
                { label: "Courses Bought", value: trustStats.bought },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-display text-3xl font-bold text-primary">
                    {typeof stat.value === "number" ? formatCompact(stat.value) : "—"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Featured Courses */}
      {courses.length > 0 && (
        <section className="py-20">
          <div className="container">
            <motion.div
              className="flex items-center justify-between"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
            >
              <div>
                <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
                  Latest Courses
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Explore what the community is sharing
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href="/courses">
                  View All <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </motion.div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course, i) => (
                <motion.div
                  key={course.id}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i + 1}
                >
                  <Card
                    className="relative h-full cursor-pointer overflow-hidden border-border/50 transition-shadow hover:shadow-lg"
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
                    <div className="absolute right-3 top-3 z-10 rounded-full border border-border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
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
                    </div>
                    {course.thumbnail_url && (
                      <div className="aspect-video w-full overflow-hidden bg-muted">
                        <img
                          src={course.thumbnail_url}
                          alt={course.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <CardContent className="p-5">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {course.category}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-xs"
                        >
                          {course.availability === "sale"
                            ? "For Sale"
                            : course.availability === "exchange"
                            ? "For Exchange"
                            : "Sale & Exchange"}
                        </Badge>
                      </div>
                      <h3 className="font-display text-lg font-semibold text-foreground line-clamp-1">
                        {course.title}
                      </h3>
                      {ownersMap[course.user_id]?.full_name ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Owner: {" "}
                          <Link
                            href={`/users/${course.user_id}`}
                            className="text-foreground/90 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ownersMap[course.user_id]!.full_name}
                          </Link>
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {course.description}
                      </p>
                      {course.price > 0 && (
                        <p className="mt-3 font-display text-xl font-bold text-primary">
                          ETB {Number(course.price).toFixed(2)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center md:px-16">
            <div className="absolute inset-0 -z-10">
              <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-accent/20 blur-[80px]" />
            </div>
            <h2 className="font-display text-3xl font-bold text-primary-foreground md:text-4xl">
              Ready to start learning?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-primary-foreground/80">
              Join LearnXchange today and unlock a world of shared knowledge.
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="mt-8 gap-2 text-base"
              asChild
            >
              <Link href="/register">
                Create Free Account <Zap className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <GraduationCap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-display text-lg font-bold text-foreground">
                LearnXchange
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 LearnXchange. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
