import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { session, ready } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};
