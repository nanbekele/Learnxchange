"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import MyLearning from "@/pages/MyLearning";

export default function MyLearningPage() {
  return (
    <ProtectedRoute>
      <MyLearning />
    </ProtectedRoute>
  );
}
