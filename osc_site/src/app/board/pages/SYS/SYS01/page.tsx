"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/uix/card";
import ProfileCard from "./components/profile-card";

export default function SYS01Page() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">SYS01 - Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <ProfileCard />
      </CardContent>
    </Card>
  );
}
