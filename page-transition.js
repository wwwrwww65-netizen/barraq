/**
 * page-transition.js — v4
 * شاشة تحميل ذكية تظهر فوراً عند كل انتقال بين الصفحات
 * وتختفي تلقائياً عند اكتمال التحميل — تمنع الشاشة السوداء كلياً
 */
(function () {
    'use strict';

    // قراءة الثيم مباشرة من localStorage لضمان الدقة قبل أن يتم تعيينه بواسطة سكريبتات أخرى
    var savedTheme = 'dark';
    try { savedTheme = localStorage.getItem('sys_theme') || 'dark'; } catch(e) {}
    var isDark = savedTheme !== 'light';
    var bg = isDark ? '#0b0f19' : '#f1f5f9';

    // إنشاء غطاء التحميل بأسلوب inline (لا يعتمد على CSS خارجي)
    var overlay = document.createElement('div');
    overlay.id = 'mc-page-loader';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:' + bg,
        'display:flex', 'align-items:center', 'justify-content:center',
        'flex-direction:column', 'gap:16px',
        'transition:opacity 0.25s ease',
        'opacity:1', 'pointer-events:none'
    ].join(';');

    // مؤشر دوران بسيط
    overlay.innerHTML =
        '<div style="width:40px;height:40px;border:3px solid rgba(16,185,129,0.2);' +
        'border-top-color:#10b981;border-radius:50%;animation:mc-spin 0.7s linear infinite"></div>';

    // إضافة الـ CSS للأنيميشن مرة واحدة فقط
    if (!document.getElementById('mc-loader-style')) {
        var st = document.createElement('style');
        st.id = 'mc-loader-style';
        st.textContent = '@keyframes mc-spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
    }

    // إضافة الغطاء مباشرة
    function attachOverlay() {
        if (!document.getElementById('mc-page-loader') && document.body) {
            document.body.appendChild(overlay);
        }
    }

    if (document.body) {
        attachOverlay();
    } else {
        document.addEventListener('DOMContentLoaded', attachOverlay, { once: true });
    }

    // إخفاء الغطاء عند اكتمال الصفحة
    function hideLoader() {
        var el = document.getElementById('mc-page-loader');
        if (!el) return;
        el.style.opacity = '0';
        setTimeout(function () {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }, 270);
    }

    // الإخفاء عند DOMContentLoaded أو بعد 1.5 ثانية كحد أقصى (احتياطي)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            requestAnimationFrame(function () { requestAnimationFrame(hideLoader); });
        }, { once: true });
    } else {
        // الصفحة جاهزة بالفعل
        requestAnimationFrame(function () { requestAnimationFrame(hideLoader); });
    }

    // Fallback: أخفِه بعد 1.5 ثانية مهما حدث
    setTimeout(hideLoader, 1500);

    // واجهة للاستدعاء اليدوي (للتوافق مع الكود القديم)
    window.mcPageTransition = {
        show: function () {},
        hide: hideLoader
    };
})();
