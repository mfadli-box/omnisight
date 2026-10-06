"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/uix/card";
import PasswordForm from "./components/password-form";

export default function SYS02Page() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">SYS02 - Password</CardTitle>
      </CardHeader>
      <CardContent>
        <PasswordForm />
      </CardContent>
    </Card>
  );
}
