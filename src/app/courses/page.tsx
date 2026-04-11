"use client";

import { Suspense } from "react";
import Courses from "@/pages/Courses";

export default function Page() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <Courses />
    </Suspense>
  );
}
