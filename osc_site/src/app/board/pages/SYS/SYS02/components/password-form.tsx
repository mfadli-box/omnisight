"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/uix/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/uix/card";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import { Input } from "@/uix/input";
import { changePassword } from "../api";

export default function PasswordForm() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const next: Record<string, string> = {};
    if (!oldPassword) next.old_password = "Current password is required";
    if (!newPassword) next.new_password = "New password is required";
    else if (newPassword.length < 6) next.new_password = "Password must be at least 6 characters";
    if (confirmPassword !== newPassword) next.confirm_password = "Passwords do not match";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const res = await changePassword({ old_password: oldPassword, new_password: newPassword });
      toast.success(res.message || "Password updated");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Change Password</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field data-invalid={!!errors.old_password}>
          <FieldContent>
            <FieldLabel>Current Password</FieldLabel>
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => {
                setOldPassword(e.target.value);
                setErrors((prev) => ({ ...prev, old_password: "" }));
              }}
              placeholder="Enter current password"
              aria-invalid={!!errors.old_password}
            />
            <FieldError errors={errors.old_password ? [{ message: errors.old_password }] : undefined} />
          </FieldContent>
        </Field>
        <Field data-invalid={!!errors.new_password}>
          <FieldContent>
            <FieldLabel>New Password</FieldLabel>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setErrors((prev) => ({ ...prev, new_password: "" }));
              }}
              placeholder="At least 6 characters"
              aria-invalid={!!errors.new_password}
            />
            <FieldError errors={errors.new_password ? [{ message: errors.new_password }] : undefined} />
          </FieldContent>
        </Field>
        <Field data-invalid={!!errors.confirm_password}>
          <FieldContent>
            <FieldLabel>Confirm New Password</FieldLabel>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrors((prev) => ({ ...prev, confirm_password: "" }));
              }}
              placeholder="Re-enter new password"
              aria-invalid={!!errors.confirm_password}
            />
            <FieldError errors={errors.confirm_password ? [{ message: errors.confirm_password }] : undefined} />
          </FieldContent>
        </Field>
        <Button onClick={handleSubmit} disabled={saving} className="w-fit">
          {saving ? "Updating..." : "Update Password"}
        </Button>
      </CardContent>
    </Card>
  );
}
