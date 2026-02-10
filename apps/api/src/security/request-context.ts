import { authContextSchema } from "@kanban/contracts";
import type { RequestContext } from "@kanban/core";
import { BadRequestException } from "@nestjs/common";

interface HeaderLike {
  [name: string]: string | string[] | undefined;
}

const pickHeader = (
  headers: HeaderLike,
  key: string
): string | undefined => {
  const value = headers[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export const toRequestContext = (
  headers: HeaderLike
): RequestContext => {
  const parsed = authContextSchema.safeParse({
    sub: pickHeader(headers, "x-user-id"),
    org_id: pickHeader(headers, "x-org-id"),
    role: pickHeader(headers, "x-role"),
    discord_user_id: pickHeader(headers, "x-discord-user-id")
  });

  if (!parsed.success) {
    throw new BadRequestException(
      "Missing or invalid auth headers: x-user-id, x-org-id, x-role."
    );
  }

  return {
    userId: parsed.data.sub,
    orgId: parsed.data.org_id,
    role: parsed.data.role
  };
};
