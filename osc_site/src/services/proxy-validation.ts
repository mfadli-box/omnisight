import "server-only";

import type { ZodType } from "zod";
import { pamRequestSchema } from "@/validations/pam.schema";
import { reportSchema } from "@/validations/report.schema";
import { connectorRequestSchema, permissionSchema, resourceSchemas } from "@/validations/resource.schema";

export function proxyRequestSchema(method: string, path: string): ZodType | undefined {
  if (method === "PUT") return permissionSchema;
  if (path === "pam/sessions/authorize") return pamRequestSchema;
  if (path === "reports/generate-pdf") return reportSchema;
  if (path.endsWith("/connector")) return connectorRequestSchema;
  for (const [route, schemas] of Object.entries(resourceSchemas)) {
    if (method === "POST" && route === path) return schemas.create;
    if (method === "PATCH" && route === path.slice(0, path.lastIndexOf("/")) && "update" in schemas) {
      return schemas.update;
    }
  }
}
