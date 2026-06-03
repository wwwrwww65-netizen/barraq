const fs = require('fs');
const path = require('path');

function updateSidebar() {
    const dir = __dirname;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

    files.forEach(file => {
        const filePath = path.join(dir, file);
        let html = fs.readFileSync(filePath, 'utf8');

        // Only process files that contain the sidebar nav-menu
        if (html.includes('<nav class="nav-menu">')) {
            // Check if we already added the group
            if (!html.includes('<p class="nav-label">قنوات البيع</p>')) {
                // Find where the old Hungerstation link is and extract it out into a new group
                // In some files, it's inside `<div class="nav-group">`
                // Let's replace the existing HungerStation block
                
                // Regex to find hungerstation and the dynamic nav
                const regex = /<a href="hungerstation\.html"[^>]*>.*?<\/a>\s*<div id="dynamic-delivery-companies-nav"><\/div>/s;
                
                if (regex.test(html)) {
                    // Remove it from its current location
                    html = html.replace(regex, '');
                    
                    // Now inject it right BEFORE <div class="nav-group">\s*<p class="nav-label">المبيعات والمنتجات والأصناف<\/p>
                    // Or right AFTER the first nav-group
                    const injectPoint = /<\/div>\s*<div class="nav-group">\s*<p class="nav-label">المبيعات والمنتجات والأصناف<\/p>/;
                    
                    if (injectPoint.test(html)) {
                        html = html.replace(injectPoint, `</div>
                <div class="nav-group">
                    <p class="nav-label">قنوات البيع</p>
                    <a href="sales-channel-integration.html" class="nav-item" id="hungerstation-nav"><i class="ph ph-motorcycle"></i><span>هنقرستيشن</span></a>
                    <div id="dynamic-delivery-companies-nav"></div>
                </div>
                <div class="nav-group">
                    <p class="nav-label">المبيعات والمنتجات والأصناف</p>`);
                    } else {
                        // fallback for files without nav-group like staff.html
                        const genericInjectPoint = /<a href="kitchen-production\.html" class="nav-item">.*?<\/a>/;
                        if (genericInjectPoint.test(html)) {
                            html = html.replace(genericInjectPoint, `$&
                <div class="nav-divider"></div>
                <p class="nav-label">قنوات البيع</p>
                <a href="sales-channel-integration.html" class="nav-item" id="hungerstation-nav"><i class="ph ph-motorcycle"></i><span>هنقرستيشن</span></a>
                <div id="dynamic-delivery-companies-nav"></div>`);
                        }
                    }
                }
            }

            fs.writeFileSync(filePath, html);
            console.log(`Updated sidebar in ${file}`);
        }
    });
}

updateSidebar();
