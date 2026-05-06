
// HR History Functions (Global Scope)
function loadHistoryData() {
    if (!db.hrExpenses) db.hrExpenses = [];
    
    const empFilter = document.getElementById('history-employee-filter');
    if (empFilter) {
        empFilter.innerHTML = '<option value="all">كل الموظفين</option>';
        db.employees.forEach(emp => {
            empFilter.innerHTML += `<option value="${emp.name}">${emp.name}</option>`;
        });
    }
    
    applyHistoryFilters();
}

function calculateHistoricalBalances() {
    if (!db.hrExpenses) return;

    const employeeExpenses = {};
    db.hrExpenses.forEach(exp => {
        if (!employeeExpenses[exp.employee]) employeeExpenses[exp.employee] = [];
        employeeExpenses[exp.employee].push(exp);
    });

    const globalReset = db.hrCycle?.lastResetAt || 0;

    Object.keys(employeeExpenses).forEach(empName => {
        const emp = db.employees?.find(e => e.name === empName);
        const salary = Number(emp?.salary) || 0;
        
        let loans = 0;
        let paidSalary = 0;
        let bonuses = 0;
        let lastProcessedTime = 0;

        // Sort chronologically (oldest first)
        employeeExpenses[empName].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        employeeExpenses[empName].forEach(h => {
            const t = h.timestamp || 0;
            
            // Check if we crossed the global reset boundary
            if (lastProcessedTime < globalReset && t >= globalReset && globalReset > 0) {
                loans = 0;
                paidSalary = 0;
                bonuses = 0;
            }

            if (h.type === 'تصفير حساب') {
                loans = 0;
                paidSalary = 0;
                bonuses = 0;
            } else if (h.type.includes('سلفة') || h.type.includes('خصم') || h.type.includes('جزاء')) {
                // السلف والخصومات تُنقص من الرصيد
                loans += Number(h.amount) || 0;
            } else if (h.type.includes('مكافأة')) {
                // المكافأة تُضاف للرصيد (دخل إضافي)
                bonuses += Number(h.amount) || 0;
            } else if (h.type.includes('راتب')) {
                // الراتب المدفوع يُنقص من الرصيد
                paidSalary += Number(h.amount) || 0;
            }
            
            // المعادلة: الراتب الأساسي + المكافآت - السلف والخصومات - الراتب المدفوع
            h._historicalBalance = Math.max(0, salary + bonuses - loans - paidSalary);
            lastProcessedTime = Math.max(lastProcessedTime, t);
        });
    });
}

function applyHistoryFilters() {
    if (!db.hrExpenses) db.hrExpenses = [];
    
    // Calculate true historical balances first
    calculateHistoricalBalances();
    
    let filtered = [...db.hrExpenses];
    
    const dateFilter = document.getElementById('history-date-filter')?.value || 'all';
    const now = new Date();
    
    if (dateFilter !== 'all') {
        filtered = filtered.filter(exp => {
            const expDate = new Date(exp.timestamp || exp.date);
            
            if (dateFilter === 'today') {
                return expDate.toDateString() === now.toDateString();
            } else if (dateFilter === 'week') {
                const weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
                return expDate >= weekAgo;
            } else if (dateFilter === 'month') {
                return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
            } else if (dateFilter === 'custom') {
                const dateFrom = document.getElementById('history-date-from')?.value;
                const dateTo = document.getElementById('history-date-to')?.value;
                
                if (dateFrom) {
                    const from = new Date(dateFrom);
                    from.setHours(0, 0, 0, 0);
                    if (expDate < from) return false;
                }
                
                if (dateTo) {
                    const to = new Date(dateTo);
                    to.setHours(23, 59, 59, 999);
                    if (expDate > to) return false;
                }
                
                return true;
            }
            
            return true;
        });
    }
    
    const typeFilter = document.getElementById('history-type-filter')?.value || 'all';
    if (typeFilter !== 'all') {
        filtered = filtered.filter(exp => exp.type && exp.type.includes(typeFilter));
    }
    
    const empFilter = document.getElementById('history-employee-filter')?.value || 'all';
    if (empFilter !== 'all') {
        filtered = filtered.filter(exp => exp.employee === empFilter);
    }
    
    const searchTerm = document.getElementById('history-search')?.value?.toLowerCase() || '';
    if (searchTerm) {
        filtered = filtered.filter(exp => 
            (exp.voucherNo && exp.voucherNo.toLowerCase().includes(searchTerm)) ||
            (exp.reason && exp.reason.toLowerCase().includes(searchTerm)) ||
            (exp.employee && exp.employee.toLowerCase().includes(searchTerm))
        );
    }
    
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    updateHistorySummary(filtered);
    renderHistoryTable(filtered);
    
    // Save filtered data for export
    window.currentFilteredHistory = filtered;
}

function updateHistorySummary(expenses) {
    const totalCount = expenses.length;
    const totalSalary = expenses.filter(e => e.type && e.type.includes('راتب')).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalAdvance = expenses.filter(e => e.type && e.type.includes('سلفة')).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalBonus = expenses.filter(e => e.type && e.type.includes('مكافأة')).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalDeduction = expenses.filter(e => e.type && (e.type.includes('خصم') || e.type.includes('جزاء'))).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    
    let totalRemaining = 0;
    const seenEmps = new Set();
    for (const exp of expenses) {
        if (!seenEmps.has(exp.employee)) {
            seenEmps.add(exp.employee);
            totalRemaining += exp._historicalBalance || 0;
        }
    }
    
    // Update KPI cards
    document.getElementById('history-total-count').textContent = totalCount;
    document.getElementById('history-total-salary').innerHTML = `${xfNum(totalSalary)} <span class="js-cur-sym" style="font-size:14px">${curSym()}</span>`;
    document.getElementById('history-total-advance').innerHTML = `${xfNum(totalAdvance)} <span class="js-cur-sym" style="font-size:14px">${curSym()}</span>`;
    document.getElementById('history-total-bonus').innerHTML = `${xfNum(totalBonus)} <span class="js-cur-sym" style="font-size:14px">${curSym()}</span>`;
    document.getElementById('history-total-deduction').innerHTML = `${xfNum(totalDeduction)} <span class="js-cur-sym" style="font-size:14px">${curSym()}</span>`;
    
    const remEl = document.getElementById('history-total-remaining');
    if (remEl) {
        remEl.innerHTML = `${xfNum(totalRemaining)} <span class="js-cur-sym" style="font-size:14px">${curSym()}</span>`;
    }

    // Build period label for tfoot & print header
    const dateFilter = document.getElementById('history-date-filter')?.value || 'all';
    const typeFilter = document.getElementById('history-type-filter')?.value || 'all';
    const empFilter = document.getElementById('history-employee-filter')?.value || 'all';
    const periodLabels = {
        all: 'كل الفترات', today: 'اليوم', week: 'هذا الأسبوع', month: 'هذا الشهر', custom: 'تاريخ مخصص'
    };
    let periodText = periodLabels[dateFilter] || 'كل الفترات';
    if (dateFilter === 'custom') {
        const f = document.getElementById('history-date-from')?.value;
        const t = document.getElementById('history-date-to')?.value;
        if (f && t) periodText = `من: ${f} إلى: ${t}`;
        else if (f) periodText = `ابتداءً من: ${f}`;
        else if (t) periodText = `حتى: ${t}`;
    }
    let filterDetails = `الفترة: ${periodText}`;
    if (typeFilter !== 'all') filterDetails += `  |  النوع: ${typeFilter}`;
    if (empFilter !== 'all') filterDetails += `  |  الموظف: ${empFilter}`;

    // Update print-only header
    const printPeriodEl = document.getElementById('history-print-period');
    if (printPeriodEl) printPeriodEl.textContent = filterDetails;

    // Store totals for tfoot rendering
    window._historyTotals = { totalSalary, totalAdvance, totalBonus, totalDeduction, totalRemaining, totalCount, filterDetails, sym: curSym() };

    // Render tfoot
    renderHistoryTfoot();
}

function renderHistoryTfoot() {
    const tfoot = document.getElementById('history-tfoot');
    if (!tfoot) return;
    const t = window._historyTotals;
    if (!t) { tfoot.innerHTML = ''; return; }

    const sym = t.sym;
    const fNum = (n) => xfNum(n);

    tfoot.innerHTML = `
        <tr style="background:rgba(99,102,241,0.08); border-top:3px solid #6366f1;">
            <td colspan="4" style="padding:10px 12px; font-size:13px; font-weight:800; color:#6366f1 !important;">إجمالي الرواتب المصروفة</td>
            <td style="padding:10px 12px; font-size:15px; font-weight:900; color:#6366f1 !important;" dir="ltr">${fNum(t.totalSalary)} ${sym}</td>
            <td colspan="3" style="padding:10px 12px;"></td>
            <td class="no-print"></td>
        </tr>
        <tr style="background:rgba(245,158,11,0.08);">
            <td colspan="4" style="padding:8px 12px; font-size:13px; font-weight:700; color:#d97706 !important;">إجمالي السلف</td>
            <td style="padding:8px 12px; font-size:14px; font-weight:800; color:#d97706 !important;" dir="ltr">${fNum(t.totalAdvance)} ${sym}</td>
            <td colspan="3" style="padding:8px 12px;"></td>
            <td class="no-print"></td>
        </tr>
        <tr style="background:rgba(16,185,129,0.08);">
            <td colspan="4" style="padding:8px 12px; font-size:13px; font-weight:700; color:#059669 !important;">إجمالي المكافآت</td>
            <td style="padding:8px 12px; font-size:14px; font-weight:800; color:#059669 !important;" dir="ltr">${fNum(t.totalBonus)} ${sym}</td>
            <td colspan="3" style="padding:8px 12px;"></td>
            <td class="no-print"></td>
        </tr>
        <tr style="background:rgba(239,68,68,0.08);">
            <td colspan="4" style="padding:8px 12px; font-size:13px; font-weight:700; color:#dc2626 !important;">إجمالي الخصومات والجزاءات</td>
            <td style="padding:8px 12px; font-size:14px; font-weight:800; color:#dc2626 !important;" dir="ltr">${fNum(t.totalDeduction)} ${sym}</td>
            <td colspan="3" style="padding:8px 12px;"></td>
            <td class="no-print"></td>
        </tr>
        <tr style="background:rgba(59,130,246,0.12); border-top:3px solid #3b82f6;">
            <td colspan="4" style="padding:12px 12px; font-size:14px; font-weight:900; color:#2563eb !important;">إجمالي المتبقي من الرواتب</td>
            <td style="padding:12px 12px; font-size:16px; font-weight:900; color:#2563eb !important;" dir="ltr">${fNum(t.totalRemaining)} ${sym}</td>
            <td colspan="3" style="padding:12px 12px;"></td>
            <td class="no-print"></td>
        </tr>
        <tr style="background:rgba(0,0,0,0.03); border-top:2px dashed #94a3b8;">
            <td colspan="8" style="padding:8px 12px; font-size:11px; color:#64748b !important; text-align:center;">
                ${t.filterDetails}  —  إجمالي العمليات: ${t.totalCount}
            </td>
            <td class="no-print"></td>
        </tr>
    `;
}

function renderHistoryTable(expenses) {
    const tbody = document.getElementById('history-tbody');
    const emptyState = document.getElementById('history-empty-state');
    
    if (!tbody) return;
    
    if (expenses.length === 0) {
        tbody.innerHTML = '';
        const tfoot = document.getElementById('history-tfoot');
        if (tfoot) tfoot.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    tbody.innerHTML = expenses.map((exp, realIndex) => {
        const originalIndex = db.hrExpenses.indexOf(exp);
        const typeConfig = getTypeConfig(exp.type);
        const methodText = exp.pMethod === 'bank' ? 'تحويل بنكي' : 'نقدي (كاش)';
        const currentNet = exp._historicalBalance !== undefined ? exp._historicalBalance : 0;

        return `
            <tr>
                <td><strong style="color:#8b5cf6; font-family:monospace;">${exp.voucherNo || '---'}</strong></td>
                <td>${exp.date || '---'}</td>
                <td><strong>${exp.employee || '---'}</strong></td>
                <td><span class="history-type-badge ${typeConfig.class}"><i class="${typeConfig.icon}"></i> ${typeConfig.label}</span></td>
                <td><strong style="color:${typeConfig.color}; font-size:15px;">${xfNum(exp.amount)} ${curSym()}</strong></td>
                <td>${methodText}</td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${exp.reason || ''}">${exp.reason || '---'}</td>
                <td><strong style="color:#3b82f6; font-size:14px;">${xfNum(currentNet)} ${curSym()}</strong></td>
                <td class="no-print" style="white-space:nowrap;">
                    <button class="history-action-btn btn-edit" title="تعديل" onclick="editHistoryEntry(${originalIndex})">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="history-action-btn btn-download" title="تحميل المستند" onclick="downloadHistoryDocument(${originalIndex})">
                        <i class="ph ph-download-simple"></i>
                    </button>
                    <button class="history-action-btn btn-delete" title="حذف" onclick="deleteHistoryEntry(${originalIndex})">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}


function getTypeConfig(type) {
    if (!type) return { class: 'type-salary', icon: 'ph ph-receipt', label: 'غير محدد', color: '#6b7280' };
    
    if (type.includes('راتب')) {
        return { class: 'type-salary', icon: 'ph ph-money', label: type, color: '#6366f1' };
    } else if (type.includes('سلفة')) {
        return { class: 'type-advance', icon: 'ph ph-hand-coins', label: type, color: '#f59e0b' };
    } else if (type.includes('مكافأة')) {
        return { class: 'type-bonus', icon: 'ph ph-gift', label: type, color: '#10b981' };
    } else if (type.includes('خصم') || type.includes('جزاء')) {
        return { class: 'type-penalty', icon: 'ph ph-warning-octagon', label: type, color: '#ef4444' };
    } else if (type.includes('تصفير')) {
        return { class: 'type-salary', icon: 'ph ph-arrows-clockwise', label: type, color: '#8b5cf6' };
    }
    
    return { class: 'type-salary', icon: 'ph ph-receipt', label: type, color: '#6b7280' };
}

function resetHistoryFilters() {
    document.getElementById('history-date-filter').value = 'all';
    document.getElementById('history-type-filter').value = 'all';
    document.getElementById('history-employee-filter').value = 'all';
    document.getElementById('history-search').value = '';
    document.getElementById('history-custom-date').style.display = 'none';
    document.getElementById('history-date-from').value = '';
    document.getElementById('history-date-to').value = '';
    
    applyHistoryFilters();
}

async function editHistoryEntry(index) {
    if (!db.hrExpenses || !db.hrExpenses[index]) return;
    
    const entry = db.hrExpenses[index];
    
    const modal = document.getElementById('advance-modal');
    if (!modal) return;
    
    modal.dataset.editIndex = index;
    
    const empSelect = document.getElementById('voucher-employee');
    const amountInput = document.getElementById('voucher-amount');
    const reasonInput = document.getElementById('voucher-reason');
    const methodSelect = document.getElementById('voucher-pay-method');
    const typeSelect = document.getElementById('voucher-type');
    
    if (empSelect) empSelect.value = entry.employee;
    if (amountInput) amountInput.value = entry.amount;
    if (reasonInput) reasonInput.value = entry.reason || '';
    if (methodSelect) methodSelect.value = entry.pMethod || 'cash';
    if (typeSelect) typeSelect.value = entry.type;
    
    openHrModal('advance-modal');
}

async function downloadHistoryDocument(index) {
    if (!db.hrExpenses || !db.hrExpenses[index]) return;
    
    const entry = db.hrExpenses[index];
    
    try {
        const printContainer = document.getElementById('voucher-print-container');
        const voucherEl = document.getElementById('voucher-template');
        
        if (!printContainer || !voucherEl) {
            alert('خطأ: لم يتم العثور على قالب السند');
            return;
        }
        
        // تعيين العناوين والنصوص حسب نوع العملية
        let config = {
            title: 'سند صرف',
            recipientLabel: 'تم صرف للأخ :',
            amountLabel: 'مبلغ وقدره :',
            notes: 'صرف نقدي'
        };
        
        if (entry.type && entry.type.includes('راتب')) {
            config.title = 'سند صرف راتب';
            config.notes = 'راتب شهري - تم الصرف نقداً';
        } else if (entry.type && entry.type.includes('سلفة')) {
            config.title = 'سند سلفة';
            config.notes = 'سلفة مالية - تُخصم من الراتب';
        } else if (entry.type && entry.type.includes('مكافأة')) {
            config.title = 'سند مكافأة';
            config.notes = 'مكافأة - تم الصرف نقداً';
        } else if (entry.type && (entry.type.includes('خصم') || entry.type.includes('جزاء'))) {
            config.title = 'سند خصم / جزاء';
            config.recipientLabel = 'يُخصم من الأخ :';
            config.notes = 'خصم/جزاء - ' + (entry.reason || 'بدون سبب محدد');
        }
        
        // ملء بيانات القالب
        document.getElementById('v-doc-title').textContent = config.title;
        document.getElementById('v-label-recipient').textContent = config.recipientLabel;
        document.getElementById('v-label-amount').textContent = config.amountLabel;
        document.getElementById('v-date').textContent = entry.date || '---';
        document.getElementById('v-number').textContent = entry.voucherNo || '---';
        document.getElementById('v-name').textContent = entry.employee || '---';
        document.getElementById('v-amt').textContent = Number(entry.amount || 0).toLocaleString('en-US');
        document.getElementById('v-amt-text').textContent = numberToArabicWords(Number(entry.amount || 0));
        document.getElementById('v-reason-text').textContent = entry.reason || '---';
        
        // تحديث الملاحظات حسب نوع العملية وطريقة الدفع
        let notesText = config.notes;
        if (entry.type !== 'خصم / جزاء') {
            notesText = entry.pMethod === 'bank' ? 'تم الصرف عبر التحويل البنكي' : 'تم الصرف نقداً';
        }
        document.getElementById('v-notes').textContent = notesText;
        
        document.getElementById('v-bottom-date').textContent = new Date().toLocaleString('ar-SA');
        
        // تحديث صندوق الرصيد حسب نوع العملية
        const balanceBox = document.getElementById('v-label-balance')?.parentElement;
        if (balanceBox) {
            balanceBox.style.display = 'inline-flex';
            if (entry.type && (entry.type.includes('راتب') || entry.type.includes('مكافأة'))) {
                document.getElementById('v-label-balance').textContent = 'الرصيد المتبقي :';
                document.getElementById('v-balance-text').textContent = Number(entry._historicalBalance || 0).toLocaleString('en-US');
            } else if (entry.type && (entry.type.includes('خصم') || entry.type.includes('جزاء'))) {
                document.getElementById('v-label-balance').textContent = 'صافي الرصيد :';
                document.getElementById('v-balance-text').textContent = Number(entry._historicalBalance || 0).toLocaleString('en-US');
            } else if (entry.type && entry.type.includes('سلفة')) {
                document.getElementById('v-label-balance').textContent = 'الرصيد المتبقي :';
                document.getElementById('v-balance-text').textContent = Number(entry._historicalBalance || 0).toLocaleString('en-US');
            } else {
                balanceBox.style.display = 'none';
            }
        }
        
        printContainer.style.position = 'fixed';
        printContainer.style.top = '-9999px';
        printContainer.style.left = '0';
        printContainer.style.width = '820px';
        printContainer.style.opacity = '0';
        
        await new Promise(r => setTimeout(r, 150));
        
        const canvas = await html2canvas(voucherEl, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: 800,
            windowWidth: 1200
        });
        
        const link = document.createElement('a');
        link.download = `${entry.voucherNo || 'voucher'}_${entry.employee}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.click();
        
        // إعادة تعيين القالب للوضع الافتراضي بعد التحميل
        setTimeout(() => {
            document.getElementById('v-doc-title').textContent = 'سند صرف';
            document.getElementById('v-label-recipient').textContent = 'تم صرف للأخ :';
            document.getElementById('v-label-amount').textContent = 'مبلغ وقدره :';
            document.getElementById('v-date').textContent = '';
            document.getElementById('v-number').textContent = '';
            document.getElementById('v-name').textContent = '';
            document.getElementById('v-amt').textContent = '';
            document.getElementById('v-amt-text').textContent = '';
            document.getElementById('v-reason-text').textContent = '';
            document.getElementById('v-notes').textContent = '';
            document.getElementById('v-label-balance').textContent = 'الرصيد لكم :';
            document.getElementById('v-balance-text').textContent = '';
        }, 500);
        
    } catch (error) {
        console.error('Error downloading document:', error);
        alert('حدث خطأ أثناء تحميل المستند');
    }
}

async function deleteHistoryEntry(index) {
    if (!db.hrExpenses || !db.hrExpenses[index]) return;
    
    const entry = db.hrExpenses[index];
    
    const confirmed = confirm(
        `هل أنت متأكد من حذف هذا السند؟\n\n` +
        `رقم السند: ${entry.voucherNo || '---'}\n` +
        `الموظف: ${entry.employee || '---'}\n` +
        `المبلغ: ${xfNum(entry.amount)} ${curSym()}\n` +
        `النوع: ${entry.type}`
    );
    
    if (!confirmed) return;
    
    try {
        applyVoucherLoanDelta(entry, -1);
        db.hrExpenses.splice(index, 1);
        
        await persistDb();
        
        updateKPIs();
        renderEmployees();
        applyHistoryFilters();
        
        if (currentProfileId) openFullProfile(currentProfileId);
        
        alert('✅ تم حذف السند بنجاح');
    } catch (error) {
        console.error('Error deleting entry:', error);
        alert('حدث خطأ أثناء حذف السند');
    }
}

function exportHistoryToExcel() {
    const dataToExport = window.currentFilteredHistory || db.hrExpenses || [];
    
    if (dataToExport.length === 0) {
        alert('لا توجد بيانات للتصدير');
        return;
    }
    
    let csv = '\ufeffرقم السند,التاريخ,الموظف,نوع العملية,المبلغ,طريقة الصرف,البيان,الرصيد المتبقي\n';
    
    dataToExport.forEach(exp => {
        const methodText = exp.pMethod === 'bank' ? 'تحويل بنكي' : 'نقدي';
        
        const currentNet = exp._historicalBalance !== undefined ? exp._historicalBalance : 0;

        csv += `${exp.voucherNo || ''},${exp.date || ''},${exp.employee || ''},${exp.type || ''},${exp.amount || 0},${methodText},${(exp.reason || '').replace(/,/g, '،')},${currentNet}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `سجل_الموظفين_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    alert('✅ تم تصدير البيانات بنجاح');
}

function numberToArabicWords(num) {
    if (num === 0) return 'صفر';
    
    const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
    const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
    
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' و' + ones[num % 10] : '');
    if (num < 1000) return hundreds[Math.floor(num / 100)] + (num % 100 ? ' و' + numberToArabicWords(num % 100) : '');
    
    return num.toLocaleString('ar-SA');
}

function exportHistoryToPDF() {
    const dataToExport = window.currentFilteredHistory || db.hrExpenses || [];
    if (dataToExport.length === 0) {
        alert('لا توجد بيانات للطباعة');
        return;
    }

    const d = new Date();
    const dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    // ── 1. حفظ حالة كل hr-view ثم إخفاءها جميعاً ──────────────
    const allViews = document.querySelectorAll('.hr-view');
    const prevDisplayMap = new Map();
    allViews.forEach(v => {
        prevDisplayMap.set(v, v.style.display);
        v.style.display = 'none';
    });

    // ── 2. إظهار صفحة السجل الكامل فقط ───────────────────────
    const historyView = document.getElementById('view-history');
    if (historyView) historyView.style.display = 'block';

    // ── 3. ضبط body + عنوان الصفحة ────────────────────────────
    const prevDataView = document.body.dataset.currentView;
    document.body.dataset.currentView = 'view-history';
    const titleEl = document.getElementById('page-title');
    const prevTitle = titleEl ? titleEl.textContent : '';
    if (titleEl) titleEl.textContent = 'السجل الكامل لعمليات الموظفين';

    document.body.classList.add('print-mode-history');

    const restore = () => {
        allViews.forEach(v => v.style.display = prevDisplayMap.get(v) || '');
        document.body.dataset.currentView = prevDataView || 'view-history';
        if (titleEl) titleEl.textContent = prevTitle;
        document.body.classList.remove('print-mode-history');
    };

    // ── 4. التصدير ──────────────────────────────────────────────
    if (typeof window.exportPageToPDF === 'function') {
        setTimeout(() => {
            window.exportPageToPDF('السجل_الكامل_للموظفين_' + dateStr + '.pdf')
                .finally(restore);
        }, 100);
    } else {
        window.print();
        setTimeout(restore, 1500);
    }
}

