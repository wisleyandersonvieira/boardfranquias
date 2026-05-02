import { createRoot } from 'react-dom/client'
import './lib/disableProductionLogs'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);
