import React from "react";

export interface SettingsPanelProps {
  isOpen: boolean;
  apiUrl: string;
  userId: string;
  orgId: string;
  role: string;
  onChangeApiUrl: (value: string) => void;
  onChangeUserId: (value: string) => void;
  onChangeOrgId: (value: string) => void;
  onChangeRole: (value: string) => void;
  supabaseUrl: string;
  supabaseKey: string;
  onChangeSupabaseUrl: (value: string) => void;
  onChangeSupabaseKey: (value: string) => void;
  authUserId: string | null;
  hasAccessToken: boolean;
  onLoginDiscord: () => void;
  onLogout: () => void;
  onResetAuth: () => void;
  onRefreshAuth: () => void;
}

export const SettingsPanel = (props: SettingsPanelProps) => {
  return (
    <section
      className="settings-grid"
      id="settingsShell"
      aria-label="Connection and auth settings"
      style={{ display: props.isOpen ? undefined : "none" }}
    >
      <article className="panel">
        <h2>Connection</h2>
        <div className="fields">
          <label>
            API URL
            <input value={props.apiUrl} onChange={(e) => props.onChangeApiUrl(e.target.value)} />
          </label>
          <label>
            User UUID
            <input value={props.userId} onChange={(e) => props.onChangeUserId(e.target.value)} />
          </label>
          <label>
            Org UUID
            <input value={props.orgId} onChange={(e) => props.onChangeOrgId(e.target.value)} />
          </label>
          <label>
            Role
            <select value={props.role} onChange={(e) => props.onChangeRole(e.target.value)}>
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
          </label>
        </div>
      </article>

      <article className="panel">
        <h2>Supabase Auth (Discord)</h2>
        <p className="meta">
          Optional: when signed in, API requests use{" "}
          <code>Authorization: Bearer &lt;access_token&gt;</code>.
        </p>
        <div className="fields">
          <label>
            Supabase URL
            <input
              value={props.supabaseUrl}
              onChange={(e) => props.onChangeSupabaseUrl(e.target.value)}
              placeholder="https://your-project-ref.supabase.co"
            />
          </label>
          <label>
            Supabase Publishable Key
            <input
              value={props.supabaseKey}
              onChange={(e) => props.onChangeSupabaseKey(e.target.value)}
              placeholder="sb_publishable_..."
            />
          </label>
        </div>
        <div className="inline top-gap">
          <button type="button" onClick={props.onLoginDiscord}>
            Sign in with Discord
          </button>
          <button type="button" onClick={props.onLogout}>
            Logout
          </button>
          <button type="button" onClick={props.onResetAuth}>
            Reset Auth
          </button>
          <button type="button" onClick={props.onRefreshAuth}>
            Refresh Auth
          </button>
        </div>
        <p className="meta">
          Auth User ID: <span>{props.authUserId ?? "Not signed in"}</span>
        </p>
        <p className="meta">
          Access Token: <span>{props.hasAccessToken ? "present" : "none"}</span>
        </p>
      </article>
    </section>
  );
};

