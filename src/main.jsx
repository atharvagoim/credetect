import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AuthProvider } from './hooks/useAuth.jsx';
import { ToastProvider } from './components/ui.jsx';
import App from './App.jsx';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/fx.css';
import './styles/responsive.css';
import './styles/dark.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
