import { authContextSchema } from "@kanban/contracts";
import type { RequestContext } from "@kanban/core";
import { createSupabaseClientFromEnv } from "@kanban/adapters";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";

interface HeaderLike {
  [name: string]: string | string[] | undefined;
}

const pickHeader = (
  headers: HeaderLike,
  key: string
): string | undefined => {
  const loweredKey = key.toLowerCase();
  const headerKey = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === loweredKey
  );

  if (!headerKey) {
    return undefined;
  }

  const value = headers[headerKey];
  return Array.isArray(value) ? value[0] : value;
};

const parseBearerToken = (authorization: string | undefined): string | null => {
  if (!authorization) {
    return null;
  }

  const trimmed = authorization.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const token = match[1]?.trim();
  return token ? token : null;
};

export type ResolveUserIdFromAccessToken = (accessToken: string) => Promise<string>;

const defaultResolveUserIdFromAccessToken: ResolveUserIdFromAccessToken = async (
  accessToken
) => {
  const supabase = createSupabaseClientFromEnv();
  const { data, error } = await supabase.auth.getUser(accessToken);
  const userId = data?.user?.id;

  if (error || !userId) {
    throw new UnauthorizedException("Invalid Supabase access token.");
  }

  return userId;
};

export interface RequestContextDeps {
  resolveUserIdFromAccessToken?: ResolveUserIdFromAccessToken;
}

export const toRequestContext = async (
  headers: HeaderLike,
  deps: RequestContextDeps = {}
): Promise<RequestContext> => {
  const authorization = pickHeader(headers, "authorization");
  const accessToken = parseBearerToken(authorization);

  if (authorization && !accessToken) {
    throw new BadRequestException("Invalid Authorization header. Expected Bearer token.");
  }

  const resolveUserId =
    deps.resolveUserIdFromAccessToken ?? defaultResolveUserIdFromAccessToken;

  const sub = accessToken
    ? await resolveUserId(accessToken)
    : pickHeader(headers, "x-user-id");

  const parsed = authContextSchema.safeParse({
    sub,
    org_id: pickHeader(headers, "x-org-id"),
    role: pickHeader(headers, "x-role"),
    discord_user_id: pickHeader(headers, "x-discord-user-id")
  });

  if (!parsed.success) {
    throw new BadRequestException(
      "Missing or invalid auth. Provide x-org-id and x-role plus either Authorization: Bearer <token> or x-user-id."
    );
  }

  return {
    userId: parsed.data.sub,
    orgId: parsed.data.org_id,
    role: parsed.data.role
  };
};
