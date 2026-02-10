const statusEl = document.getElementById("status");

const setStatus = (message, payload) => {
  const line = payload ? `${message}\n${JSON.stringify(payload, null, 2)}` : message;
  statusEl.textContent = line;
};

const supabaseUrl = (localStorage.getItem("kanban.supabaseUrl") ?? "").trim();
const supabaseKey = (localStorage.getItem("kanban.supabaseKey") ?? "").trim();

if (!supabaseUrl || !supabaseKey) {
  setStatus(
    "Missing Supabase URL / Publishable Key in localStorage. Return to the board and set them first."
  );
} else {
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
  );

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  });

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (!code) {
    setStatus("Missing ?code=... in callback URL.");
  } else {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      setStatus("Failed to exchange code for session.", { message: error.message });
    } else {
      setStatus("Sign-in complete. Redirecting back to the board.");
      window.location.replace("/");
    }
  }
}
