import { i as reactFactory, n as domFactory } from "./framework-D_rUT4EX.js";

const React = reactFactory();
const ReactDOM = domFactory();
const root = document.getElementById("root");

function showFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Idea Grove failed to start:", error);
  if (!root) return;
  root.innerHTML = "";
  const panel = document.createElement("div");
  panel.style.cssText = "box-sizing:border-box;max-width:720px;margin:10vh auto;padding:28px;font:16px/1.5 system-ui,sans-serif;color:#3c4935;background:rgba(255,255,255,.82);border:1px solid rgba(60,73,53,.18);border-radius:18px;box-shadow:0 12px 40px rgba(40,50,35,.12)";
  panel.innerHTML = "<h1 style=\"margin:0 0 12px;font-size:24px\">Idea Grove could not load</h1><p style=\"margin:0 0 10px\">The server is running, but the interactive grove failed during startup.</p><p style=\"margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere\"></p>";
  panel.querySelector("p:last-child").textContent = message;
  root.appendChild(panel);
}

window.addEventListener("error", (event) => {
  if (event.error) showFailure(event.error);
});
window.addEventListener("unhandledrejection", (event) => {
  showFailure(event.reason);
});

async function start() {
  try {
    const [{ default: Grove }, sessionResponse] = await Promise.all([
      import("./grove-BWXu0UId.js"),
      fetch("/session", { credentials: "same-origin", cache: "no-store" })
    ]);
    const session = sessionResponse.ok
      ? await sessionResponse.json()
      : { signedIn: false, userKey: "guest" };
    if (!root) throw new Error("The #root element is missing.");
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
}

start();
