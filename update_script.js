const fs = require('fs');
let s = fs.readFileSync('script.js', 'utf8');

const injection = `
    // Populate dynamic delivery companies in sidebar
    const dynDelivNav = document.getElementById('dynamic-delivery-companies-nav');
    if (dynDelivNav && typeof window.dbRead === 'function') {
        window.dbRead().then(_db => {
            const companies = _db.deliveryCompanies || [];
            let html = '';
            companies.forEach(c => {
                if (c.name !== 'هنقرستيشن' && c.isActive !== false) {
                    html += \`
                    <a href="#" class="nav-item" onclick="alert('نظام \${c.name} سيتم إضافته قريباً!'); return false;" style="padding-right: 25px;">
                        <i class="ph ph-motorcycle"></i><span>\${c.name}</span>
                    </a>\`;
                }
            });
            dynDelivNav.innerHTML = html;
        }).catch(e => console.error('Error loading delivery companies for nav', e));
    }
`;

// Insert it somewhere inside DOMContentLoaded or at the end
if (!s.includes('dynamic-delivery-companies-nav')) {
    s += '\n// Dynamic Delivery Sidebar\ndocument.addEventListener("DOMContentLoaded", function() {' + injection + '});\n';
    fs.writeFileSync('script.js', s);
    console.log('script.js updated');
}
