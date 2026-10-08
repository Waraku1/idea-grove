import { i as reactFactory, n as domFactory } from "./framework-D_rUT4EX.js";
import Grove from "./grove-BWXu0UId.js";
const React = reactFactory();
const ReactDOM = domFactory();
ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(Grove, {
    signedIn: false,
    signInPath: "/auth/sign-in",
    signInLabel: "Sign in",
    standalone: false,
    userKey: "guest"
  })
);
