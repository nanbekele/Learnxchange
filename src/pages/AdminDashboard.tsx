import { useEffect, useState, useMemo } from "react";
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
  Search, Filter, X, ArrowUpDown, Calendar, Tag, Download
} from "lucide-react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
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

  const [stats, setStats] = useState({ totalUsers: 0, totalCourses: 0, totalTransactions: 0, totalCommissions: 0, platformBalance: 0 });
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
  const [sellersWithoutPayout, setSellersWithoutPayout] = useState<any[]>([]);
  const [reputationByUserId, setReputationByUserId] = useState<Record<string, number>>({});
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [activeMessage, setActiveMessage] = useState<any | null>(null);
  const [replying, setReplying] = useState(false);

  // Payout confirmation dialog
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<Tables<"payout_requests"> | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  // Courses filters
  const [courseSearch, setCourseSearch] = useState("");
  const [courseCategoryFilter, setCourseCategoryFilter] = useState<string>("all");
  const [courseStatusFilter, setCourseStatusFilter] = useState<string>("all");
  const [courseAvailabilityFilter, setCourseAvailabilityFilter] = useState<string>("all");
  const [courseSortBy, setCourseSortBy] = useState<"newest" | "price_high" | "price_low">("newest");

  // Transactions filters
  const [txSearch, setTxSearch] = useState("");
  const [txStatusFilter, setTxStatusFilter] = useState<string>("all");
  const [txSortBy, setTxSortBy] = useState<"newest" | "amount_high" | "amount_low">("newest");

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
    const [usersRes, coursesRes, txRes, commRes, payoutRes, settingsRes, msgRes, balanceRes, courseRatingsRes, adminRolesRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("courses").select("*").order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }),
      supabase.from("commissions").select("*").order("created_at", { ascending: false }),
      supabase.from("payout_requests").select("*").order("requested_at", { ascending: false }),
      supabase.from("platform_settings").select("*"),
      supabase.from("contact_messages").select("*").order("created_at", { ascending: false }),
      supabase.from("platform_balance").select("balance").order("last_updated", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("course_ratings").select("score, courses(user_id)"),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
    ]);

    setUsers(usersRes.data ?? []);
    setCourses(coursesRes.data ?? []);
    setTransactions(txRes.data ?? []);
    setCommissions(commRes.data ?? []);
    setPayoutRequests(payoutRes.data ?? []);
    setMessages(msgRes.data ?? []);

    if (!adminRolesRes?.error) {
      const next = new Set<string>();
      (adminRolesRes.data ?? []).forEach((r: any) => {
        if (r?.user_id) next.add(String(r.user_id));
      });
      setAdminUserIds(next);
    } else {
      setAdminUserIds(new Set());
    }

    // Compute reputation from course ratings (avg score for each course owner)
    const repTotals: Record<string, { sum: number; count: number }> = {};
    const ratingRows = (courseRatingsRes.data ?? []) as Array<{ score: any; courses?: { user_id?: string | null } | null }>;
    for (const r of ratingRows) {
      const ownerId = r.courses?.user_id ?? null;
      if (!ownerId) continue;
      const score = Number(r.score ?? 0);
      if (!repTotals[ownerId]) repTotals[ownerId] = { sum: 0, count: 0 };
      repTotals[ownerId].sum += score;
      repTotals[ownerId].count += 1;
    }
    const repMap: Record<string, number> = {};
    for (const [ownerId, t] of Object.entries(repTotals)) {
      repMap[ownerId] = t.count > 0 ? t.sum / t.count : 0;
    }
    setReputationByUserId(repMap);

    const totalComm = (commRes.data ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
    const platformBalance = balanceRes.error ? 0 : Number(balanceRes.data?.balance ?? 0);
    setStats({
      totalUsers: (usersRes.data ?? []).length,
      totalCourses: (coursesRes.data ?? []).length,
      totalTransactions: (txRes.data ?? []).length,
      totalCommissions: totalComm,
      platformBalance,
    });

    const settings = settingsRes.data ?? [];
    const rateRow = settings.find((s: any) => s.key === "commission_rate");
    const methodRow = settings.find((s: any) => s.key === "payment_method");
    const accountRow = settings.find((s: any) => s.key === "payment_account");
    if (rateRow) setCommissionRate(rateRow.value);
    if (methodRow) setPaymentMethod(methodRow.value);
    if (accountRow) setPaymentAccount(accountRow.value);

    // Fetch sellers without payout methods who have sales
    const sellersWithSales = Array.from(new Set((txRes.data ?? [])
      .filter((t: any) => t.status === "completed" && t.seller_id)
      .map((t: any) => t.seller_id)));
    
    if (sellersWithSales.length > 0) {
      const { data: paymentMethods } = await supabase
        .from("user_payment_methods")
        .select("user_id")
        .eq("is_default", true);
      
      const sellersWithMethods = new Set((paymentMethods ?? []).map((p: any) => p.user_id));
      const sellersMissingPayout = sellersWithSales.filter((id: string) => !sellersWithMethods.has(id));
      
      if (sellersMissingPayout.length > 0) {
        const missingSellers = (usersRes.data ?? []).filter((u: any) => sellersMissingPayout.includes(u.user_id));
        setSellersWithoutPayout(missingSellers);
      } else {
        setSellersWithoutPayout([]);
      }
    } else {
      setSellersWithoutPayout([]);
    }

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

      const res = await fetch("/api/admin/contact-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messageId: activeMessage.id,
          replyText: replyText.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(json?.error ?? "Failed to send reply"));
      }

      toast({ title: "Reply sent", description: "Email sent to the user and reply saved." });
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
      if (e1) throw e1;
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

  // Report generation functions
  const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const generateCoursesReport = () => {
    const headers = ["ID", "Title", "Category", "Price (ETB)", "Status", "Availability", "Created At"];
    const rows = filteredCourses.map((c) => [
      c.id,
      c.title,
      c.category,
      Number(c.price).toFixed(2),
      c.status,
      c.availability,
      new Date(c.created_at).toLocaleString(),
    ]);
    downloadCSV(`courses_report_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
    toast({ title: "Courses report downloaded" });
  };

  const generateTransactionsReport = () => {
    const headers = ["ID", "Reference", "Amount (ETB)", "Commission (ETB)", "Seller Amount (ETB)", "Status", "Created At"];
    const rows = filteredTransactions.map((t) => [
      t.id,
      t.tx_ref || "-",
      Number(t.amount).toFixed(2),
      Number(t.commission_amount).toFixed(2),
      Number(t.seller_amount).toFixed(2),
      t.status,
      new Date(t.created_at).toLocaleString(),
    ]);
    downloadCSV(`transactions_report_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
    toast({ title: "Transactions report downloaded" });
  };

  const generateUsersReport = () => {
    const headers = ["ID", "Full Name", "Email", "Reputation Score", "Created At"];
    const rows = users.map((u) => [
      u.user_id || u.id,
      u.full_name || "Unnamed",
      u.email,
      (reputationByUserId[String(u.user_id || u.id)] ?? Number(u.reputation_score ?? 0)).toFixed(1),
      new Date(u.created_at).toLocaleString(),
    ]);
    downloadCSV(`users_report_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
    toast({ title: "Users report downloaded" });
  };

  const generatePayoutsReport = () => {
    const headers = ["ID", "Seller", "Amount (ETB)", "Method", "Account Name", "Account Number", "Status", "Requested At"];
    const rows = payoutRequests.map((p) => {
      const seller = users.find((u: any) => u.user_id === p.seller_id);
      return [
        p.id,
        seller?.full_name || "Unknown",
        Number(p.amount).toFixed(2),
        p.method || "-",
        p.account_name || "-",
        p.account_number || "-",
        p.status,
        new Date(p.requested_at).toLocaleString(),
      ];
    });
    downloadCSV(`payouts_report_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
    toast({ title: "Payouts report downloaded" });
  };

  const generateAllInOneReport = () => {
    const dateStr = new Date().toISOString().split("T")[0];
    const timestamp = Date.now();
    
    // Build comprehensive CSV with all sections
    let csvContent = "LEARNXCHANGE PLATFORM MASTER REPORT\n";
    csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;
    
    // Section 1: Platform Summary
    csvContent += "PLATFORM SUMMARY\n";
    csvContent += "Metric,Value\n";
    csvContent += `Total Users,${stats.totalUsers}\n`;
    csvContent += `Total Courses,${stats.totalCourses}\n`;
    csvContent += `Total Transactions,${stats.totalTransactions}\n`;
    csvContent += `Total Commissions Earned,ETB ${stats.totalCommissions.toFixed(2)}\n`;
    csvContent += `Total Payout Requests,${payoutRequests.length}\n`;
    csvContent += `Total Messages,${messages.length}\n\n`;
    
    // Section 2: Users
    csvContent += "USERS\n";
    csvContent += "ID,Full Name,Email,Reputation Score,Created At\n";
    users.forEach((u) => {
      const rep = reputationByUserId[String(u.user_id || u.id)] ?? Number(u.reputation_score ?? 0);
      csvContent += `"${u.user_id || u.id}","${(u.full_name || "Unnamed").replace(/"/g, '""')}","${(u.email || "").replace(/"/g, '""')}",${Number(rep).toFixed(1)},"${new Date(u.created_at).toLocaleString()}"\n`;
    });
    csvContent += "\n";
    
    // Section 3: Courses
    csvContent += "COURSES\n";
    csvContent += "ID,Title,Category,Price (ETB),Status,Availability,Created At\n";
    courses.forEach((c) => {
      csvContent += `"${c.id}","${(c.title || "").replace(/"/g, '""')}","${(c.category || "").replace(/"/g, '""')}",${Number(c.price || 0).toFixed(2)},"${c.status || ""}","${c.availability || ""}","${new Date(c.created_at).toLocaleString()}"\n`;
    });
    csvContent += "\n";
    
    // Section 4: Transactions
    csvContent += "TRANSACTIONS\n";
    csvContent += "ID,Reference,Amount (ETB),Commission (ETB),Seller Amount (ETB),Status,Created At\n";
    transactions.forEach((t) => {
      csvContent += `"${t.id}","${t.tx_ref || "-"}",${Number(t.amount || 0).toFixed(2)},${Number(t.commission_amount || 0).toFixed(2)},${Number(t.seller_amount || 0).toFixed(2)},"${t.status || ""}","${new Date(t.created_at).toLocaleString()}"\n`;
    });
    csvContent += "\n";
    
    // Section 5: Commissions
    csvContent += "COMMISSIONS\n";
    csvContent += "ID,Amount (ETB),Rate (%),Transaction ID,Created At\n";
    commissions.forEach((c) => {
      csvContent += `"${c.id}",${Number(c.amount || 0).toFixed(2)},${c.rate || 0},"${c.transaction_id || ""}","${new Date(c.created_at).toLocaleString()}"\n`;
    });
    csvContent += "\n";
    
    // Section 6: Payout Requests
    csvContent += "PAYOUT REQUESTS\n";
    csvContent += "ID,Seller,Amount (ETB),Method,Account Name,Account Number,Status,Requested At\n";
    payoutRequests.forEach((p) => {
      const seller = users.find((u: any) => u.user_id === p.seller_id);
      csvContent += `"${p.id}","${(seller?.full_name || "Unknown").replace(/"/g, '""')}",${Number(p.amount || 0).toFixed(2)},"${p.method || "-"}","${(p.account_name || "-").replace(/"/g, '""')}","${p.account_number || "-"}","${p.status || ""}","${new Date(p.requested_at).toLocaleString()}"\n`;
    });
    csvContent += "\n";
    
    // Section 7: Contact Messages
    csvContent += "CONTACT MESSAGES\n";
    csvContent += "ID,Name,Email,Subject,Status,Has Reply,Created At\n";
    messages.forEach((m) => {
      csvContent += `"${m.id}","${(m.name || "").replace(/"/g, '""')}","${(m.email || "").replace(/"/g, '""')}","${(m.subject || "").replace(/"/g, '""')}","${m.status || ""}",${m.admin_reply ? "Yes" : "No"},"${new Date(m.created_at).toLocaleString()}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `learnxchange_master_report_${dateStr}_${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
    toast({ title: "Master report downloaded", description: "Complete platform data exported" });
  };

  // Filtered courses
  const filteredCourses = useMemo(() => {
    let result = [...courses];
    
    if (courseSearch.trim()) {
      const term = courseSearch.toLowerCase();
      result = result.filter((c) => 
        c.title?.toLowerCase().includes(term) || 
        c.category?.toLowerCase().includes(term)
      );
    }
    
    if (courseCategoryFilter !== "all") {
      result = result.filter((c) => c.category === courseCategoryFilter);
    }
    
    if (courseStatusFilter !== "all") {
      result = result.filter((c) => c.status === courseStatusFilter);
    }
    
    if (courseAvailabilityFilter !== "all") {
      result = result.filter((c) => c.availability === courseAvailabilityFilter);
    }
    
    // Sort
    result.sort((a, b) => {
      switch (courseSortBy) {
        case "price_high":
          return Number(b.price ?? 0) - Number(a.price ?? 0);
        case "price_low":
          return Number(a.price ?? 0) - Number(b.price ?? 0);
        case "newest":
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
    });
    
    return result;
  }, [courses, courseSearch, courseCategoryFilter, courseStatusFilter, courseAvailabilityFilter, courseSortBy]);

  // Get unique categories for filter dropdown
  const courseCategories = useMemo(() => {
    const cats = new Set(courses.map((c) => c.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [courses]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];
    
    if (txSearch.trim()) {
      const term = txSearch.toLowerCase();
      result = result.filter((t) => 
        t.id?.toLowerCase().includes(term) ||
        t.tx_ref?.toLowerCase().includes(term) ||
        t.buyer_id?.toLowerCase().includes(term) ||
        t.seller_id?.toLowerCase().includes(term)
      );
    }
    
    if (txStatusFilter !== "all") {
      result = result.filter((t) => t.status === txStatusFilter);
    }
    
    // Sort
    result.sort((a, b) => {
      switch (txSortBy) {
        case "amount_high":
          return Number(b.amount ?? 0) - Number(a.amount ?? 0);
        case "amount_low":
          return Number(a.amount ?? 0) - Number(b.amount ?? 0);
        case "newest":
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
    });
    
    return result;
  }, [transactions, txSearch, txStatusFilter, txSortBy]);

  const analytics = useMemo(() => {
    const DAYS = 14;
    const dayMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    const start = new Date(today.getTime() - (DAYS - 1) * dayMs);

    const toDayKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };

    const dayLabel = (key: string) => {
      const [y, m, d] = key.split("-").map((x) => Number(x));
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
    };

    const days: { key: string; label: string; transactions: number; volume: number; commissions: number; newUsers: number }[] = [];
    for (let i = 0; i < DAYS; i++) {
      const dt = new Date(start.getTime() + i * dayMs);
      const key = toDayKey(dt);
      days.push({ key, label: dayLabel(key), transactions: 0, volume: 0, commissions: 0, newUsers: 0 });
    }
    const daysByKey: Record<string, (typeof days)[number]> = {};
    days.forEach((d) => {
      daysByKey[d.key] = d;
    });

    (transactions ?? []).forEach((t: any) => {
      if (!t?.created_at) return;
      const dt = new Date(String(t.created_at));
      const key = toDayKey(dt);
      const bucket = daysByKey[key];
      if (!bucket) return;
      bucket.transactions += 1;
      bucket.volume += Number(t.amount ?? 0);
      bucket.commissions += Number(t.commission_amount ?? 0);
    });

    (users ?? []).forEach((u: any) => {
      if (!u?.created_at) return;
      const dt = new Date(String(u.created_at));
      const key = toDayKey(dt);
      const bucket = daysByKey[key];
      if (!bucket) return;
      bucket.newUsers += 1;
    });

    const txStatusCount: Record<string, number> = {};
    (transactions ?? []).forEach((t: any) => {
      const s = String(t?.status ?? "unknown");
      txStatusCount[s] = (txStatusCount[s] ?? 0) + 1;
    });
    const txStatusData = Object.entries(txStatusCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const categoryCount: Record<string, number> = {};
    (courses ?? []).forEach((c: any) => {
      const cat = String(c?.category ?? "other");
      categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
    });
    const categoryData = Object.entries(categoryCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const adminCount = (users ?? []).filter((u: any) => adminUserIds.has(String(u?.user_id))).length;
    const regularCount = Math.max(0, (users ?? []).length - adminCount);
    const roleBreakdown = [
      { name: "admin", value: adminCount },
      { name: "user", value: regularCount },
    ];

    const sellerIds = new Set<string>();
    (courses ?? []).forEach((c: any) => {
      if (c?.user_id) sellerIds.add(String(c.user_id));
    });
    const buyerIds = new Set<string>();
    (transactions ?? []).forEach((t: any) => {
      if (t?.buyer_id) buyerIds.add(String(t.buyer_id));
    });
    const sellerCount = sellerIds.size;
    const buyerCount = buyerIds.size;
    const sellerBuyerBreakdown = [
      { name: "sellers", value: sellerCount },
      { name: "buyers", value: buyerCount },
    ];

    return {
      days,
      txStatusData,
      categoryData,
      roleBreakdown,
      sellerBuyerBreakdown,
      totals: {
        volume: (transactions ?? []).reduce((s: number, t: any) => s + Number(t?.amount ?? 0), 0),
        commissions: (transactions ?? []).reduce((s: number, t: any) => s + Number(t?.commission_amount ?? 0), 0),
      },
    };
  }, [transactions, courses, users, adminUserIds]);

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-primary" },
            { label: "Total Courses", value: stats.totalCourses, icon: BookOpen, color: "text-accent" },
            { label: "Total Transactions", value: stats.totalTransactions, icon: ShoppingCart, color: "text-warning" },
            { label: "Commission Earned", value: `ETB ${stats.totalCommissions.toFixed(2)}`, icon: DollarSign, color: "text-success" },
            { label: "Platform Balance", value: `ETB ${stats.platformBalance.toFixed(2)}`, icon: Wallet, color: stats.platformBalance > 0 ? "text-primary" : "text-destructive" },
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

        <Tabs defaultValue="analytics" className="space-y-4">
          <TabsList>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="messages">Messages ({messages.filter((m: any) => String(m?.status ?? "open") !== "replied").length})</TabsTrigger>
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
            <TabsTrigger value="courses">Courses ({courses.length})</TabsTrigger>
            <TabsTrigger value="transactions">Transactions ({transactions.length})</TabsTrigger>
            <TabsTrigger value="commissions">Commissions ({commissions.length})</TabsTrigger>
            <TabsTrigger value="payouts">Payouts ({payoutRequests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>New Users (Last 14 Days)</span>
                    <span className="text-sm font-normal text-muted-foreground">Total: {analytics.days.reduce((s, d) => s + d.newUsers, 0)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    className="h-[260px] w-full"
                    config={{
                      newUsers: { label: "New Users", color: "hsl(var(--primary))" },
                    }}
                  >
                    <LineChart data={analytics.days} margin={{ left: 12, right: 12 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} width={36} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="newUsers" stroke="var(--color-newUsers)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Users Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ChartContainer
                      className="h-[240px] w-full"
                      config={{
                        admin: { label: "admin", color: "hsl(var(--primary))" },
                        user: { label: "user", color: "hsl(var(--muted-foreground))" },
                      }}
                    >
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                        <Pie data={analytics.roleBreakdown} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} strokeWidth={1}>
                          {analytics.roleBreakdown.map((d, i) => {
                            const key = String(d.name).toLowerCase();
                            const colorVar = `--color-${key}`;
                            return <Cell key={`${d.name}-${i}`} fill={`var(${colorVar}, hsl(var(--primary)))`} />;
                          })}
                        </Pie>
                        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                      </PieChart>
                    </ChartContainer>

                    <ChartContainer
                      className="h-[240px] w-full"
                      config={{
                        sellers: { label: "sellers", color: "hsl(var(--accent))" },
                        buyers: { label: "buyers", color: "hsl(var(--success))" },
                      }}
                    >
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                        <Pie data={analytics.sellerBuyerBreakdown} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} strokeWidth={1}>
                          {analytics.sellerBuyerBreakdown.map((d, i) => {
                            const key = String(d.name).toLowerCase();
                            const colorVar = `--color-${key}`;
                            return <Cell key={`${d.name}-${i}`} fill={`var(${colorVar}, hsl(var(--primary)))`} />;
                          })}
                        </Pie>
                        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                      </PieChart>
                    </ChartContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Transactions (Last 14 Days)</span>
                    <span className="text-sm font-normal text-muted-foreground">Total: {analytics.days.reduce((s, d) => s + d.transactions, 0)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    className="h-[260px] w-full"
                    config={{
                      transactions: { label: "Transactions", color: "hsl(var(--primary))" },
                    }}
                  >
                    <LineChart data={analytics.days} margin={{ left: 12, right: 12 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} width={36} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="transactions" stroke="var(--color-transactions)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Volume & Commissions (Last 14 Days)</span>
                    <span className="text-sm font-normal text-muted-foreground">ETB {analytics.totals.volume.toFixed(2)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    className="h-[260px] w-full"
                    config={{
                      volume: { label: "Volume", color: "hsl(var(--accent))" },
                      commissions: { label: "Commissions", color: "hsl(var(--success))" },
                    }}
                  >
                    <BarChart data={analytics.days} margin={{ left: 12, right: 12 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis width={52} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="volume" fill="var(--color-volume)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="commissions" fill="var(--color-commissions)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Transactions by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    className="h-[260px] w-full"
                    config={{
                      completed: { label: "completed", color: "hsl(var(--success))" },
                      pending: { label: "pending", color: "hsl(var(--warning))" },
                      failed: { label: "failed", color: "hsl(var(--destructive))" },
                      unknown: { label: "unknown", color: "hsl(var(--muted-foreground))" },
                    }}
                  >
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                      <Pie data={analytics.txStatusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} strokeWidth={1}>
                        {analytics.txStatusData.map((d, i) => {
                          const key = String(d.name).toLowerCase();
                          const colorVar = `--color-${key}`;
                          return <Cell key={`${d.name}-${i}`} fill={`var(${colorVar}, hsl(var(--primary)))`} />;
                        })}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Course Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    className="h-[260px] w-full"
                    config={{
                      categories: { label: "Categories", color: "hsl(var(--primary))" },
                    }}
                  >
                    <BarChart data={analytics.categoryData} layout="vertical" margin={{ left: 24, right: 12 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={120} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" fill="var(--color-categories)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

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
                {/* All-in-One Report */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                  <div className="text-sm font-medium text-foreground">Generate Master Report</div>
                  <p className="text-xs text-muted-foreground">
                    Download a comprehensive CSV report containing all platform data: users, courses, transactions, commissions, payouts, and messages.
                  </p>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={generateAllInOneReport}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Download className="h-4 w-4" /> Download All-in-One Report
                  </Button>
                </div>

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
                <div className="grid gap-6 md:grid-cols-1">
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
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Registered Users</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={generateUsersReport}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" /> Download CSV
                  </Button>
                </CardTitle>
              </CardHeader>
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
                          <Badge variant="secondary">
                            Rep: {(reputationByUserId[String(u.user_id || u.id)] ?? Number(u.reputation_score ?? 0)).toFixed(1)}
                          </Badge>
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
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>All Courses</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Showing {filteredCourses.length} of {courses.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <Filter className="h-4 w-4" /> Filters
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Search */}
                    <div className="space-y-2">
                      <Label className="text-xs flex items-center gap-1">
                        <Search className="h-3 w-3" /> Search
                      </Label>
                      <div className="relative">
                        <Input
                          placeholder="Search courses..."
                          value={courseSearch}
                          onChange={(e) => setCourseSearch(e.target.value)}
                          className="pr-8"
                        />
                        {courseSearch && (
                          <button
                            onClick={() => setCourseSearch("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Category Filter */}
                    <div className="space-y-2">
                      <Label className="text-xs flex items-center gap-1">
                        <Tag className="h-3 w-3" /> Category
                      </Label>
                      <Select value={courseCategoryFilter} onValueChange={setCourseCategoryFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {courseCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Sort */}
                    <div className="space-y-2">
                      <Label className="text-xs flex items-center gap-1">
                        <ArrowUpDown className="h-3 w-3" /> Sort By
                      </Label>
                      <Select value={courseSortBy} onValueChange={(v) => setCourseSortBy(v as any)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest First</SelectItem>
                          <SelectItem value="price_high">Price: High to Low</SelectItem>
                          <SelectItem value="price_low">Price: Low to High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Generate Report */}
                    <div className="space-y-2">
                      <Label className="text-xs">Report</Label>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={generateCoursesReport}
                        className="w-full gap-2"
                      >
                        <Download className="h-4 w-4" /> Download CSV
                      </Button>
                    </div>
                  </div>
                  
                  {/* Clear Filters */}
                  {(courseSearch || courseCategoryFilter !== "all" || courseAvailabilityFilter !== "all") && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCourseSearch("");
                          setCourseCategoryFilter("all");
                          setCourseStatusFilter("all");
                          setCourseAvailabilityFilter("all");
                        }}
                        className="text-xs"
                      >
                        Clear all filters
                      </Button>
                    </div>
                  )}
                </div>

                {/* Course List */}
                {filteredCourses.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {courses.length === 0 ? "No courses yet" : "No courses match your filters"}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredCourses.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors">
                        <div>
                          <p className="font-medium text-foreground">{c.title}</p>
                          <p className="text-xs text-muted-foreground">{c.category} · ETB {Number(c.price).toFixed(2)}</p>
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
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>All Transactions</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Showing {filteredTransactions.length} of {transactions.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <Filter className="h-4 w-4" /> Filters
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Status Filter */}
                    <div className="space-y-2">
                      <Label className="text-xs">Status</Label>
                      <Select value={txStatusFilter} onValueChange={setTxStatusFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="refunded">Refunded</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Sort */}
                    <div className="space-y-2">
                      <Label className="text-xs flex items-center gap-1">
                        <ArrowUpDown className="h-3 w-3" /> Sort By
                      </Label>
                      <Select value={txSortBy} onValueChange={(v) => setTxSortBy(v as any)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest First</SelectItem>
                          <SelectItem value="amount_high">Amount: High to Low</SelectItem>
                          <SelectItem value="amount_low">Amount: Low to High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Generate Report */}
                    <div className="space-y-2">
                      <Label className="text-xs">Report</Label>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={generateTransactionsReport}
                        className="w-full gap-2"
                      >
                        <Download className="h-4 w-4" /> Download CSV
                      </Button>
                    </div>
                  </div>
                  
                  {/* Clear Filters */}
                  {txStatusFilter !== "all" && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTxStatusFilter("all");
                        }}
                        className="text-xs"
                      >
                        Clear all filters
                      </Button>
                    </div>
                  )}
                </div>

                {/* Transaction List */}
                {filteredTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {transactions.length === 0 ? "No transactions yet" : "No transactions match your filters"}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredTransactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Total: ETB {Number(t.amount).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Commission: ETB {Number(t.commission_amount).toFixed(2)} · Seller gets: ETB {Number(t.seller_amount).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(t.created_at).toLocaleDateString()} · Ref: {t.tx_ref || t.id.slice(0, 8)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={t.status === "completed" ? "default" : t.status === "failed" ? "destructive" : "outline"}>
                            {t.status}
                          </Badge>
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
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" /> Payout Requests (Telebirr Only)
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={generatePayoutsReport}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" /> Download CSV
                  </Button>
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
                                Amount: ETB {Number(p.amount).toFixed(2)} · Method: {p.method || "Not set (Telebirr required)"}
                              </p>
                              {p.account_name && (
                                <p className="text-xs text-muted-foreground">
                                  Account: {p.account_name} · {p.account_number}
                                </p>
                              )}
                              {isManual && (
                                <p className="text-xs text-warning mt-1">
                                  ⚠️ Manual payout required - seller has no Telebirr number set up
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
                              {needsAction && (
                                <Button size="sm" onClick={() => openPayoutDialog(p)}>
                                  {isManual ? "Review" : "Pay"}
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

            {/* Sellers Without Payout Methods */}
            {sellersWithoutPayout.length > 0 && (
              <Card className="mt-6 border-warning/30 bg-warning/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-warning">
                    <Mail className="h-5 w-5" />
                    Sellers Without Payout Methods ({sellersWithoutPayout.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    These sellers have made sales but haven't set up their Telebirr withdrawal account yet. Contact them to set up their payout method.
                  </p>
                  <div className="space-y-3">
                    {sellersWithoutPayout.map((seller) => (
                      <div key={seller.user_id} className="rounded-lg border border-warning/20 bg-background p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">{seller.full_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">User ID: {seller.user_id}</p>
                          </div>
                          <a
                            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(String(seller.email || ""))}&su=${encodeURIComponent("Set Up Your Payout Method - LearnXchange")}&body=${encodeURIComponent(
                              `Hi ${seller.full_name || "Seller"},\n\nWe noticed you haven't set up your Telebirr withdrawal account yet. Please add your payout method in your profile so you can receive your earnings from course sales.\n\nGo to: ${typeof window !== "undefined" ? window.location.origin : ""}/profile\n\nThank you!`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-warning rounded-md hover:bg-warning/90"
                          >
                            <Mail className="h-4 w-4" />
                            Contact via Email
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Payout Action Dialog */}
        <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" /> 
                Payout Request
              </DialogTitle>
              <DialogDescription>
                Review the payout details, then mark it as paid after you complete the transfer.
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
                <p className="text-sm">
                  <span className="text-muted-foreground">Payment Method:</span>{" "}
                  <span className="font-medium text-foreground">{selectedPayout?.method || "Not set"}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Account:</span>{" "}
                  <span className="font-medium text-foreground">{selectedPayout?.account_number || "Not set"}</span>
                </p>
                {!selectedPayout?.account_number ? (
                  <p className="text-xs text-warning mt-1">
                    Seller has no Telebirr number saved. You can contact them to collect payment details.
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPayoutDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={confirmMarkPayoutPaid} disabled={markingPaid || !selectedPayout}>
                {markingPaid ? "Marking…" : "Mark as Paid"}
              </Button>
              {selectedSeller?.email && (
                <a 
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(String(selectedSeller.email || ""))}&su=${encodeURIComponent("Payment Details Required for Payout")}&body=${encodeURIComponent(
                    `Hi ${selectedSeller.full_name || "Seller"},\n\nPlease provide your payment method details to receive your payout of ETB ${Number(selectedPayout?.amount ?? 0).toFixed(2)}.\n\nThank you!`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
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
                This will save your reply in the admin inbox and automatically email it to the user.
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
