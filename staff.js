// Handle Advance / Salary Modal

document.addEventListener('DOMContentLoaded', () => {
    const btnOpenModal = document.getElementById('btn-open-advance-modal');
    const btnCloseModal = document.getElementById('btn-close-advance-modal');
    const modal = document.getElementById('advance-modal');

    if (btnOpenModal && modal) {
        btnOpenModal.addEventListener('click', () => {
            modal.classList.add('active');
        });
        
        btnCloseModal.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }
});

function numToWords(amount) {
    // Very basic Arabic number translation for demo purposes
    const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
    const tens = ['', 'عشر', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
    const thousands = ['', 'ألف', 'ألفان', 'ثلاثة آلاف', 'أربعة آلاف', 'خمسة آلاف', 'ستة آلاف', 'سبعة آلاف', 'ثمانية آلاف', 'تسعة آلاف'];
    
    // Fallback simple translation for demo MVP
    if(amount == 100) return "مائة";
    if(amount == 200) return "مئتان";
    if(amount == 500) return "خمسمائة";
    if(amount == 1000) return "ألف";
    
    return amount + ""; // fallback
}

// Global function called by the modal buttons
window.generateVoucher = async function(typeStr) {
    const employee = document.getElementById('voucher-employee').value;
    const amount = document.getElementById('voucher-amount').value;
    const reason = document.getElementById('voucher-reason').value;

    if (!employee || !amount || !reason) {
        alert("يرجى تعبئة جميع الحقول قبل إصدار السند.");
        return;
    }

    // Fill the hidden voucher template
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    document.getElementById('v-date').innerText = todayStr;
    document.getElementById('v-bottom-date').innerText = todayStr;
    document.getElementById('v-number').innerText = Math.floor(Math.random() * 90000) + 10000;
    
    document.getElementById('v-name').innerText = employee;
    document.getElementById('v-amt').innerText = Number(amount).toFixed(2);
    document.getElementById('v-amt-text').innerText = numToWords(Number(amount)) + " (" + typeStr + ")";
    document.getElementById('v-reason-text').innerText = reason;
    
    document.getElementById('v-balance-text').innerText = typeStr.includes('له') ? 'له ' + amount : 'عليه ' + amount;
    
    // Temporarily show the voucher container so html2canvas can capture it
    const printContainer = document.getElementById('voucher-print-container');
    printContainer.style.top = '0';
    printContainer.style.left = '0';
    printContainer.style.opacity = '1';
    printContainer.style.zIndex = '-100'; // Keep it hidden behind main content

    try {
        const voucherEl = document.getElementById('voucher-template');
        
        // Use html2canvas
        const canvas = await html2canvas(voucherEl, {
            scale: 2, // High resolution
            useCORS: true,
            backgroundColor: "#ffffff"
        });

        // Hide it again
        printContainer.style.top = '-9999px';
        printContainer.style.left = '-9999px';

        // Trigger download optionally
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if(confirm('تم إنشاء السند. هل تريد تحميل نسخة من صورة السند إلى جهازك؟')) {
            const link = document.createElement('a');
            link.download = `سند_صرف_${employee.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
            link.href = imgData;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        
        // Hide Modal & Reset
        document.getElementById('advance-modal').classList.remove('active');
        document.getElementById('voucher-amount').value = '';
        document.getElementById('voucher-reason').value = '';
        
        // Save to HR Expenses LocalStorage
        let hrstr = localStorage.getItem('hr_expenses');
        let hr_expenses = hrstr ? JSON.parse(hrstr) : [];
        hr_expenses.push({
            employee: employee,
            amount: Number(amount),
            type: typeStr, // 'سلفة (عليه)' or 'مكافأة (له)'
            reason: reason,
            date: new Date().toLocaleDateString('ar-SA'),
            timestamp: Date.now()
        });
        localStorage.setItem('hr_expenses', JSON.stringify(hr_expenses));

        // Let's send a WhatsApp message if the bot is supposedly connected
        const isWaConnected = localStorage.getItem('wa_connected') === 'true';
        if(isWaConnected) {
            let targetAdmin = '+966539774699';
            let sendLoanAlert = true;
            
            const waStr = localStorage.getItem('wa_settings');
            if(waStr) {
                const waSet = JSON.parse(waStr);
                if(waSet.admin) targetAdmin = waSet.admin;
                if(waSet.loans !== undefined) sendLoanAlert = waSet.loans;
            }
            
            if(sendLoanAlert) {
                try {
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('wa-send-message', {
                        number: targetAdmin,
                        text: `🔔 *إشعار سند جديد*\n👤 المحول له/الموظف: ${employee}\nنوع السند: ${typeStr}\n💰 المبلغ: ${amount} ر.س\n📝 السبب: ${reason}\n📅 التاريخ: ${todayStr}`,
                        image: imgData
                    });
                } catch(e) { console.error('WA IPC Error', e); }
            }
        }

        alert("تم إصدار السند وحفظه في النظام المالي!");
        
    } catch (err) {
        console.error("Error generating voucher", err);
        alert("حدث خطأ أثناء توليد صورة السند.");
        // Hide it again
        printContainer.style.top = '-9999px';
        printContainer.style.left = '-9999px';
    }
};
