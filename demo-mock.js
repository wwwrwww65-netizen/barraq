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

// ============== GLOBAL EXPORT TO CSV ==============
window.exportTableToCSV = function(filename = 'export.csv') {
    const tables = document.querySelectorAll('table');
    if (!tables.length) { alert('لا يوجد جدول بيانات في هذه الصفحة!'); return; }
    const table = tables[0];
    const rows = table.querySelectorAll('tr');
    const csv = [];
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = [];
        cols.forEach(col => rowData.push('"' + col.innerText.trim().replace(/"/g, '""') + '"'));
        csv.push(rowData.join(','));
    });
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
};

window.exportPageToPDF = async function(filename = 'تقرير.pdf') {
    if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        if (ipcRenderer && ipcRenderer.invoke) {
            try {
                // Trigger CSS print layout logic
                window.dispatchEvent(new Event('beforeprint'));
                
                const res = await ipcRenderer.invoke('export-pdf', filename);
                
                // Cleanup CSS print layout logic
                const header = document.getElementById('global-print-header');
                if(header) {
                    header.remove(); // or window.dispatchEvent(new Event('afterprint')); but simple remove is fine
                }
                
                if (res && res.success) {
                    alert('تم استخراج وحفظ التقرير كـ PDF بنجاح! ✅\n' + res.path);
                } else if (res && res.error) {
                    alert('حدث خطأ أثناء الاستخراج: ' + res.error);
                }
                return;
            } catch (err) {
                console.error(err);
            }
        }
    }
    // Fallback if not electron
    window.print();
};

// ============== GLOBAL PRINT & PDF DESIGN ENGINE ==============
window.addEventListener('beforeprint', () => {
    let header = document.getElementById('global-print-header');
    if (!header) {
        header = document.createElement('div');
        header.id = 'global-print-header';
        const main = document.querySelector('.main-content') || document.body;
        if(main.firstChild) main.insertBefore(header, main.firstChild);
        else main.appendChild(header);
    }
    
    const sysRaw = localStorage.getItem('restaurant_settings');
    const sys = sysRaw ? JSON.parse(sysRaw) : {};
    const logoSrc = (sys.logo && sys.logo !== '1111.png') ? sys.logo : '1111.png';
    
    // Try to find a meaningful page title, fallback to page title tag
    let pageTitle = document.title;
    const h2 = document.querySelector('.top-header h2') || document.querySelector('.page-title h1') || document.querySelector('h2');
    if(h2) pageTitle = h2.innerText;
    
    const dateStr = new Date().toLocaleString('ar-SA', { hour12: false });
    
    header.innerHTML = `
        <div style="width:100%; display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #0f172a !important; padding-bottom:20px; margin-bottom:25px; background:#fff !important;">
            
            <div style="text-align:right; width:33%;">
                <h1 style="margin:0; font-size:26px; font-weight:900; color:#0f172a !important;">${sys.name || 'هـــش HASH'}</h1>
                <p style="margin:5px 0 0; font-size:15px; font-weight:600; color:#475569 !important;">الفرع: ${sys.branch || 'الرئيسي'}</p>
                <p style="margin:2px 0 0; font-size:15px; font-weight:600; color:#475569 !important;">للتواصل: ${sys.phone || '---'}</p>
            </div>
            
            <div style="text-align:center; width:33%; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <img src="${logoSrc}" style="height:75px; object-fit:contain; margin-bottom:12px;" onerror="this.src='placeholder.svg'">
                <div style="background:#f8fafc !important; padding:6px 20px; border:2px solid #cbd5e1 !important; border-radius:25px;">
                    <span style="font-size:17px; font-weight:800; color:#0f172a !important;">${pageTitle}</span>
                </div>
            </div>
            
            <div style="text-align:left; width:33%;">
                <div style="border:2px solid #cbd5e1 !important; padding:12px 16px; border-radius:8px; display:inline-block; text-align:right; background:#f8fafc !important;">
                    <p style="margin:0 0 6px; font-size:13px; font-weight:800; color:#475569 !important;">تاريخ التصدير / الطباعة:</p>
                    <p style="margin:0; font-weight:900; font-size:15px; color:#0f172a !important;" dir="ltr">${dateStr}</p>
                </div>
            </div>
            
        </div>
    `;
});
