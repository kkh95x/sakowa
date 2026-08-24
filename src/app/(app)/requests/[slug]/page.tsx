"use client";

import { Suspense } from "react";
import RequestOrdersClient from "@/components/orders/request-orders-client";
import { ar } from "@/i18n/ar";

export default function RequestOrdersPage() {
  return (
    <Suspense fallback={<div>{ar.loading}</div>}>
      <RequestOrdersClient />
    </Suspense>
  );
}
