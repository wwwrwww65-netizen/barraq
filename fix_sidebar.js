const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html') && f !== 'pos.html');

files.forEach(f => {
    let html = fs.readFileSync(f, 'utf8');
    
    // First, let's clean up any previous injection of the group
    html = html.replace(/<div class="nav-group">\s*<p class="nav-label">قنوات البيع<\/p>\s*<a href="hungerstation\.html"[^>]*>.*?<\/a>\s*<div id="dynamic-delivery-companies-nav"><\/div>\s*<\/div>/g, '');
    html = html.replace(/<div class="nav-divider"><\/div>\s*<p class="nav-label">قنوات البيع<\/p>\s*<a href="hungerstation\.html"[^>]*>.*?<\/a>\s*<div id="dynamic-delivery-companies-nav"><\/div>/g, '');

    // Next, remove any lingering hungerstation link
    html = html.replace(/<a href="hungerstation\.html"[^>]*>.*?<\/a>/g, '');
    // remove dynamic container
    html = html.replace(/<div id="dynamic-delivery-companies-nav"><\/div>/g, '');

    // Now, insert the new group right before المبيعات والمنتجات والأصناف
    const targetGroup = /<div class="nav-group">\s*<p class="nav-label">المبيعات والمنتجات والأصناف<\/p>/;
    if (targetGroup.test(html)) {
        html = html.replace(targetGroup, `<div class="nav-group">
                    <p class="nav-label">قنوات البيع</p>
                    <a href="sales-channel-integration.html" class="nav-item" id="nav-hs"><i class="ph ph-motorcycle"></i><span>هنقرستيشن</span></a>
                    <div id="dynamic-delivery-companies-nav"></div>
                </div>
                $&`);
    } else {
        const fallbackTarget = /<div class="nav-divider"><\/div>\s*<p class="nav-label">العمليات والمخزون<\/p>/;
        if (fallbackTarget.test(html)) {
            html = html.replace(fallbackTarget, `<div class="nav-divider"></div>
                <p class="nav-label">قنوات البيع</p>
                <a href="sales-channel-integration.html" class="nav-item" id="nav-hs"><i class="ph ph-motorcycle"></i><span>هنقرستيشن</span></a>
                <div id="dynamic-delivery-companies-nav"></div>
                $&`);
        }
    }

    fs.writeFileSync(f, html);
    console.log('Fixed sidebar in ' + f);
});
