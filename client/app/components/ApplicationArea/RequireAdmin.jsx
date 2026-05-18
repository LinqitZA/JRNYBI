import React, { useEffect } from "react";
import { currentUser } from "@/services/auth";
import navigateTo from "@/components/ApplicationArea/navigateTo";

/**
 * JRNYBI: Route guard component that blocks non-admin users from accessing protected routes.
 * Non-admin users are redirected to the home page.
 * Used for /admin/*, /data_sources/*, /groups/*, /users/*, /destinations/* routes.
 */
export default function RequireAdmin({ children }) {
  const isAdmin = currentUser.isAdmin;

  useEffect(() => {
    if (!isAdmin) {
      navigateTo("/", true);
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="container p-t-25 text-center">
        <h3>Access Denied</h3>
        <p>You do not have permission to access this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
