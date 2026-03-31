"use client";

import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } =
    useNotifications();

  const recent = notifications.slice(0, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 w-5 justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                markAllAsRead();
              }}
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
        ) : recent.length === 0 ? (
          <DropdownMenuItem disabled>No notifications</DropdownMenuItem>
        ) : (
          recent.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-1 p-3",
                !n.is_read && "bg-accent/50"
              )}
              onClick={() => {
                if (!n.is_read) markAsRead(n.id);
                if (n.link) router.push(n.link);
              }}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span className="font-medium text-sm">{n.title}</span>
                {!n.is_read && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAsRead(n.id);
                    }}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {n.body && (
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {n.body}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleDateString()}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="justify-center text-sm"
          onClick={() => router.push("/notifications")}
        >
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
