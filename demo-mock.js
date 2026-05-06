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
                // Trigger CSS print layout logic (handles white background via @media print)
                window.dispatchEvent(new Event('beforeprint'));
                
                const res = await ipcRenderer.invoke('export-pdf', filename);
                
                // Cleanup CSS print layout logic
                const header = document.getElementById('global-print-header');
                if(header) {
                    header.remove();
                }
                
                if (res && res.success) {
                    alert('تم استخراج وحفظ التقرير كـ PDF بنجاح! ✅\n' + res.path);
                } else if (res && res.error) {
                    alert('حدث خطأ أثناء الاستخراج: ' + res.error);
                }
                return;
            } catch (err) {
                console.error(err);
            } finally {
                const header = document.getElementById('global-print-header');
                if (header) {
                    header.remove();
                }
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
        header.style.display = 'none'; // مخفي عن الشاشة، يظهر فقط أثناء الطباعة بإعدادات CSS
        const main = document.querySelector('.main-content') || document.body;
        if(main.firstChild) main.insertBefore(header, main.firstChild);
        else main.appendChild(header);
    }
    
    const sysRaw = localStorage.getItem('restaurant_settings');
    const sys = sysRaw ? JSON.parse(sysRaw) : {};
    const logoSrc = (sys.logo && sys.logo !== '1111.png') ? sys.logo : '1111.png';
    
    // Try to find a meaningful page title
    let pageTitle = document.title;
    // Priority: #page-title element > .top-header h2 > any h2 > document.title
    const pageTitleEl = document.getElementById('page-title') ||
                        document.querySelector('.top-header h2') ||
                        document.querySelector('.page-title h1') ||
                        document.querySelector('h2');
    if (pageTitleEl) pageTitle = pageTitleEl.innerText.trim();

    // Detect filtered period — supports both standard period-filter, history-date-filter, and button filters
    let periodInfo = "";
    const periodSelect = 
        document.querySelector('select[id*="period-filter"]') ||
        document.getElementById('history-date-filter') ||
        document.querySelector('select[id*="date-filter"]');
        
    const periodButton = 
        document.querySelector('.date-btn.active[data-range]') ||
        document.querySelector('.glass-btn.active[data-range]');
    
    // Period label mappings for non-standard selects (like history-date-filter) and buttons
    const periodLabelMap = {
        'all': null, 'today': 'اليوم', 'day': 'اليوم',
        'yesterday': 'أمس', 'week': 'هذا الأسبوع', '1week': 'هذا الأسبوع',
        '7days': 'آخر 7 أيام', 'month': 'هذا الشهر', 'this_month': 'هذا الشهر',
        'last_month': 'الشهر الماضي', 'quarter': 'هذا الربع', 'year': 'هذه السنة', 'custom': 'فترة مخصصة'
    };

    let val = null;
    let text = '';

    if (periodButton) {
        val = periodButton.getAttribute('data-range');
        text = periodLabelMap[val] || periodButton.innerText.trim();
    } else if (periodSelect) {
        val = periodSelect.value;
        text = periodLabelMap[val] || periodSelect.options[periodSelect.selectedIndex]?.text || '';
    }

    if (val && val !== 'all' && text) {
        let dateDetails = '';
        
        if (val === 'custom') {
            const fDate = document.querySelector('input[id*="date-from"]')?.value;
            const tDate = document.querySelector('input[id*="date-to"]')?.value;
            if (fDate && tDate) {
                dateDetails = `<br><span style="font-size:12px; font-weight:700; color:#64748b !important; display:inline-block; margin-top:3px;">(من: <span dir="ltr">${fDate}</span> إلى: <span dir="ltr">${tDate}</span>)</span>`;
            }
        } else if (val !== 'today' && val !== 'day') {
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            let startDate = null;
            let endDate = new Date();
            
            if (val === 'yesterday') {
                startDate = new Date(startOfToday);
                startDate.setDate(startDate.getDate() - 1);
                endDate = new Date(startDate);
            } else if (val === 'week' || val === '1week' || val === '7days') {
                startDate = new Date(startOfToday);
                startDate.setDate(startDate.getDate() - 7);
            } else if (val === 'month' || val === 'this_month') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            } else if (val === 'quarter') {
                let qMonth = Math.floor(now.getMonth() / 3) * 3;
                startDate = new Date(now.getFullYear(), qMonth, 1);
            } else if (val === 'year') {
                startDate = new Date(now.getFullYear(), 0, 1);
            }

            if (startDate) {
                const fDate = startDate.toISOString().split('T')[0];
                const tDate = endDate.toISOString().split('T')[0];
                if (fDate === tDate) {
                    dateDetails = `<br><span style="font-size:12px; font-weight:700; color:#64748b !important; display:inline-block; margin-top:3px;">(بتاريخ: <span dir="ltr">${fDate}</span>)</span>`;
                } else {
                    dateDetails = `<br><span style="font-size:12px; font-weight:700; color:#64748b !important; display:inline-block; margin-top:3px;">(من: <span dir="ltr">${fDate}</span> إلى: <span dir="ltr">${tDate}</span>)</span>`;
                }
            }
        }
        periodInfo = `<div style="font-size:14px; font-weight:800; color:#334155 !important; margin-top:6px; text-align:center; line-height:1.4;">${text} ${dateDetails}</div>`;
    }
    
    const dateStr = new Date().toLocaleString('en-GB', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
    
    header.innerHTML = `
        <div style="width:100%; display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #0f172a !important; padding:15px 30px 20px 30px; margin-bottom:25px; background:#fff !important; font-family: 'Cairo', sans-serif;">
            
            <!-- Left Section: Restaurant Info -->
            <div style="text-align:right; width:35%; padding-right:15px;">
                <h1 style="margin:0 0 10px 0; font-size:26px; font-weight:900; color:#0f172a !important; line-height:1.2;">${sys.name || 'هـــش HASH'}</h1>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    ${sys.branch ? `<p style="margin:0; font-size:14px; font-weight:600; color:#475569 !important;"><i class="ph ph-map-pin" style="font-size:14px;"></i> ${sys.branch}</p>` : ''}
                    ${sys.phone ? `<p style="margin:0; font-size:14px; font-weight:600; color:#475569 !important;" dir="ltr"><i class="ph ph-phone" style="font-size:14px;"></i> ${sys.phone}</p>` : ''}
                    ${sys.tax ? `<p style="margin:0; font-size:13px; font-weight:600; color:#64748b !important;">الرقم الضريبي: <span dir="ltr">${sys.tax}</span></p>` : ''}
                    ${sys.whatsapp ? `<p style="margin:0; font-size:13px; font-weight:600; color:#64748b !important;" dir="ltr"><i class="ph ph-whatsapp-logo" style="font-size:14px;"></i> ${sys.whatsapp}</p>` : ''}
                </div>
            </div>
            
            <!-- Center Section: Logo & Report Title -->
            <div style="text-align:center; width:30%; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:0 10px;">
                <img src="${logoSrc}" style="width:auto;height:auto;max-height:110px;max-width:250px;object-fit:contain;margin-bottom:10px;" onerror="this.src='placeholder.svg'">
                <div style="background:#f8fafc !important; padding:8px 24px; border:2px solid #cbd5e1 !important; border-radius:25px; box-shadow:0 2px 8px rgba(0,0,0,0.05) !important;">
                    <span style="font-size:16px; font-weight:800; color:#0f172a !important;">${pageTitle}</span>
                    ${periodInfo}
                </div>
            </div>
            
            <!-- Right Section: Export Date/Time -->
            <div style="text-align:left; width:35%; padding-left:15px;">
                <div style="border:2px solid #cbd5e1 !important; padding:14px 18px; border-radius:10px; display:inline-block; text-align:right; background:#f8fafc !important; box-shadow:0 2px 8px rgba(0,0,0,0.05) !important;">
                    <p style="margin:0 0 8px; font-size:12px; font-weight:700; color:#64748b !important; text-transform:uppercase; letter-spacing:0.5px;">تاريخ ووقت التصدير</p>
                    <p style="margin:0; font-weight:900; font-size:15px; color:#0f172a !important;" dir="ltr">${dateStr}</p>
                    ${sys.taxRate ? `<p style="margin:6px 0 0 0; font-size:12px; font-weight:600; color:#64748b !important;">نسبة الضريبة: ${sys.taxRate}%</p>` : ''}
                </div>
            </div>
            
        </div>
    `;
});

window.addEventListener('afterprint', () => {
    const header = document.getElementById('global-print-header');
    if (header) header.remove();
});
