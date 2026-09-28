"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Renders a GridFS image through the authenticated `/api/files/:id` route. */
export function AuthImage({
  fileId,
  localUrl,
  className,
}: {
  fileId?: string | null;
  localUrl?: string | null;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(localUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (localUrl) {
      setSrc(localUrl);
      setFailed(false);
      return;
    }
    if (!fileId) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    void (async () => {
      try {
        const res = await fetch(`/api/files/${fileId}`, { credentials: "include" });
        if (!res.ok) throw new Error("load_failed");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, localUrl]);

  if (failed) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageIcon className="size-8 opacity-50" />
      </div>
    );
  }
  if (!src) {
    return <div className={cn("animate-pulse bg-muted", className)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={className} />
  );
}
