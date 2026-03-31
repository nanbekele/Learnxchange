"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import NotificationsPage from "@/pages/Notifications";

export default function NotificationsRoute() {
  return (
    <ProtectedRoute>
      <NotificationsPage />
    </ProtectedRoute>
  );
}
