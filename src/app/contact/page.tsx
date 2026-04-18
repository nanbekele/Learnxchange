"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Clock, GraduationCap, HelpCircle, Mail, MapPin, MessageSquare, Phone, SendHorizontal, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_OWNER_EMAIL } from "@/lib/platform";

export default function ContactPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

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

  useEffect(() => {
    if (!user) return;
    const fullName = (user.user_metadata as any)?.full_name ?? "";
    const email = user.email ?? "";
    setForm((p) => ({
      ...p,
      name: p.name || fullName,
      email: p.email || email,
    }));
  }, [user]);

  const myFullName = (user?.user_metadata as any)?.full_name || "User";
  const myInitials = myFullName
    .split(" ")
    .filter(Boolean)
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "Please log in",
        description: "You must be logged in to send a message.",
        variant: "destructive",
      });
      router.push("/login");
      return;
    }
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill name, email, and message.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        user_id: user.id,
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim() || null,
        message: form.message.trim(),
      } as any);
      if (error) throw error;

      setForm((p) => ({ ...p, subject: "", message: "" }));
      toast({ title: "Message sent", description: "Admin will review and reply to your email." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

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

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">Contact Us</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Have a question about a course, a payment, or an exchange? Send us a message and we’ll get back to you.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              Average response time: <span className="text-foreground font-medium">within 24 hours</span>
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quick contacts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Email</div>
                      <a className="text-muted-foreground hover:text-foreground" href={`mailto:${PLATFORM_OWNER_EMAIL}`}>
                        {PLATFORM_OWNER_EMAIL}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-accent/10 p-2 text-accent">
                      <Phone className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Phone</div>
                      <div className="text-muted-foreground">+251 900 000 000</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-warning/10 p-2 text-warning">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Location</div>
                      <div className="text-muted-foreground">Addis Ababa, Ethiopia</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-success/10 p-2 text-success">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Hours</div>
                      <div className="text-muted-foreground">Mon–Fri, 9:00 AM – 6:00 PM</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Support tips</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Include your course title, transaction date, and any screenshots if you’re reporting an issue.
                </CardContent>
              </Card>
            </div>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Send a message</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="grid gap-5" onSubmit={onSubmit}>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full name</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Your name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        value={form.subject}
                        onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                        placeholder="How can we help?"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                        Support
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      value={form.message}
                      onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                      placeholder="Tell us what’s going on…"
                      className="min-h-[140px]"
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      By submitting, you agree we can contact you about your request.
                    </p>
                    <Button type="submit" disabled={submitting} className="sm:w-auto">
                      {submitting ? "Sending…" : "Send message"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
