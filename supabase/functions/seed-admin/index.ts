import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminEmail = (Deno.env.get("ADMIN_EMAIL") ?? "nanbekele3@gmail.com").trim().toLowerCase();
    const adminPassword = Deno.env.get("ADMIN_PASSWORD") ?? "";

    // Check if admin already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingAdmin = existingUsers?.users?.find((u) => u.email === adminEmail);

    let adminUserId: string;

    if (existingAdmin) {
      adminUserId = existingAdmin.id;
    } else {
      if (!adminPassword) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Admin user does not exist. Set ADMIN_PASSWORD env var (and optionally ADMIN_EMAIL) then re-run to create the admin user, or sign up normally with the admin email.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Create admin user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { full_name: "Admin" },
      });
      if (createError) throw createError;
      adminUserId = newUser.user.id;
    }

    // Assign admin role
    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({ user_id: adminUserId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleError) throw roleError;

    return new Response(
      JSON.stringify({ success: true, message: "Admin user seeded", email: adminEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
