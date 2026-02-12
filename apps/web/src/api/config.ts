export type AppRole = "viewer" | "editor" | "admin";

export interface AppConfig {
  apiUrl: string;
  userId: string;
  orgId: string;
  role: AppRole;
}

export const config: AppConfig = {
  apiUrl: "http://localhost:3001",
  userId: "",
  orgId: "",
  role: "viewer"
};

export const updateConfig = (updates: Partial<AppConfig>): void => {
  Object.assign(config, updates);
};
