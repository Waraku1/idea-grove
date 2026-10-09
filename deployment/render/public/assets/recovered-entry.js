const root = document.getElementById("root");
const status = document.getElementById("bootstrap-status");

function setStatus(message) {
  if (status) status.textContent = message;
}

function showFailure(error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error("Idea Grove failed to start:", error);
  if (!root) return;
  root.innerHTML = "";
  const panel = document.createElement("div");
  panel.style.cssText = "box-sizing:border-box;max-width:900px;margin:10vh auto;padding:28px;font:16px/1.5 system-ui,sans-serif;color:#3c4935;background:rgba(255,255,255,.92);border:1px solid rgba(60,73,53,.18);border-radius:18px;box-shadow:0 12px 40px rgba(40,50,35,.12)";
  panel.innerHTML = "<h1 style='margin:0 0 12px;font-size:24px'>Idea Grove could not load</h1><p style='margin:0 0 12px'>The page loaded, but the interactive application failed during bootstrap.</p><pre style='margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace'></pre>";
  panel.querySelector("pre").textContent = message;
  root.appendChild(panel);
}

window.addEventListener("error", event => {
  if (event.error) showFailure(event.error);
});
window.addEventListener("unhandledrejection", event => showFailure(event.reason));

function withTimeout(promise, label, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + " timed out after " + ms + " ms.")), ms))
  ]);
}

async function start() {
  try {
    setStatus("Starting Idea Grove…");
    setStatus("Loading application runtime…");
    const runtimeModule = await withTimeout(import("./framework-D_rUT4EX.js"), "Loading the React runtime");
    const { i: reactFactory, n: domFactory } = runtimeModule;
    const React = reactFactory();
    const ReactDOM = domFactory();
    if (!React || !ReactDOM || typeof ReactDOM.createRoot !== "function") {
      throw new Error("Recovered React runtime did not initialize.");
    }

    setStatus("Loading your grove…");
    const groveModule = await withTimeout(import("./grove-BWXu0UId.js"), "Loading the Grove application");
    const Grove = groveModule.default;
    if (!Grove) throw new Error("The recovered Grove module did not provide a default export.");

    setStatus("Checking sign-in session…");
    const sessionResponse = await withTimeout(fetch("/session", { credentials: "same-origin", cache: "no-store" }), "Checking the sign-in session");
    const session = sessionResponse.ok
      ? await sessionResponse.json()
      : { signedIn: false, userKey: "guest" };

    if (!root) throw new Error("The #root element is missing.");
    setStatus("Rendering your grove…");
    ReactDOM.createRoot(root).render(
      React.createElement(Grove, {
        signedIn: !!session.signedIn,
        signInPath: "/auth/sign-in",
        signInLabel: "Sign in with GitHub",
        standalone: true,
        userKey: session.userKey || "guest"
      })
    );
  } catch (error) {
    showFailure(error);
  }

start();
