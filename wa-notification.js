/**
 * WhatsApp Notification System
 * Shows beautiful toast notifications for WhatsApp send success/failure
 * with retry and download functionality
 */

(function() {
    'use strict';

    // Store pending failed sends for retry functionality
    const pendingFailedSends = new Map();

    // Create styles
    const style = document.createElement('style');
    style.innerHTML = `
        .wa-toast-container {
            position: fixed;
            bottom: 30px;
            left: 30px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 15px;
            pointer-events: none;
        }

        .wa-toast {
            pointer-events: all;
            min-width: 380px;
            max-width: 450px;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
            padding: 20px;
            animation: waSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            direction: rtl;
            position: relative;
            overflow: hidden;
        }

        .wa-toast::before {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 5px;
            height: 100%;
        }

        .wa-toast.wa-success::before {
            background: linear-gradient(180deg, #10b981, #059669);
        }

        .wa-toast.wa-failure::before {
            background: linear-gradient(180deg, #ef4444, #dc2626);
        }

        .wa-toast.wa-exit {
            animation: waSlideOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .wa-toast-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 12px;
        }

        .wa-toast-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            flex-shrink: 0;
        }

        .wa-success .wa-toast-icon {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
        }

        .wa-failure .wa-toast-icon {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            box-shadow: 0 8px 20px rgba(239, 68, 68, 0.4);
        }

        .wa-toast-title {
            font-size: 16px;
            font-weight: 700;
            color: #f8fafc;
            margin: 0 0 4px 0;
        }

        .wa-toast-message {
            font-size: 13px;
            color: #94a3b8;
            margin: 0;
            line-height: 1.5;
        }

        .wa-toast-number {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(255, 255, 255, 0.08);
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 12px;
            color: #cbd5e1;
            margin-top: 8px;
            font-family: 'Courier New', monospace;
            direction: ltr;
        }

        .wa-toast-actions {
            display: flex;
            gap: 10px;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .wa-toast-btn {
            flex: 1;
            padding: 10px 16px;
            border: none;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-family: inherit;
        }

        .wa-toast-btn:hover {
            transform: translateY(-2px);
        }

        .wa-toast-btn:active {
            transform: translateY(0);
        }

        .wa-btn-retry {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .wa-btn-retry:hover {
            box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
        }

        .wa-btn-download {
            background: rgba(255, 255, 255, 0.1);
            color: #e2e8f0;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .wa-btn-download:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.3);
        }

        .wa-btn-close {
            background: transparent;
            color: #64748b;
            padding: 10px;
            flex: 0;
            min-width: 40px;
        }

        .wa-btn-close:hover {
            color: #94a3b8;
            background: rgba(255, 255, 255, 0.05);
        }

        .wa-progress-bar {
            position: absolute;
            bottom: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #10b981, #059669);
            animation: waProgress 7s linear forwards;
        }

        .wa-failure .wa-progress-bar {
            background: linear-gradient(90deg, #ef4444, #dc2626);
        }

        @keyframes waSlideIn {
            0% {
                transform: translateX(-100%);
                opacity: 0;
            }
            100% {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes waSlideOut {
            0% {
                transform: translateX(0);
                opacity: 1;
            }
            100% {
                transform: translateX(-100%);
                opacity: 0;
            }
        }

        @keyframes waProgress {
            0% {
                width: 100%;
            }
            100% {
                width: 0%;
            }
        }

        @keyframes waPulse {
            0%, 100% {
                transform: scale(1);
            }
            50% {
                transform: scale(1.05);
            }
        }

        .wa-toast-icon.pulse {
            animation: waPulse 2s ease-in-out infinite;
        }

        /* Light Theme Overrides */
        body.light-theme .wa-toast {
            background: #ffffff;
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
        }

        body.light-theme .wa-toast-title {
            color: #0f172a;
        }

        body.light-theme .wa-toast-message {
            color: #475569;
        }

        body.light-theme .wa-toast-number {
            background: #f1f5f9;
            color: #334155;
            border: 1px solid #e2e8f0;
        }

        body.light-theme .wa-toast-actions {
            border-top-color: #f1f5f9;
        }

        body.light-theme .wa-btn-download {
            background: #f8fafc;
            color: #475569;
            border: 1px solid #e2e8f0;
        }

        body.light-theme .wa-btn-download:hover {
            background: #f1f5f9;
            color: #0f172a;
            border-color: #cbd5e1;
        }

        body.light-theme .wa-btn-close {
            color: #64748b;
        }

        body.light-theme .wa-btn-close:hover {
            color: #ef4444;
            background: #fee2e2;
        }
    `;


    document.head.appendChild(style);

    // Create container
    const container = document.createElement('div');
    container.className = 'wa-toast-container';
    document.body.appendChild(container);

    // Helper to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Format phone number for display
    function formatPhone(phone) {
        if (!phone) return '';
        const cleaned = String(phone).replace(/[^0-9+]/g, '');
        if (cleaned.length >= 10) {
            return cleaned;
        }
        return cleaned;
    }

    // Download image from base64
    function downloadImage(base64Data, filename) {
        if (!base64Data) return;
        
        const link = document.createElement('a');
        link.download = filename || 'whatsapp-document.jpg';
        link.href = base64Data;
        link.click();
    }

    // Show WhatsApp toast notification
    function showWaToast(type, title, message, options = {}) {
        const {
            number = '',
            image = null,
            onRetry = null,
            autoClose = true,
            duration = 7000
        } = options;

        const toast = document.createElement('div');
        toast.className = `wa-toast wa-${type}`;

        const icon = type === 'success' 
            ? '<i class="ph-fill ph-check-circle"></i>'
            : '<i class="ph-fill ph-x-circle"></i>';

        const iconClass = type === 'success' ? 'pulse' : '';

        let html = `
            <div class="wa-toast-header">
                <div class="wa-toast-icon ${iconClass}">
                    ${icon}
                </div>
                <div style="flex: 1;">
                    <h4 class="wa-toast-title">${escapeHtml(title)}</h4>
                    <p class="wa-toast-message">${escapeHtml(message)}</p>
                    ${number ? `<div class="wa-toast-number"><i class="ph ph-phone"></i> ${formatPhone(number)}</div>` : ''}
                </div>
                <button class="wa-toast-btn wa-btn-close" title="إغلاق">
                    <i class="ph ph-x"></i>
                </button>
            </div>
        `;

        // Add actions for failure
        if (type === 'failure' && (onRetry || image)) {
            html += '<div class="wa-toast-actions">';
            
            if (onRetry) {
                html += '<button class="wa-toast-btn wa-btn-retry"><i class="ph ph-arrow-counter-clockwise"></i> إعادة المحاولة</button>';
            }
            
            if (image) {
                html += '<button class="wa-toast-btn wa-btn-download"><i class="ph ph-download-simple"></i> تحميل المستند</button>';
            }
            
            html += '</div>';
        }

        html += '<div class="wa-progress-bar"></div>';

        toast.innerHTML = html;
        container.appendChild(toast);

        // Event listeners
        const closeBtn = toast.querySelector('.wa-btn-close');
        closeBtn.addEventListener('click', () => {
            closeToast(toast);
        });

        if (type === 'failure') {
            const retryBtn = toast.querySelector('.wa-btn-retry');
            if (retryBtn && onRetry) {
                retryBtn.addEventListener('click', () => {
                    closeToast(toast);
                    onRetry();
                });
            }

            const downloadBtn = toast.querySelector('.wa-btn-download');
            if (downloadBtn && image) {
                downloadBtn.addEventListener('click', () => {
                    const timestamp = Date.now();
                    downloadImage(image, `مستند-واتساب-${timestamp}.jpg`);
                });
            }
        }

        // Auto close
        if (autoClose) {
            setTimeout(() => {
                closeToast(toast);
            }, duration);
        }

        return toast;
    }

    // Close toast with animation
    function closeToast(toast) {
        if (!toast || toast.classList.contains('wa-exit')) return;
        toast.classList.add('wa-exit');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 400);
    }

    // Listen for WhatsApp send results from main process
    if (typeof require !== 'undefined') {
        try {
            const { ipcRenderer } = require('electron');
            
            ipcRenderer.on('wa-send-result', (event, result) => {
                console.log('[WA Notification] Received send result:', result);

                if (result.success) {
                    showWaToast('success', 
                        '✅ تم الإرسال عبر واتساب', 
                        'تم إرسال المستند بنجاح عبر واتساب',
                        {
                            number: result.number,
                            autoClose: true,
                            duration: 5000
                        }
                    );
                } else {
                    // Store failed send info for retry
                    const failId = Date.now();
                    pendingFailedSends.set(failId, result);

                    showWaToast('failure',
                        '❌ فشل الإرسال عبر واتساب',
                        'لم يتم إرسال المستند عبر واتساب. يمكنك إعادة المحاولة أو تحميل المستند.',
                        {
                            number: result.number,
                            image: result.image,
                            onRetry: () => {
                                // Retry sending
                                const failedData = pendingFailedSends.get(failId);
                                if (failedData) {
                                    console.log('[WA Notification] Retrying send...');
                                    ipcRenderer.send('wa-send-message', failedData);
                                    pendingFailedSends.delete(failId);
                                }
                            },
                            autoClose: false
                        }
                    );
                }
            });
        } catch (e) {
            console.warn('[WA Notification] Could not setup IPC listener:', e);
        }
    }

    // Export API
    window.waNotification = {
        showSuccess: (title, message, options = {}) => {
            showWaToast('success', title, message, options);
        },
        showFailure: (title, message, options = {}) => {
            showWaToast('failure', title, message, options);
        }
    };

    console.log('[WA Notification] System initialized');
})();
