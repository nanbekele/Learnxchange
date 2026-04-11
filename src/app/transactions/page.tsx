"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Transactions from "@/pages/Transactions";

export default function TransactionsPage() {
  return (
    <ProtectedRoute>
      <Transactions />
    </ProtectedRoute>
  );
}
