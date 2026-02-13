import type { SupabaseClient } from "@supabase/supabase-js";

export const uploadSvgToBucket = async (args: {
  client: SupabaseClient;
  bucket: string;
  path: string;
  svg: string;
  upsert?: boolean;
  cacheControl?: string;
}): Promise<{ bucket: string; path: string; contentType: string }> => {
  const contentType = "image/svg+xml";
  const payload = Buffer.from(args.svg, "utf8");

  const { error } = await args.client.storage.from(args.bucket).upload(args.path, payload, {
    contentType,
    upsert: args.upsert ?? true,
    cacheControl: args.cacheControl
  });

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  return {
    bucket: args.bucket,
    path: args.path,
    contentType
  };
};

export const uploadPngToBucket = async (args: {
  client: SupabaseClient;
  bucket: string;
  path: string;
  png: Uint8Array;
  upsert?: boolean;
  cacheControl?: string;
}): Promise<{ bucket: string; path: string; contentType: string }> => {
  const contentType = "image/png";

  const { error } = await args.client.storage.from(args.bucket).upload(args.path, args.png, {
    contentType,
    upsert: args.upsert ?? true,
    cacheControl: args.cacheControl
  });

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  return {
    bucket: args.bucket,
    path: args.path,
    contentType
  };
};

export const createSignedBucketUrl = async (args: {
  client: SupabaseClient;
  bucket: string;
  path: string;
  expiresIn: number;
}): Promise<string> => {
  const { data, error } = await args.client.storage
    .from(args.bucket)
    .createSignedUrl(args.path, args.expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Supabase signed URL creation failed: ${error?.message ?? "unknown error"}`);
  }

  return data.signedUrl;
};
