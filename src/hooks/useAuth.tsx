import { useContext } from "react";
import { AuthContext } from "@/hooks/auth-context";

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
};

export { AuthProvider } from "@/hooks/AuthProvider";
