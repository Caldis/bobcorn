import React from 'react';
import { createRoot } from 'react-dom/client';
import MainContainer from './containers/MainContainer';

function mount() {
    const container = document.getElementById('root');
    if (container) {
        const root = createRoot(container);
        root.render(<MainContainer />);
    } else {
        // Script may load before DOM is ready (e.g., in <head>)
        document.addEventListener('DOMContentLoaded', () => {
            const root = createRoot(document.getElementById('root'));
            root.render(<MainContainer />);
        });
    }
}
mount();
