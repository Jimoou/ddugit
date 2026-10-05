import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppCrash, Boundary } from "./components/Crash";
import { animatePopupsLeaving } from "./leaving";
import { captureErrors } from "./report";

// Before anything renders, so an error during the first render is kept for a report.
captureErrors(window);
animatePopupsLeaving();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Boundary fallback={(error) => <AppCrash error={error} />}>
      <App />
    </Boundary>
  </React.StrictMode>,
);
