import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { requireAuth } from './services/authGuard';

async function init() {
    const isAuthed = await requireAuth();
    if (!isAuthed) return;

    const rootElement = document.getElementById('root');
    if (!rootElement) throw new Error("Could not find root element to mount to");

    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}

init();
