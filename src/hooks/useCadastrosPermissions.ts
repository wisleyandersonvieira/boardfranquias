import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CadastrosPermissionLevel = 'none' | 'read' | 'write' | 'admin';

export const useCadastrosPermissions = () => {
  const [permissionLevel, setPermissionLevel] = useState<CadastrosPermissionLevel>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        console.log("[CadastrosPermissions] User:", user?.id, user?.email);
        
        if (!user) {
          console.log("[CadastrosPermissions] No user found, setting none");
          setPermissionLevel('none');
          setLoading(false);
          return;
        }

        // Check user role
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, profile_id")
          .eq("id", user.id)
          .single();

        console.log("[CadastrosPermissions] Profile:", profile, "Error:", profileError);

        if (!profile) {
          console.log("[CadastrosPermissions] No profile found, setting none");
          setPermissionLevel('none');
          setLoading(false);
          return;
        }

        // Admins have full access
        if (profile.role === 'admin') {
          console.log("[CadastrosPermissions] User is admin, setting admin");
          setPermissionLevel('admin');
          setLoading(false);
          return;
        }

        // Check profile-based permissions first
        if (profile.profile_id) {
          console.log("[CadastrosPermissions] Checking profile permissions for profile_id:", profile.profile_id);
          
          const { data: profilePermissions, error: permError } = await supabase
            .from("profile_permissions")
            .select("permission")
            .eq("profile_id", profile.profile_id)
            .eq("module", "cadastros");

          console.log("[CadastrosPermissions] Profile permissions:", profilePermissions, "Error:", permError);

          if (profilePermissions && profilePermissions.length > 0) {
            const perms = profilePermissions.map(p => p.permission);
            console.log("[CadastrosPermissions] Permissions array:", perms);
            
            // Check if disabled - user should not see the module
            if (perms.includes('disabled')) {
              console.log("[CadastrosPermissions] Found 'disabled', setting none");
              setPermissionLevel('none');
              setLoading(false);
              return;
            }
            if (perms.includes('admin')) {
              console.log("[CadastrosPermissions] Found 'admin', setting admin");
              setPermissionLevel('admin');
            } else if (perms.includes('write')) {
              console.log("[CadastrosPermissions] Found 'write', setting write");
              setPermissionLevel('write');
            } else if (perms.includes('read')) {
              console.log("[CadastrosPermissions] Found 'read', setting read");
              setPermissionLevel('read');
            }
            setLoading(false);
            return;
          } else {
            console.log("[CadastrosPermissions] No profile permissions found for cadastros module");
          }
        } else {
          console.log("[CadastrosPermissions] No profile_id on user profile");
        }

        // Check user-specific permissions
        const { data: userPermissions } = await supabase
          .from("user_permissions")
          .select("permission")
          .eq("user_id", user.id)
          .eq("module", "cadastros");

        if (userPermissions && userPermissions.length > 0) {
          const perms = userPermissions.map(p => p.permission);
          // Check if disabled - user should not see the module
          if (perms.includes('disabled')) {
            setPermissionLevel('none');
          } else if (perms.includes('admin')) {
            setPermissionLevel('admin');
          } else if (perms.includes('write')) {
            setPermissionLevel('write');
          } else if (perms.includes('read')) {
            setPermissionLevel('read');
          } else {
            setPermissionLevel('none');
          }
        } else {
          setPermissionLevel('none');
        }
      } catch (error) {
        console.error("Error checking cadastros permissions:", error);
        setPermissionLevel('none');
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();
  }, []);

  return {
    permissionLevel,
    loading,
    canAccess: permissionLevel !== 'none', // Can see menus
    canEdit: permissionLevel === 'write' || permissionLevel === 'admin', // Can create/edit
    canDelete: permissionLevel === 'admin', // Only admin can delete
    canAccessParameters: permissionLevel === 'admin', // Only admin can access Parameters
    canAccessStores: permissionLevel === 'admin', // Only admin can access Stores
  };
};
