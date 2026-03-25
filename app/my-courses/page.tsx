"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import MyCourses from "@/pages/MyCourses";

export default function MyCoursesPage() {
  return (
    <ProtectedRoute>
      <MyCourses />
    </ProtectedRoute>
  );
}
