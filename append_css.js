const fs = require('fs');
const css = `
/* --- Support Page Refactored Styles --- */
.support-hero-card {
    text-align: center;
    padding: 40px 20px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(37, 99, 235, 0.1) 100%);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 12px;
}
body.light-theme .support-hero-card {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(59, 130, 246, 0.1) 100%);
    border: 1px solid rgba(59, 130, 246, 0.3);
}
.support-logo-wrapper {
    margin-bottom: 25px;
}
.support-logo {
    width: 120px;
    height: auto;
    filter: drop-shadow(0 10px 20px rgba(0,0,0,0.2));
    transition: transform 0.3s ease;
}
.support-logo:hover {
    transform: scale(1.05);
}
.support-title {
    color: var(--text-primary);
    font-size: 24px;
    margin-bottom: 10px;
}
.support-subtitle {
    color: var(--text-secondary);
    font-size: 16px;
    max-width: 600px;
    margin: 0 auto 30px;
    line-height: 1.8;
}
.support-contact-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    max-width: 800px;
    margin: 0 auto;
}
.support-action-btn {
    text-decoration: none;
    padding: 25px;
    border-radius: 16px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
}
.support-action-btn:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
}
.support-icon-circle {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 30px;
}
.support-btn-content h4 {
    margin: 0;
    font-size: 18px;
}
.support-desc {
    margin: 5px 0 0;
    color: var(--text-muted);
    font-size: 13px;
}
.support-number {
    margin: 2px 0 0;
    color: var(--text-muted);
    font-size: 14px;
}
.support-hint {
    margin: 8px 0 0;
    font-size: 12px;
    font-weight: bold;
}
/* WhatsApp Button */
.wa-btn {
    background: rgba(37, 211, 102, 0.1);
    border: 1px solid rgba(37, 211, 102, 0.3);
}
.wa-btn:hover {
    background: rgba(37, 211, 102, 0.15);
    border-color: rgba(37, 211, 102, 0.5);
}
.wa-btn .support-icon-circle {
    background: #25D366;
    box-shadow: 0 10px 20px rgba(37, 211, 102, 0.3);
}
.wa-btn h4, .wa-btn .support-hint {
    color: #25D366;
}
/* Email Button */
.email-btn {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
}
.email-btn:hover {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.5);
}
.email-btn .support-icon-circle {
    background: #3B82F6;
    box-shadow: 0 10px 20px rgba(59, 130, 246, 0.3);
}
.email-btn h4, .email-btn .support-hint {
    color: #3B82F6;
}
body.light-theme .wa-btn h4, body.light-theme .wa-btn .support-hint { color: #15803d; }
body.light-theme .email-btn h4, body.light-theme .email-btn .support-hint { color: #1d4ed8; }
/* Support Footer */
.support-footer {
    margin-top: 50px;
    padding-top: 30px;
    border-top: 1px solid rgba(255,255,255,0.05);
}
body.light-theme .support-footer {
    border-top: 1px solid rgba(0,0,0,0.05);
}
.support-version {
    color: var(--text-muted);
    font-size: 14px;
    margin-bottom: 5px;
}
.support-copyright {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: bold;
}
.highlight-text {
    color: var(--accent-blue);
}
.support-badges {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-top: 15px;
    color: var(--text-muted);
}
.support-badges i {
    font-size: 24px;
    transition: color 0.3s ease, transform 0.3s ease;
}
.support-badges i:hover {
    color: var(--accent-blue);
    transform: scale(1.1);
}
`;
fs.appendFileSync('settings.css', css);
console.log('Successfully appended CSS to settings.css');
