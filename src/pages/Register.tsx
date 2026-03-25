import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Register = () => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [progressText, setProgressText] = useState<string>("");
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ variant: "destructive", title: "Password must be at least 6 characters" });
      return;
    }
    setLoading(true);
    setProgressText("Creating account...");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    setLoading(false);

    if (error) {
      setProgressText("");

      const msg = error.message.toLowerCase();
      const alreadyRegistered =
        msg.includes("already registered") ||
        msg.includes("user already") ||
        msg.includes("already exists") ||
        msg.includes("email") && msg.includes("exists");

      if (alreadyRegistered) {
        try {
          setLoading(true);
          setProgressText("Account already exists. Sending verification email...");
          const resendRes = await supabase.auth.resend({ type: "signup", email });
          setLoading(false);

          if (resendRes.error) {
            toast({
              variant: "destructive",
              title: "Account already exists",
              description: "Please log in. If you haven't verified your email yet, check your inbox (or try again later).",
            });
            setProgressText("");
            return;
          }

          setProgressText("Verification email sent.");
          setSuccess(true);
          return;
        } catch {
          setLoading(false);
          toast({
            variant: "destructive",
            title: "Account already exists",
            description: "Please log in. If you haven't verified your email yet, check your inbox.",
          });
          setProgressText("");
          return;
        }
      }

      toast({ variant: "destructive", title: "Registration failed", description: error.message });
    } else {
      if (!data.user) {
        setProgressText("");
        toast({
          variant: "destructive",
          title: "Registration failed",
          description: "Could not create user. Please try again.",
        });
        return;
      }

      setProgressText("Verification email sent.");
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <h2 className="font-display text-2xl font-bold text-foreground">Check your email</h2>
            <p className="mt-3 text-muted-foreground">
              We've sent a verification link to <strong>{email}</strong>. Please verify your email to activate your account.
            </p>
            {progressText && (
              <p className="mt-3 text-sm text-muted-foreground">
                {progressText}
              </p>
            )}
            <Button variant="outline" className="mt-6" asChild>
              <Link href="/login">Back to Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute inset-0 -z-10">
        <div className="absolute right-1/4 top-1/3 h-[400px] w-[400px] rounded-full bg-accent/5 blur-[120px]" />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <GraduationCap className="h-6 w-6 text-primary-foreground" />
          </Link>
          <CardTitle className="font-display text-2xl">Create an account</CardTitle>
          <CardDescription>Join LearnXchange and start sharing knowledge</CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              <p className="text-xs text-muted-foreground">At least 6 characters</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
            {progressText && (
              <p className="text-sm text-muted-foreground">
                {progressText}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Log in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Register;
