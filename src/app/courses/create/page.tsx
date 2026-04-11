"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import CreateCourse from "@/pages/CreateCourse";

export default function CreateCoursePage() {
  return (
    <ProtectedRoute>
      <CreateCourse />
    </ProtectedRoute>
  );
}
