import { i as reactFactory, n as domFactory } from "./framework-D_rUT4EX.js";
import Grove from "./grove-BWXu0UId.js";

const React = reactFactory();
const ReactDOM = domFactory();
const root = document.getElementById("root");

fetch("/session", { credentials: "same-origin", cache: "no-store" })
  .then((response) => response.ok ? response.json() : { signedIn: false, userKey: "guest" })
  .catch(() => ({ signedIn: false, userKey: "guest" }))
  .then(({ signedIn, userKey }) => {
    ReactDOM.createRoot(root).render(
      React.createElement(Grove, {
        signedIn: !!signedIn,
        signInPath: "/auth/sign-in",
        signInLabel: "Sign in with GitHub",
        standalone: true,
        userKey: userKey || "guest"
      })
    );
  });
