"use client";

import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { storageKey, parseSession } from "@/lib/utility";
import { useSessionSnapshot } from "@/lib/use-session";
import SearchSelect from "@/uix/search-select";
import { usePreferencesStore } from "@/app/theme";
import type { CompanyOption } from "../../theme/stores";

type CompanyResponse = {
  data?: { company_id: string; name: string }[];
};

const upsertSessionCompanyName = (companyName: string) => {
  const raw = window.localStorage.getItem(storageKey);
  const session = parseSession(raw || "");
  if (!session) {
    return;
  }
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      ...session,
      user_profile: {
        ...session.user_profile,
        company_name: companyName,
      },
    }),
  );
};

export function CompanyCombobox() {
  const { companyId, companyList, setCompanyId, setCompanyList } = usePreferencesStore(
    useShallow((s) => ({
      companyId: s.companyId,
      companyList: s.companyList,
      setCompanyId: s.setCompanyId,
      setCompanyList: s.setCompanyList,
    })),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const session = useSessionSnapshot();
  const lockedCompanyId = (session?.user_profile.company_id || "").trim();

  useEffect(() => {
    let isDisposed = false;
    if (!session) {
      queueMicrotask(() => {
        if (isDisposed) {
          return;
        }
        setCompanyId("");
        setCompanyList([]);
        setLoading(false);
      });
      return;
    }
    const initialCompany = (lockedCompanyId || companyId || "").trim();
      fetch(`/proxy/pages/APP00/company`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      })
      .then((res) => res.json())
      .then((response: CompanyResponse) => {
        if (isDisposed) {
          return;
        }
        const raw = Array.isArray(response.data) ? response.data : [];
        const nextCompanies: CompanyOption[] = raw.map((c) => ({
          id: c.company_id,
          code: c.company_id,
          name: c.name,
        }));
        setCompanyList(nextCompanies);
        if (!nextCompanies.length) {
          return;
        }
        if (lockedCompanyId) {
          const matchedLockedCompany = nextCompanies.find(
            (company) => String(company.id).trim() === lockedCompanyId,
          );
          setCompanyId(matchedLockedCompany?.id ?? "");
          upsertSessionCompanyName(matchedLockedCompany?.name ?? "");
          return;
        }
        const normalizedInitialCompany = String(initialCompany).trim();
        const matchedInitialCompany = nextCompanies.find(
          (company) => String(company.id).trim() === normalizedInitialCompany,
        );
        if (normalizedInitialCompany && !matchedInitialCompany) {
          setCompanyId("");
          upsertSessionCompanyName("");
        }
        if (matchedInitialCompany) {
          setCompanyId(matchedInitialCompany.id);
        }
        if (matchedInitialCompany) {
          upsertSessionCompanyName(matchedInitialCompany.name);
        }
      })
      .catch(() => {
        if (isDisposed) {
          return;
        }
        setError("Failed to load company list.");
      })
      .finally(() => {
        if (isDisposed) {
          return;
        }
        setError(null);
        setLoading(false);
      });
    return () => {
      isDisposed = true;
    };
  }, [companyId, lockedCompanyId, session, setCompanyId, setCompanyList]);
  const placeholder = loading ? "Loading company..." : "Select company";
  const selectedCompanyId = lockedCompanyId || companyId;
  return (
    <div className="px-2 pt-2 pb-1 group-data-[collapsible=icon]:hidden">
      <SearchSelect
        items={companyList}
        value={selectedCompanyId || null}
        onValueChange={(value) => {
          if (lockedCompanyId) {
            return;
          }
          const id = value ?? "";
          setCompanyId(id);
          if (!id) {
            upsertSessionCompanyName("");
            return;
          }
          const selected = companyList.find((company) => company.id === id);
          upsertSessionCompanyName(selected?.name ?? "");
        }}
        placeholder={placeholder}
        disabled={Boolean(lockedCompanyId) || loading || !companyList.length}
        error={Boolean(error)}
      />
    </div>
  );
}
