"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/uix/card";
import { Badge } from "@/uix/badge";
import { Avatar, AvatarFallback } from "@/uix/avatar";
import { fetchProfile, type SYS01Profile } from "../api";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function ProfileCard() {
  const [profile, setProfile] = useState<SYS01Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchProfile();
        if (!cancelled) setProfile(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load profile");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-10">
          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">{initials(profile.fullname || profile.username)}</AvatarFallback>
          </Avatar>
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Username" value={profile.username} />
            <InfoRow label="Full Name" value={profile.fullname} />
            <InfoRow label="Email" value={profile.email} />
            <InfoRow label="Phone" value={profile.phone || "-"} />
            <InfoRow label="Role" value={profile.role || "-"} />
            <InfoRow label="Job" value={profile.job || "-"} />
            <InfoRow label="Primary Company" value={profile.company_name || "-"} />
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Access</span>
              <div className="flex flex-wrap gap-2">
                {profile.is_admin && <Badge variant="default">Admin</Badge>}
                {profile.is_hris && <Badge variant="secondary">HRIS</Badge>}
                <Badge variant={profile.is_active ? "default" : "destructive"}>
                  {profile.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg">Companies</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies assigned.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {profile.companies.map((c) => (
                <li key={c.company_id} className="flex items-center justify-between py-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.code}</span>
                  </div>
                  {c.company_id === profile.company_id && (
                    <Badge variant="secondary">Primary</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
