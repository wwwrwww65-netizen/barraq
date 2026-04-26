
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

function applyHistoryFilters() {
    if (!db.hrExpenses) db.hrExpenses = [];
    
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
        filtered = filtered.filter(exp => exp.type === typeFilter);
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
}

function updateHistorySummary(expenses) {
    const totalCount = expenses.length;
    const totalSalary = expenses.filter(e => e.type === 'salary').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalAdvance = expenses.filter(e => e.type === 'advance').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalBonus = expenses.filter(e => e.type === 'bonus').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalDeduction = expenses.filter(e => e.type === 'خصم / جزاء').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    
    document.getElementById('history-total-count').textContent = totalCount;
    document.getElementById('history-total-salary').innerHTML = `${xfNum(totalSalary)} <span class="js-cur-sym" style="font-size:14px">${curSym()}</span>`;
    document.getElementById('history-total-advance').innerHTML = `${xfNum(totalAdvance)} <span class="js-cur-sym" style="font-size:14px">${curSym()}</span>`;
    document.getElementById('history-total-bonus').innerHTML = `${xfNum(totalBonus)} <span class="js-cur-sym" style="font-size:14px">${curSym()}</span>`;
    document.getElementById('history-total-deduction').innerHTML = `${xfNum(totalDeduction)} <span class="js-cur-sym" style="font-size:14px">${curSym()}</span>`;
}

function renderHistoryTable(expenses) {
    const tbody = document.getElementById('history-tbody');
    const emptyState = document.getElementById('history-empty-state');
    
    if (!tbody) return;
    
    if (expenses.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    tbody.innerHTML = expenses.map((exp, realIndex) => {
        const originalIndex = db.hrExpenses.indexOf(exp);
        const typeConfig = getTypeConfig(exp.type);
        const methodText = exp.pMethod === 'bank' ? 'تحويل بنكي' : 'نقدي (كاش)';
        
        return `
            <tr>
                <td><strong style="color:#8b5cf6; font-family:monospace;">${exp.voucherNo || '---'}</strong></td>
                <td>${exp.date || '---'}</td>
                <td><strong>${exp.employee || '---'}</strong></td>
                <td><span class="history-type-badge ${typeConfig.class}"><i class="${typeConfig.icon}"></i> ${typeConfig.label}</span></td>
                <td><strong style="color:${typeConfig.color}; font-size:15px;">${xfNum(exp.amount)} ${curSym()}</strong></td>
                <td>${methodText}</td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${exp.reason || ''}">${exp.reason || '---'}</td>
                <td style="white-space:nowrap;">
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
    switch(type) {
        case 'salary':
            return { class: 'type-salary', icon: 'ph ph-money', label: 'راتب', color: '#6366f1' };
        case 'advance':
            return { class: 'type-advance', icon: 'ph ph-hand-coins', label: 'سلفة', color: '#f59e0b' };
        case 'bonus':
            return { class: 'type-bonus', icon: 'ph ph-gift', label: 'مكافأة', color: '#10b981' };
        case 'خصم / جزاء':
            return { class: 'type-penalty', icon: 'ph ph-warning-octagon', label: 'خصم / جزاء', color: '#ef4444' };
        default:
            return { class: 'type-salary', icon: 'ph ph-receipt', label: type, color: '#6b7280' };
    }
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
        const configMap = {
            'salary': {
                title: 'سند صرف راتب',
                recipientLabel: 'تم صرف للأخ :',
                amountLabel: 'مبلغ وقدره :',
                notes: 'راتب شهري - تم الصرف نقداً'
            },
            'advance': {
                title: 'سند سلفة',
                recipientLabel: 'تم صرف للأخ :',
                amountLabel: 'مبلغ وقدره :',
                notes: 'سلفة مالية - تُخصم من الراتب'
            },
            'bonus': {
                title: 'سند مكافأة',
                recipientLabel: 'تم صرف للأخ :',
                amountLabel: 'مبلغ وقدره :',
                notes: 'مكافأة - تم الصرف نقداً'
            },
            'خصم / جزاء': {
                title: 'سند خصم / جزاء',
                recipientLabel: 'يُخصم من الأخ :',
                amountLabel: 'مبلغ وقدره :',
                notes: 'خصم/جزاء - ' + (entry.reason || 'بدون سبب محدد')
            }
        };
        
        const config = configMap[entry.type] || configMap['salary'];
        
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
            if (entry.type === 'salary' || entry.type === 'bonus') {
                balanceBox.style.display = 'inline-flex';
                document.getElementById('v-label-balance').textContent = 'الرصيد لكم :';
                document.getElementById('v-balance-text').textContent = 'تم الصرف';
            } else if (entry.type === 'خصم / جزاء') {
                balanceBox.style.display = 'inline-flex';
                document.getElementById('v-label-balance').textContent = 'المبلغ على :';
                document.getElementById('v-balance-text').textContent = xfNum(entry.amount) + ' ' + curSym();
            } else if (entry.type === 'advance') {
                balanceBox.style.display = 'inline-flex';
                document.getElementById('v-label-balance').textContent = 'الرصيد عليكم :';
                document.getElementById('v-balance-text').textContent = xfNum(entry.amount) + ' ' + curSym();
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
    if (!db.hrExpenses || db.hrExpenses.length === 0) {
        alert('لا توجد بيانات للتصدير');
        return;
    }
    
    let csv = '\ufeffرقم السند,التاريخ,الموظف,نوع العملية,المبلغ,طريقة الصرف,البيان\n';
    
    db.hrExpenses.forEach(exp => {
        const typeMap = {
            'salary': 'راتب',
            'advance': 'سلفة',
            'bonus': 'مكافأة',
            'خصم / جزاء': 'خصم / جزاء'
        };
        const methodText = exp.pMethod === 'bank' ? 'تحويل بنكي' : 'نقدي';
        
        csv += `${exp.voucherNo || ''},${exp.date || ''},${exp.employee || ''},${typeMap[exp.type] || exp.type},${exp.amount || 0},${methodText},${(exp.reason || '').replace(/,/g, '،')}\n`;
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
