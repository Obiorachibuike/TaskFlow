"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings2, Users, Mail, UserCog, Bell } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceSettings } from "@/components/settings/workspace-settings";
import { MembersSettings } from "@/components/settings/members-settings";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { NotificationSettings } from "@/components/settings/notification-settings";

export interface MemberRow {
  id: string;
  role: string;
  createdAt: string;
  user: { id: string; name: string; email: string; image: string | null; avatarColor: string | null };
}

export interface InvitationRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  inviter: { name: string };
}

export function SettingsTabs({
  workspaceSlug,
  workspace,
  members,
  invitations,
  user,
  canManage,
  isOwner,
}: {
  workspaceSlug: string;
  workspace: { id: string; name: string; description: string | null; icon: string | null; color: string; slug: string };
  members: MemberRow[];
  invitations: InvitationRow[];
  user: { id: string; name: string; email: string; image: string | null; avatarColor: string | null; timeZone: string };
  canManage: boolean;
  isOwner: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") ?? "general";

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => router.replace(`/app/${workspaceSlug}/settings?tab=${v}`)}
    >
      <TabsList>
        <TabsTrigger value="general">
          <Settings2 className="h-3.5 w-3.5" />
          General
        </TabsTrigger>
        <TabsTrigger value="members">
          <Users className="h-3.5 w-3.5" />
          Members
        </TabsTrigger>
        <TabsTrigger value="invitations">
          <Mail className="h-3.5 w-3.5" />
          Invitations
        </TabsTrigger>
        <TabsTrigger value="profile">
          <UserCog className="h-3.5 w-3.5" />
          Profile
        </TabsTrigger>
        <TabsTrigger value="notifications">
          <Bell className="h-3.5 w-3.5" />
          Notifications
        </TabsTrigger>
      </TabsList>

      <div className="mt-5">
        {tab === "general" && (
          <WorkspaceSettings workspace={workspace} workspaceSlug={workspaceSlug} canManage={canManage} />
        )}
        {tab === "members" && (
          <MembersSettings
            workspaceSlug={workspaceSlug}
            members={members}
            currentUserId={user.id}
            canManage={canManage}
            isOwner={isOwner}
          />
        )}
        {tab === "invitations" && (
          <MembersSettings
            workspaceSlug={workspaceSlug}
            members={members}
            invitations={invitations}
            currentUserId={user.id}
            canManage={canManage}
            isOwner={isOwner}
            showInvitations
          />
        )}
        {tab === "profile" && <ProfileSettings user={user} />}
        {tab === "notifications" && <NotificationSettings />}
      </div>
    </Tabs>
  );
}
