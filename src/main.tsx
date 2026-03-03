import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

console.log("ENV:", import.meta.env);
console.log("KEY:", import.meta.env.VITE_GEMINI_API_KEY);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);