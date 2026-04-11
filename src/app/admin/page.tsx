"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import AdminDashboard from "@/pages/AdminDashboard";

export default function AdminPage() {
  return (
    <ProtectedRoute>
      <AdminDashboard />
    </ProtectedRoute>
  );
}
