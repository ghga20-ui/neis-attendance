import { createRoot } from "react-dom/client";
import "./bridge"; // registers window.__pushLog/__registerBridge/__onPywebviewReady for Python
import App from "./app";
import "../styles.css";

createRoot(document.getElementById("root")!).render(<App />);
