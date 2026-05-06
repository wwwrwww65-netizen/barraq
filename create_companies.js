const fs = require('fs');
let html = fs.readFileSync('customers.html', 'utf8');

// Replace title
html = html.replace('<title>Mister Casher - إدارة العملاء</title>', '<title>Mister Casher - شركات التوصيل</title>');

// Replace css links
html = html.replace('<link rel="stylesheet" href="customers.css">', '');

// Title: 
html = html.replace(/<div class="dashboard-header">[\s\S]*?<\/div>\s*<\/div>/, `<div class="dashboard-header">
                <div>
                    <h1>شركات التوصيل</h1>
                    <p>إدارة وتتبع شركات التوصيل والمناديب المعتمدين</p>
                </div>
                <div class="header-actions">
                    <button class="btn-primary" id="btn-add-company"><i class="ph ph-plus"></i> إضافة شركة توصيل</button>
                    <div class="user-profile">
                        <img src="avatar.svg" alt="User" class="avatar" id="user-avatar">
                        <div class="user-info">
                            <span class="user-name">جاري التحميل...</span>
                            <span class="user-role">...</span>
                        </div>
                    </div>
                </div>
            </div>`);

// Replace stats section (KPIs)
html = html.replace(/<div class="kpi-cards">[\s\S]*?<\/div>/, `<div class="kpi-cards">
                <div class="card kpi-card">
                    <div class="kpi-icon" style="color: #3b82f6; background: rgba(59, 130, 246, 0.1);"><i class="ph ph-buildings"></i></div>
                    <div class="kpi-details">
                        <p class="kpi-title">إجمالي الشركات</p>
                        <h3 class="kpi-value" id="total-companies">0</h3>
                    </div>
                </div>
                <div class="card kpi-card">
                    <div class="kpi-icon" style="color: #10b981; background: rgba(16, 185, 129, 0.1);"><i class="ph ph-check-circle"></i></div>
                    <div class="kpi-details">
                        <p class="kpi-title">الشركات النشطة</p>
                        <h3 class="kpi-value" id="active-companies">0</h3>
                    </div>
                </div>
            </div>`);

// Replace Search box
html = html.replace(/<input type="text" id="search-customer" placeholder="ابحث بالاسم أو رقم الهاتف...">/, '<input type="text" id="search-company" placeholder="ابحث باسم الشركة أو رقم الهاتف...">');

// Replace table header
html = html.replace(/<thead>\s*<tr>\s*<th>اسم العميل<\/th>\s*<th>رقم الهاتف<\/th>\s*<th>عدد الطلبات<\/th>\s*<th>إجمالي المشتريات<\/th>\s*<th>إجراءات<\/th>\s*<\/tr>\s*<\/thead>/, `<thead>
                                <tr>
                                    <th>اسم الشركة</th>
                                    <th>رقم الهاتف</th>
                                    <th>العنوان / المقر</th>
                                    <th>الحالة</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>`);
                            
// Replace table body ID
html = html.replace(/<tbody id="customers-list">/, '<tbody id="companies-list">');

// Replace the modal
html = html.replace(/<div class="modal-overlay" id="add-customer-modal">[\s\S]*?<!-- Modal for Customer Info -->/m, `<div class="modal-overlay" id="add-company-modal">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3 id="modal-company-title"><i class="ph ph-buildings"></i> إضافة شركة توصيل جديدة</h3>
                <button class="close-modal" id="btn-close-company-modal"><i class="ph ph-x"></i></button>
            </div>
            <div class="modal-body">
                <form id="form-add-company">
                    <input type="hidden" id="edit-comp-idx" value="">
                    <div class="form-group">
                        <label for="comp-name">اسم الشركة <span class="required">*</span></label>
                        <input type="text" id="comp-name" class="input-modern" required placeholder="مثال: هنقرستيشن، جاهز، تويو...">
                    </div>
                    <div class="form-group">
                        <label for="comp-phone">رقم هاتف التواصل</label>
                        <input type="tel" id="comp-phone" class="input-modern" placeholder="اختياري">
                    </div>
                    <div class="form-group">
                        <label for="comp-address">العنوان / المقر</label>
                        <input type="text" id="comp-address" class="input-modern" placeholder="اختياري">
                    </div>
                    <div class="form-group" style="display:flex; align-items:center; gap:10px; margin-top:20px;">
                        <label style="font-weight:bold; cursor:pointer;">حالة التفعيل:</label>
                        <input type="checkbox" id="comp-active" checked style="width:20px; height:20px; accent-color:var(--accent-blue);">
                        <span style="color:var(--text-muted); font-size:13px;">(يظهر في قائمة الدفع في الكاشير)</span>
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 20px;"><i class="ph ph-floppy-disk"></i> حفظ بيانات الشركة</button>
                </form>
            </div>
        </div>
    </div>
    
    <!-- Script overrides -->`);

// Replace script imports
html = html.replace(/<script src="customers\.js"><\/script>/, '<script src="delivery-companies.js"></script>');

fs.writeFileSync('delivery-companies.html', html);
console.log('delivery-companies.html created');
