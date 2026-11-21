import "server-only";

import { containerActionSchema } from "@/validations/container.schema";
import type { ZodType } from "zod";
import { pamRequestSchema } from "@/validations/pam.schema";
import { stackActionSchema, stackCreateSchema, terminalRequestSchema } from "@/validations/ops.schema";
import { reportSchema } from "@/validations/report.schema";
import { connectorRequestSchema, permissionSchema, resourceSchemas } from "@/validations/resource.schema";

export function proxyRequestSchema(method: string, path: string): ZodType | undefined {
  if (method === "PUT") return permissionSchema;
  if (method === "POST") {
    if (path.startsWith("containers/") && path.endsWith("/action")) return containerActionSchema;
    if (path === "stacks") return stackCreateSchema;
    if (path.startsWith("stacks/") && path.endsWith("/action")) return stackActionSchema;
    if (path === "pam/terminal") return terminalRequestSchema;
  }
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
