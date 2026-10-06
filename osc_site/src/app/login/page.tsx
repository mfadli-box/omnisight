"use client";

import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { persistSession } from "@/lib/utility";
import { Shield, RefreshCw } from "lucide-react";
import { Button } from "@/uix/button";
import { Input } from "@/uix/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/uix/card";
import SearchSelect from "@/uix/search-select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
  InputGroupText,
} from "@/uix/input-group";
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldError,
} from "@/uix/field";

type HrisCompany = {
  company_id: string;
  code: string;
  name: string;
};

function generateCaptcha() {
  const d1 = Math.floor(Math.random() * 10);
  const d2 = Math.floor(Math.random() * 10);
  const d3 = Math.floor(Math.random() * 10);
  const code = `${d1}${d2}${d3}`;
  return { code, hint: `${d1} ${d2} ${d3}` };
}

const loginSchema = z.object({
  company_id: z.string().default("").optional(),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  captcha: z.string().min(1, "Captcha is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hrisCompanies, setHrisCompanies] = useState<HrisCompany[]>([]);
  const [loadingHris, setLoadingHris] = useState(true);
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const captcha = useMemo(() => {
    if (!isClient) {
      return null;
    }
    const currentVersion = captchaVersion;
    if (currentVersion < 0) {
      return null;
    }
    return generateCaptcha();
  }, [isClient, captchaVersion]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "", captcha: "", company_id: "" },
  });
  const selectedCompanyId = useWatch({
    control: loginForm.control,
    name: "company_id",
  });

  useEffect(() => {
    if (hrisCompanies.length === 0) {
      fetch("/proxy/guest/PUB00")
        .then((r) => r.json())
        .then((res) => setHrisCompanies(res.data ?? []))
        .catch(() => setHrisCompanies([]))
        .finally(() => setLoadingHris(false));
    }
  }, [hrisCompanies.length]);

  const refreshCaptcha = useCallback(() => {
    setCaptchaVersion((value) => value + 1);
    loginForm.setValue("captcha", "");
    loginForm.clearErrors("captcha");
  }, [loginForm]);

  async function onSubmitLogin(data: LoginForm) {
    setError("");
    if (!captcha || captcha.code !== data.captcha) {
      loginForm.setError("captcha",
        { message: "Incorrect captcha answer" },
      );
      refreshCaptcha();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/proxy/guest/PUB00", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: data.company_id,
          username: data.username,
          password: data.password,
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        setError(resData.error || "Login failed");
        refreshCaptcha();
        return;
      }
      const profile = { ...resData.data.user_profile, company_id: data.company_id };
      const session = {
        token: resData.data.token,
        expires_at: resData.data.expires_at,
        user_profile: profile,
      };
      persistSession(session);
      if (data.company_id) {
        localStorage.setItem("OmniSightCompany", data.company_id);
      }
      router.push("/board");
    } catch {
      setError("Failed to connect to server");
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-xl text-center">OmniSight</CardTitle>
          <CardDescription className="text-center">ICT Management</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={loginForm.handleSubmit(onSubmitLogin)} className="space-y-4" noValidate>
            <Field data-invalid={!!loginForm.formState.errors.company_id}>
              <FieldContent>
                <FieldLabel htmlFor="company_id">Company</FieldLabel>
                <SearchSelect
                  id="company_id"
                  items={hrisCompanies.map(c => ({ id: c.company_id, name: c.name }))}
                  value={selectedCompanyId ?? null}
                  onValueChange={(v) => {
                    loginForm.setValue("company_id", v ?? "");
                  }}
                  placeholder={loadingHris ? "Loading companies..." : "Non-HRIS"}
                  error={!!loginForm.formState.errors.company_id}
                />
                <FieldError errors={loginForm.formState.errors.company_id ? [{
                  message: loginForm.formState.errors.company_id.message,
                }] : undefined} />
              </FieldContent>
            </Field>

            <Field data-invalid={!!loginForm.formState.errors.username}>
              <FieldContent>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  placeholder="Enter username"
                  autoComplete="username"
                  aria-invalid={!!loginForm.formState.errors.username}
                  {...loginForm.register("username")}
                />
                <FieldError errors={loginForm.formState.errors.username ? [{
                  message: loginForm.formState.errors.username.message,
                }] : undefined} />
              </FieldContent>
            </Field>

            <Field data-invalid={!!loginForm.formState.errors.password}>
              <FieldContent>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  aria-invalid={!!loginForm.formState.errors.password}
                  {...loginForm.register("password")}
                />
                <FieldError errors={loginForm.formState.errors.password ? [{
                  message: loginForm.formState.errors.password.message,
                }] : undefined} />
              </FieldContent>
            </Field>

            <Field data-invalid={!!loginForm.formState.errors.captcha}>
              <FieldContent>
                <FieldLabel htmlFor="captcha">Captcha</FieldLabel>
                <InputGroup aria-invalid={!!loginForm.formState.errors.captcha}>
                  <InputGroupAddon align="inline-start">
                    <InputGroupText suppressHydrationWarning>
                      {captcha ? captcha.hint : "\u00A0"}
                    </InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="captcha"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Type the digits"
                    disabled={!captcha}
                    {...loginForm.register("captcha")}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton onClick={refreshCaptcha} size="icon-xs">
                      <RefreshCw className="h-3 w-3" />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldError errors={loginForm.formState.errors.captcha ? [{
                  message: loginForm.formState.errors.captcha.message,
                }] : undefined} />
              </FieldContent>
            </Field>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
