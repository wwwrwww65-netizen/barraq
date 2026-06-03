const fs = require('fs');
const files = fs.readdirSync('.');
files.filter(f => f.endsWith('.html')).forEach(f => {
    let html = fs.readFileSync(f, 'utf8');
    let changed = false;

    // Add Delivery Companies before settings
    if (html.includes('href="settings.html"') && !html.includes('sales-channels.html')) {
        html = html.replace(
            /(<a\s+href="settings\.html"\s+class="nav-item".*?>)/,
            '<a href="sales-channels.html" class="nav-item"><i class="ph ph-buildings"></i><span>قنوات البيع</span></a>\n                    $1'
        );
        changed = true;
    }

    // Add container for dynamic delivery companies after hungerstation
    if (html.includes('href="sales-channel-integration.html"') && !html.includes('id="dynamic-delivery-companies-nav"')) {
        html = html.replace(
            /(<a\s+href="hungerstation\.html"\s+class="nav-item".*?>.*?<\/a>)/,
            '$1\n                    <div id="dynamic-delivery-companies-nav"></div>'
        );
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(f, html);
        console.log('Updated ' + f);
    }
});
