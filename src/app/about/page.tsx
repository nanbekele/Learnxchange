"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookOpen, GraduationCap, Repeat, Shield, ShoppingCart, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { supabase } from "@/integrations/supabase/client";

export default function AboutPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);

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
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">LearnXchange</span>
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
                  {isAdmin && (
                    <DropdownMenuItem onSelect={() => router.push("/admin")}>Admin Dashboard</DropdownMenuItem>
                  )}
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

      <main className="container py-12">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 md:p-12">
          <div className="absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/10 blur-[110px]" />
            <div className="absolute right-0 top-1/2 h-[320px] w-[320px] rounded-full bg-accent/10 blur-[100px]" />
          </div>

          <Badge className="mb-4" variant="secondary">
            Built for learners & creators
          </Badge>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">About LearnXchange</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                LearnXchange is a marketplace where learners and educators can buy, sell, and exchange learning resources —
                with transparent reputation, secure delivery, and a community-first approach.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/courses">Browse Courses</Link>
              </Button>
              {!user ? (
                <Button variant="outline" asChild>
                  <Link href="/register">Get Started</Link>
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link href="/dashboard">Go to Portal</Link>
                </Button>
              )}
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Our mission</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Make quality learning materials accessible and fairly rewarded, so creators can earn from their expertise
                  and learners can grow faster.
                </p>
                <p>
                  We believe trust comes from transparency — reputation, ratings, and clear course details help everyone
                  make confident decisions.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">What we enable</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                    <ShoppingCart className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Buy</div>
                    <div className="text-muted-foreground">Purchase learning resources with clear pricing.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-accent/10 p-2 text-accent">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Sell</div>
                    <div className="text-muted-foreground">Upload content and earn from your expertise.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-warning/10 p-2 text-warning">
                    <Repeat className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Exchange</div>
                    <div className="text-muted-foreground">Trade courses and grow together.</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-3">
          {[{ label: "Trust-first reputation", icon: Star, desc: "Ratings and reputation help keep the community accountable." }, { label: "Secure delivery", icon: Shield, desc: "Protected access to learning resources and safer exchanges." }, { label: "Community growth", icon: GraduationCap, desc: "Learn, teach, and build real outcomes together." }].map((f) => (
            <Card key={f.label} className="border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <f.icon className="h-4 w-4 text-primary" />
                  {f.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{f.desc}</CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-10">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Frequently asked</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>Is LearnXchange free to join?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Yes. You can create an account for free. You only pay when you purchase a paid resource.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>How do exchanges work?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    You can offer one of your courses in exchange for another course. The owner reviews and accepts or rejects.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>How do ratings and reputation help?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Ratings build reputation over time, helping buyers choose trustworthy creators and encouraging high-quality content.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
