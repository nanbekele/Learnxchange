import { useEffect, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Star, Upload, Wallet, Plus, Trash2, Loader2, CheckCircle2 } from "lucide-react";

interface PaymentMethod {
  id: string;
  method: string;
  account_name: string;
  account_number: string;
  is_default: boolean;
}

const METHODS = [
  { value: "telebirr", label: "Telebirr" },
  { value: "ebirr", label: "eBirr" },
  { value: "paypal", label: "PayPal" },
  { value: "bank", label: "Direct Bank Transfer" },
];

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fullName = user?.user_metadata?.full_name || "User";
  const initials = fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [reputationScore, setReputationScore] = useState<number>(0);
  const [ratingsCount, setRatingsCount] = useState<number>(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New payment form
  const [newMethod, setNewMethod] = useState("telebirr");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchPaymentMethods();

    supabase
      .from("profiles")
      .select("avatar_url, reputation_score")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setAvatarUrl(data?.avatar_url ?? null);
        setReputationScore(Number(data?.reputation_score ?? 0));
      });

    supabase
      // @ts-expect-error - supabase-js supports count/head options
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("rated_id", user.id)
      .then((res: any) => {
        setRatingsCount(Number(res?.count ?? 0));
      });
  }, [user]);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingAvatar(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
      const filePath = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type || undefined,
        });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("Failed to get public avatar URL");

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl } as any)
        .eq("user_id", user.id);
      if (profErr) throw profErr;

      setAvatarUrl(publicUrl);
      toast({ title: "Profile picture updated" });
    } catch (err: any) {
      toast({ title: "Avatar upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fetchPaymentMethods = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_payment_methods")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: true });
    setPaymentMethods((data as PaymentMethod[]) ?? []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newAccountName.trim() || !newAccountNumber.trim()) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    const isFirst = paymentMethods.length === 0;
    const { error } = await supabase.from("user_payment_methods").insert({
      user_id: user!.id,
      method: newMethod,
      account_name: newAccountName.trim(),
      account_number: newAccountNumber.trim(),
      is_default: isFirst,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Payment method added!" });
      setNewAccountName("");
      setNewAccountNumber("");
      setShowForm(false);
      fetchPaymentMethods();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("user_payment_methods").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Payment method removed" });
      fetchPaymentMethods();
    }
  };

  const handleSetDefault = async (id: string) => {
    // Unset all defaults first, then set the chosen one
    await supabase.from("user_payment_methods").update({ is_default: false } as any).eq("user_id", user!.id);
    await supabase.from("user_payment_methods").update({ is_default: true } as any).eq("id", id);
    fetchPaymentMethods();
    toast({ title: "Default payment method updated" });
  };

  const getPlaceholder = (method: string) => {
    switch (method) {
      case "telebirr": return "Phone number (09...)";
      case "ebirr": return "eBirr phone number";
      case "paypal": return "PayPal email address";
      case "bank": return "Bank account number";
      default: return "Account number";
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="font-display text-3xl font-bold text-foreground">My Profile</h1>

        {/* Avatar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl font-display">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
                <button
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-colors disabled:opacity-60"
                  aria-label="Upload profile picture"
                  title="Upload profile picture"
                >
                  {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="text-center sm:text-left">
                <h2 className="font-display text-xl font-bold text-foreground">{fullName}</h2>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <div className="mt-1 flex items-center gap-1 text-sm text-warning">
                  <Star className="h-4 w-4 fill-current" />
                  <span className="font-medium">{reputationScore.toFixed(1)}</span>
                  <span className="text-muted-foreground">· {ratingsCount === 0 ? "No ratings yet" : `${ratingsCount} rating${ratingsCount === 1 ? "" : "s"}`}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Profile */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Edit Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input defaultValue={fullName} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input defaultValue={user?.email || ""} disabled />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5" /> Payment Methods
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="gap-1">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Set up your payment accounts to buy and sell courses. You need at least one payment method to transact.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add form */}
            {showForm && (
              <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={newMethod} onValueChange={setNewMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Account Name</Label>
                    <Input placeholder="Full name on account" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input placeholder={getPlaceholder(newMethod)} value={newAccountNumber} onChange={(e) => setNewAccountNumber(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAdd} disabled={saving} size="sm" className="gap-1">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Existing methods */}
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : paymentMethods.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">
                No payment methods added yet. Add one to start buying and selling courses.
              </p>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((pm) => {
                  const label = METHODS.find((m) => m.value === pm.method)?.label || pm.method;
                  return (
                    <div key={pm.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <Wallet className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{label}</p>
                            {pm.is_default && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                <CheckCircle2 className="h-3 w-3" /> Default
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{pm.account_name} · {pm.account_number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!pm.is_default && (
                          <Button size="sm" variant="ghost" onClick={() => handleSetDefault(pm.id)} className="text-xs">
                            Set Default
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(pm.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Profile;
