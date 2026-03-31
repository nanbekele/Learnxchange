import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  DollarSign, Users, BookOpen, Percent, Settings, Loader2,
  TrendingUp, ShoppingCart, Trash2, Shield, Wallet, Mail,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const AdminDashboard = () => {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const router = useRouter();

  const [stats, setStats] = useState({ totalUsers: 0, totalCourses: 0, totalTransactions: 0, totalCommissions: 0 });
  const [commissionRate, setCommissionRate] = useState("2");
  const [paymentMethod, setPaymentMethod] = useState("telebirr");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Data lists
  const [users, setUsers] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<Tables<"payout_requests">[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [activeMessage, setActiveMessage] = useState<any | null>(null);
  const [replying, setReplying] = useState(false);

  // Payout confirmation dialog
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<Tables<"payout_requests"> | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [adminLoading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin || !user) return;
    fetchAll();
  }, [isAdmin, user]);

  const fetchAll = async () => {
    setLoading(true);
    const [usersRes, coursesRes, txRes, commRes, payoutRes, settingsRes, msgRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("courses").select("*").order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }),
      supabase.from("commissions").select("*").order("created_at", { ascending: false }),
      supabase.from("payout_requests").select("*").order("requested_at", { ascending: false }),
      supabase.from("platform_settings").select("*"),
      supabase.from("contact_messages").select("*").order("created_at", { ascending: false }),
    ]);

    setUsers(usersRes.data ?? []);
    setCourses(coursesRes.data ?? []);
    setTransactions(txRes.data ?? []);
    setCommissions(commRes.data ?? []);
    setPayoutRequests(payoutRes.data ?? []);
    setMessages(msgRes.data ?? []);

    const totalComm = (commRes.data ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
    setStats({
      totalUsers: (usersRes.data ?? []).length,
      totalCourses: (coursesRes.data ?? []).length,
      totalTransactions: (txRes.data ?? []).length,
      totalCommissions: totalComm,
    });

    const settings = settingsRes.data ?? [];
    const rateRow = settings.find((s: any) => s.key === "commission_rate");
    const methodRow = settings.find((s: any) => s.key === "payment_method");
    const accountRow = settings.find((s: any) => s.key === "payment_account");
    if (rateRow) setCommissionRate(rateRow.value);
    if (methodRow) setPaymentMethod(methodRow.value);
    if (accountRow) setPaymentAccount(accountRow.value);

    setLoading(false);
  };

  const createAdminUser = async () => {
    setCreatingAdmin(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      let token = sessionRes.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token;
      }
      if (!token) {
        toast({ title: "Unauthorized", description: "Please log in again.", variant: "destructive" });
        return;
      }

      const res = await fetch("/api/admin/create-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: newAdminName.trim() || "Admin",
          email: newAdminEmail.trim(),
          password: newAdminPassword,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(json?.error ?? "Failed to create admin"));
      }

      toast({ title: "Admin created" });
      setNewAdminName("");
      setNewAdminEmail("");
      setNewAdminPassword("");
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreatingAdmin(false);
    }
  };

  const openPayoutDialog = (payout: Tables<"payout_requests">) => {
    const seller = users.find((u: any) => u.user_id === payout.seller_id);
    setSelectedPayout(payout);
    setSelectedSeller(seller || null);
    setPayoutDialogOpen(true);
  };

  const confirmMarkPayoutPaid = async () => {
    if (!user || !selectedPayout) return;
    setMarkingPaid(true);
    try {
      const now = new Date().toISOString();
      const { error: e1 } = await supabase
        .from("payout_requests")
        .update({ status: "paid", reviewed_by: user.id, reviewed_at: now, paid_at: now, updated_at: now })
        .eq("id", selectedPayout.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("seller_earnings")
        .update({ status: "paid", updated_at: now })
        .eq("payout_request_id", selectedPayout.id);
      if (e2) throw e2;

      toast({ title: "Payout marked as paid" });
      setPayoutDialogOpen(false);
      setSelectedPayout(null);
      setSelectedSeller(null);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setMarkingPaid(false);
    }
  };

  const openReply = (m: any) => {
    setActiveMessage(m);
    setReplyText(m.admin_reply ?? "");
    setReplyOpen(true);
  };

  const handleSendReply = async () => {
    if (!activeMessage || !user) return;
    if (!replyText.trim()) {
      toast({ title: "Reply is empty", variant: "destructive" });
      return;
    }

    setReplying(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("contact_messages")
        .update({
          admin_reply: replyText.trim(),
          status: "replied",
          replied_at: now,
          replied_by: user.id,
        })
        .eq("id", activeMessage.id);
      if (error) throw error;

      const email = String(activeMessage.email || "");
      const subject = encodeURIComponent(`Re: ${activeMessage.subject || "Contact message"}`);
      const body = encodeURIComponent(replyText.trim());
      if (email) {
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
      }

      toast({ title: "Reply saved", description: "Opening your email client to send the reply." });
      setReplyOpen(false);
      setActiveMessage(null);
      setReplyText("");
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setReplying(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const uid = user!.id;
      const { error: e1 } = await supabase
        .from("platform_settings")
        .update({ value: commissionRate, updated_at: now, updated_by: uid })
        .eq("key", "commission_rate");
      const { error: e2 } = await supabase
        .from("platform_settings")
        .upsert({ key: "payment_method", value: paymentMethod, updated_at: now, updated_by: uid }, { onConflict: "key" });
      const { error: e3 } = await supabase
        .from("platform_settings")
        .update({ value: paymentAccount, updated_at: now, updated_by: uid })
        .eq("key", "payment_account");
      if (e1 || e2 || e3) throw e1 || e2 || e3;
      toast({ title: "Settings saved!" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    const { error } = await supabase.from("courses").delete().eq("id", courseId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Course deleted" });
      fetchAll();
    }
  };

  if (adminLoading || loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  if (!isAdmin) return null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage your platform, users, and commissions</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-primary" },
            { label: "Total Courses", value: stats.totalCourses, icon: BookOpen, color: "text-accent" },
            { label: "Total Transactions", value: stats.totalTransactions, icon: ShoppingCart, color: "text-warning" },
            { label: "Commission Earned", value: `ETB ${stats.totalCommissions.toFixed(2)}`, icon: DollarSign, color: "text-success" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl bg-muted p-3 ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="font-display text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="messages">Messages ({messages.length})</TabsTrigger>
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
            <TabsTrigger value="courses">Courses ({courses.length})</TabsTrigger>
            <TabsTrigger value="transactions">Transactions ({transactions.length})</TabsTrigger>
            <TabsTrigger value="commissions">Commissions ({commissions.length})</TabsTrigger>
            <TabsTrigger value="payouts">Payouts ({payoutRequests.length})</TabsTrigger>
          </TabsList>

          {/* Messages */}
          <TabsContent value="messages">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Contact Messages</CardTitle>
              </CardHeader>
              <CardContent>
                {messages.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No messages yet</p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => (
                      <div key={m.id} className="rounded-lg border border-border p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{m.subject || "(No subject)"}</p>
                            <p className="text-xs text-muted-foreground">
                              From: <span className="text-foreground/90">{m.name}</span> · {m.email}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{m.message}</p>
                            {m.admin_reply ? (
                              <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                                <p className="text-xs font-medium text-foreground">Admin reply</p>
                                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{m.admin_reply}</p>
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={m.status === "replied" ? "default" : "secondary"}>{m.status}</Badge>
                            <Button size="sm" variant="outline" onClick={() => openReply(m)}>
                              Reply
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Platform Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <div className="text-sm font-medium text-foreground">Create Admin Account</div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} placeholder="Admin name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="admin@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="••••••••" />
                    </div>
                  </div>
                  <Button onClick={createAdminUser} disabled={creatingAdmin} className="gap-2">
                    {creatingAdmin && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create Admin
                  </Button>
                </div>
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="rate" className="flex items-center gap-2">
                      <Percent className="h-4 w-4" /> Commission Rate (%)
                    </Label>
                    <Input
                      id="rate"
                      type="number"
                      min="0"
                      max="50"
                      step="0.1"
                      value={commissionRate}
                      onChange={(e) => setCommissionRate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Applied to both buyer and seller on each transaction</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" /> Platform Settlement Method
                    </Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="telebirr">Telebirr</SelectItem>
                        <SelectItem value="ebirr">eBirr</SelectItem>
                        <SelectItem value="paypal">PayPal</SelectItem>
                        <SelectItem value="bank">Direct Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Platform account for commission/settlement tracking. Buyers still pay via Chapa.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" /> Platform Settlement Account
                    </Label>
                    <Input
                      id="account"
                      placeholder={
                        paymentMethod === "telebirr" ? "Phone number (09...)" :
                        paymentMethod === "ebirr" ? "eBirr phone number" :
                        paymentMethod === "paypal" ? "PayPal email address" :
                        "Bank account number"
                      }
                      value={paymentAccount}
                      onChange={(e) => setPaymentAccount(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Account where platform commission/settlement is tracked. Not used for Chapa payments.</p>
                  </div>
                </div>
                <Button onClick={handleSaveSettings} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users */}
          <TabsContent value="users">
            <Card>
              <CardHeader><CardTitle>Registered Users</CardTitle></CardHeader>
              <CardContent>
                {users.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No users yet</p>
                ) : (
                  <div className="space-y-3">
                    {users.map((u) => (
                      <div key={u.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div>
                          <p className="font-medium text-foreground">{u.full_name || "Unnamed"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">Rep: {u.reputation_score}</Badge>
                          <p className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Courses */}
          <TabsContent value="courses">
            <Card>
              <CardHeader><CardTitle>All Courses</CardTitle></CardHeader>
              <CardContent>
                {courses.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No courses yet</p>
                ) : (
                  <div className="space-y-3">
                    {courses.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div>
                          <p className="font-medium text-foreground">{c.title}</p>
                          <p className="text-xs text-muted-foreground">{c.category} · ETB {Number(c.price).toFixed(2)} · {c.status}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{c.availability}</Badge>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteCourse(c.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader><CardTitle>All Transactions</CardTitle></CardHeader>
              <CardContent>
                {transactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No transactions yet</p>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Total: ETB {Number(t.amount).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Commission: ETB {Number(t.commission_amount).toFixed(2)} · Seller gets: ETB {Number(t.seller_amount).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{t.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions */}
          <TabsContent value="commissions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" /> Commission History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {commissions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No commissions earned yet</p>
                ) : (
                  <div className="space-y-3">
                    {commissions.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Commission: ETB {Number(c.amount).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">Rate: {c.rate}% · {new Date(c.created_at).toLocaleDateString()}</p>
                        </div>
                        <Badge className="bg-success text-success-foreground">ETB {Number(c.amount).toFixed(2)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payouts">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" /> Payout Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                {payoutRequests.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No payout requests yet</p>
                ) : (
                  <div className="space-y-3">
                    {payoutRequests.map((p) => {
                      const seller = (users ?? []).find((u: any) => u.user_id === p.seller_id);
                      const sellerName = seller?.full_name || "Seller";
                      const status = String(p.status || "requested");
                      const isManual = status === "manual_review";
                      const needsAction = status === "requested" || isManual;
                      return (
                        <div key={p.id} className="rounded-lg border border-border p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{sellerName}</p>
                              <p className="text-xs text-muted-foreground">
                                Amount: ETB {Number(p.amount).toFixed(2)} · Method: {p.method || "Not set"}
                              </p>
                              {p.account_name && (
                                <p className="text-xs text-muted-foreground">
                                  Account: {p.account_name} · {p.account_number}
                                </p>
                              )}
                              {isManual && (
                                <p className="text-xs text-warning mt-1">
                                  ⚠️ Manual payout required - seller has no payment method
                                </p>
                              )}
                              {p.admin_note && (
                                <p className="text-xs text-muted-foreground mt-1">Note: {p.admin_note}</p>
                              )}
                              <p className="mt-1 text-xs text-muted-foreground">Requested: {new Date(p.requested_at).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={status === "paid" ? "default" : isManual ? "destructive" : "secondary"}>
                                {isManual ? "manual" : status}
                              </Badge>
                              {/* Only show button for sellers without payment method */}
                              {!p.method && !p.account_number && (
                                <Button
                                  size="sm"
                                  onClick={() => openPayoutDialog(p)}
                                  disabled={status === "paid"}
                                >
                                  Pay Seller
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Payout Confirmation Dialog */}
        <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" /> 
                Contact Seller for Payment Details
              </DialogTitle>
              <DialogDescription>
                This seller has not set up a payment method. Contact them to request payment details.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">Seller:</span>{" "}
                  <span className="font-medium text-foreground">{selectedSeller?.full_name || "Unknown"}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Email:</span>{" "}
                  <span className="font-medium text-foreground">{selectedSeller?.email || "N/A"}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Amount:</span>{" "}
                  <span className="font-medium text-foreground">ETB {Number(selectedPayout?.amount ?? 0).toFixed(2)}</span>
                </p>
                {selectedPayout?.method && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Payment Method:</span>{" "}
                    <span className="font-medium text-foreground">{selectedPayout.method}</span>
                  </p>
                )}
                {selectedPayout?.account_number && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Account:</span>{" "}
                    <span className="font-medium text-foreground">{selectedPayout.account_number}</span>
                  </p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPayoutDialogOpen(false)}>
                Close
              </Button>
              {selectedSeller?.email && (
                <a 
                  href={`mailto:${selectedSeller.email}?subject=Payment Details Required for Payout&body=Hi ${selectedSeller.full_name || "Seller"},%0D%0A%0D%0APlease provide your payment method details to receive your payout of ETB ${Number(selectedPayout?.amount ?? 0).toFixed(2)}.%0D%0A%0D%0AThank you!`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90"
                >
                  <Mail className="h-4 w-4" />
                  Contact Seller
                </a>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reply to message</DialogTitle>
              <DialogDescription>
                This will save your reply in the admin inbox and open your email client to send it to the user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                To: <span className="text-foreground">{activeMessage?.email ?? ""}</span>
              </div>
              <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} className="min-h-[140px]" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReplyOpen(false)} disabled={replying}>Cancel</Button>
              <Button onClick={handleSendReply} disabled={replying}>{replying ? "Saving…" : "Save & Reply"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default AdminDashboard;
