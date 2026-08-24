"use client";

import { Suspense } from "react";
import SettingsClient from "@/components/settings/settings-client";
import { ar } from "@/i18n/ar";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div>{ar.loading}</div>}>
      <SettingsClient />
    </Suspense>
  );
}
