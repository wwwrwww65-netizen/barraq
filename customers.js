document.addEventListener('DOMContentLoaded', () => {

    // --- Modal Logic ---
    const btnOpenModal = document.getElementById('btn-open-cust-modal');
    const btnOpenModalCard = document.getElementById('btn-open-cust-modal-card');
    const btnCloseModal = document.getElementById('btn-close-cust-modal');
    const modal = document.getElementById('add-customer-modal');

    function openModal() {
        modal.classList.add('active');
    }

    function closeModal() {
        modal.classList.remove('active');
    }

    if(btnOpenModal) btnOpenModal.addEventListener('click', openModal);
    if(btnOpenModalCard) btnOpenModalCard.addEventListener('click', openModal);
    if(btnCloseModal) btnCloseModal.addEventListener('click', closeModal);

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // --- Form Submission Simulation ---
    const form = document.querySelector('.btn-save-cust');
    if(form) {
        form.addEventListener('click', (e) => {
            e.preventDefault();
            // Validate basic
            const name = document.getElementById('c-name').value;
            const phone = document.getElementById('c-phone').value;

            if(!name || !phone) {
                alert('الرجاء إدخال الإسم ورقم الجوال إجبارياً');
                return;
            }

            const btn = e.target.closest('.btn-save-cust');
            const originalHTML = btn.innerHTML;
            
            btn.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري حفظ السجل...';
            btn.style.pointerEvents = 'none';

            setTimeout(() => {
                alert('تم إضافة العميل بنجاح إلى قاعدة البيانات وإرسال رسالة ترحيبية عبر الواتساب!');
                
                // Reset form
                document.getElementById('c-name').value = '';
                document.getElementById('c-phone').value = '';
                document.getElementById('c-email').value = '';
                document.getElementById('c-notes').value = '';
                
                btn.innerHTML = originalHTML;
                btn.style.pointerEvents = 'auto';
                closeModal();
                
            }, 1200);
        });
    }

    // --- Search & Filtering ---
    const searchInput = document.getElementById('search-customer');
    const customerCards = document.querySelectorAll('.customer-card:not(.new-cust-card)');
    const filterBtns = document.querySelectorAll('.cust-filter-btn');

    // Filter by type (All, VIP, Regular)
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            const clickedBtn = e.target.closest('.cust-filter-btn');
            clickedBtn.classList.add('active');

            const filterType = clickedBtn.dataset.filter;
            applyFilters(filterType, searchInput.value.toLowerCase());
        });
    });

    // Search input
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const activeFilter = document.querySelector('.cust-filter-btn.active').dataset.filter;
            applyFilters(activeFilter, e.target.value.toLowerCase());
        });
    }

    function applyFilters(type, query) {
        customerCards.forEach(card => {
            const cardType = card.dataset.type;
            const cardText = card.innerText.toLowerCase();

            const matchesType = (type === 'all' || cardType === type);
            const matchesQuery = cardText.includes(query);

            if (matchesType && matchesQuery) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    }

});
