"use client";

/**
 * Lightweight toast system (context + portal). Toasts announce politely to
 * screen readers and auto-dismiss.
 */
import * as React from "react";
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-4), { ...t, id }]);
      setTimeout(() => dismiss(id), t.variant === "error" ? 8000 : 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border border-border-subtle bg-surface p-3.5 shadow-[var(--shadow-md)] animate-slide-up",
              t.variant === "error" && "border-danger/40",
              t.variant === "success" && "border-success/40",
            )}
          >
            <span className="mt-0.5">
              {t.variant === "success" && <CheckCircle2 className="h-4 w-4 text-success" />}
              {t.variant === "error" && <AlertCircle className="h-4 w-4 text-danger" />}
              {t.variant === "warning" && <AlertTriangle className="h-4 w-4 text-warning" />}
              {t.variant === "info" && <Info className="h-4 w-4 text-primary" />}
              {t.variant === "default" && <Info className="h-4 w-4 text-muted" />}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted transition-colors hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
