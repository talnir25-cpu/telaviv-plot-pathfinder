import { Building2, Loader2 } from "lucide-react";

export const AuthLoadingScreen = ({ message = "טוען..." }: { message?: string }) => (
  <div
    className="min-h-screen bg-gradient-hero flex items-center justify-center p-4"
    dir="rtl"
    role="status"
    aria-live="polite"
  >
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Building2 className="h-7 w-7" />
      </div>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  </div>
);
