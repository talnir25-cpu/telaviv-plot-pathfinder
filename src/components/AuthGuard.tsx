import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AuthLoadingScreen } from "@/components/AuthLoadingScreen";

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { session, ready } = useAuth();

  if (!ready) return <AuthLoadingScreen message="בודק הרשאות..." />;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};
