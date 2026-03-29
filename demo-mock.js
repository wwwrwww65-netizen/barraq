// A simple polyfill for Electron & Node.js modules for Browser/Demo environments (GitHub Pages).
if (typeof require === 'undefined') {
    window.require = function(module) {
        if (module === 'electron') {
            return {
                ipcRenderer: {
                    invoke: async (channel, ...args) => {
                        console.log('[Demo] ipcRenderer.invoke:', channel, args);
                        if (channel === 'db-get-orders') {
                            const db = getDemoDB();
                            return db.orders || [];
                        }
                        if (channel === 'db-get-inventory') {
                            const db = getDemoDB();
                            return db.inventory || [];
                        }
                        if (channel === 'get-hostname') return 'Demo-Desktop-Web';
                        return null;
                    },
                    send: (channel, ...args) => {
                        console.log('[Demo] ipcRenderer.send:', channel, args);
                        if (channel.includes('print')) {
                            alert('تم إرسال أمر الطباعة بنجاح (Simulation Mode)');
                        }
                    },
                    sendSync: (channel, ...args) => {
                        console.log('[Demo] ipcRenderer.sendSync:', channel, args);
                        if (channel === 'get-db-path') return 'pos_database.json';
                        return null;
                    },
                    on: (channel, listener) => {
                        console.log('[Demo] Registered IPC Listener:', channel);
                    }
                }
            };
        }
        if (module === 'fs') {
            return {
                readFileSync: (path, enc) => {
                    if (path.includes('pos_database.json') || path === 'pos_database.json') {
                        const saved = localStorage.getItem('demo_pos_db');
                        if (saved) return saved;
                        return JSON.stringify({ lastOrderId: 1000, orders: [], products: [], categories: [], inventory: [] });
                    }
                    return '[]';
                },
                writeFileSync: (path, data, enc) => {
                    console.log('[Demo] fs.writeFileSync -> localStorage:', path);
                    if (path.includes('pos_database.json') || path === 'pos_database.json') {
                         localStorage.setItem('demo_pos_db', data);
                    }
                },
                existsSync: (path) => true
            };
        }
        if (module === 'path') {
            return { join: (...args) => args.join('/') };
        }
        if (module === 'qrcode') {
            return { toDataURL: async () => 'data:image/png;base64,...' };
        }
        console.warn('[Demo] Mocking unimplemented require:', module);
        return {};
    };

    function getDemoDB() {
        const saved = localStorage.getItem('demo_pos_db');
        if (saved) {
            try { return JSON.parse(saved); } catch(e){}
        }
        return { orders: [], inventory: [], products: [], categories: [] };
    }
    
    // Auto-fetch the initial pos_database.json via HTTP (Sync) for seamless demo initialization
    try {
        if (!localStorage.getItem('demo_pos_db')) {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'pos_database.json', false); // XMLHttpRequest Sync is deprecated but works for static initialization
            xhr.send(null);
            if (xhr.status === 200 || xhr.status === 0) {
                if (xhr.responseText) {
                    localStorage.setItem('demo_pos_db', xhr.responseText);
                }
            }
        }
    } catch(e) { 
        console.warn("[Demo] Initial fetch failed, using fallback.", e); 
    }
    
    console.log('[Demo] Electron/Node Polyfill Initialized!');
}
