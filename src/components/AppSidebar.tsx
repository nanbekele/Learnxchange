import {
  LayoutDashboard,
  Library,
  BookOpen,
  PlusCircle,
  History,
  User,
  LogOut,
  Search,
  GraduationCap,
  Shield,
  Bell,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Browse Courses", url: "/courses", icon: Search },
  { title: "Create Course", url: "/courses/create", icon: PlusCircle },
  { title: "My Courses", url: "/my-courses", icon: BookOpen },
  { title: "My Learning", url: "/my-learning", icon: Library },
  { title: "Transactions", url: "/transactions", icon: History },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fullName = (user?.user_metadata as any)?.full_name || "User";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (!user) {
      setAvatarUrl(null);
      return;
    }
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setAvatarUrl(data?.avatar_url ?? null);
      });
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <NavLink to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <GraduationCap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold text-sidebar-foreground">
            LearnXchange
          </span>
        </NavLink>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin"
                      end
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      <span>Admin Panel</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/profile"
                    end
                    className="hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  >
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <button
          type="button"
          className="mb-3 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent"
          onClick={() => router.push("/profile")}
        >
          <Avatar className="h-9 w-9">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-display">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-sidebar-foreground">{fullName}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
          </div>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
