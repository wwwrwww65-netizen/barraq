
/**
 * Staff Totals Report Logic
 */
window.renderStaffTotals = function() {
    if (!db.employees) return;
    if (!db.hrExpenses) db.hrExpenses = [];

    // Ensure balances are fresh
    if (typeof calculateHistoricalBalances === 'function') {
        calculateHistoricalBalances();
    }

    const tbody = document.getElementById('staff-totals-tbody');
    if (!tbody) return;

    // Get last payment for each employee
    const lastPayments = {};
    db.hrExpenses.forEach(exp => {
        const empName = exp.employee;
        if (!lastPayments[empName] || (exp.timestamp || 0) > (lastPayments[empName].timestamp || 0)) {
            // Consider all types that represent a payment/withdrawal
            lastPayments[empName] = exp;
        }
    });

    tbody.innerHTML = db.employees.map(emp => {
        const lastPay = lastPayments[emp.name];
        const lastPayDate = lastPay ? lastPay.date : 'لا يوجد سجلات';
        
        // Use the salary logic from staff.js for consistency
        const paidSalary = typeof getEmpPaidSalary === 'function' ? getEmpPaidSalary(emp.name) : 0;
        const balance = Math.max(0, (emp.salary || 0) - (emp.loans || 0) - paidSalary);
        
        return `
            <tr>
                <td><strong>${emp.name}</strong></td>
                <td style="color: var(--text-muted); font-size: 13px;">${emp.role || '—'}</td>
                <td><strong style="color: #3b82f6; font-size: 16px;">${xfNum(balance)} ${curSym()}</strong></td>
                <td style="font-weight: 700; color: #475569;">${lastPayDate}</td>
            </tr>
        `;
    }).join('');
};

window.exportStaffTotalsPDF = function() {
    const d = new Date();
    const dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    // Prepare for print
    const allViews = document.querySelectorAll('.hr-view');
    const prevDisplayMap = new Map();
    allViews.forEach(v => {
        prevDisplayMap.set(v, v.style.display);
        v.style.display = 'none';
    });

    const totalsView = document.getElementById('view-staff-totals');
    if (totalsView) totalsView.style.display = 'block';

    const titleEl = document.getElementById('page-title');
    const prevTitle = titleEl ? titleEl.textContent : '';
    if (titleEl) titleEl.textContent = 'تقرير إجماليات أرصدة الموظفين';

    // Use dedicated print class
    document.body.classList.add('print-mode-totals');

    const restore = () => {
        allViews.forEach(v => v.style.display = prevDisplayMap.get(v) || '');
        if (titleEl) titleEl.textContent = prevTitle;
        document.body.classList.remove('print-mode-totals');
    };

    if (typeof window.exportPageToPDF === 'function') {
        // Increase timeout to ensure table is rendered and visible to PDF engine
        setTimeout(() => {
            window.exportPageToPDF('إجماليات_الموظفين_' + dateStr + '.pdf')
                .finally(restore);
        }, 500);
    } else {
        window.print();
        setTimeout(restore, 1500);
    }
};

// Hook into showView if needed
const originalShowView = window.showView;
window.showView = function(viewId, navId) {
    if (viewId === 'view-staff-totals') {
        renderStaffTotals();
    }
    originalShowView(viewId, navId);
};
