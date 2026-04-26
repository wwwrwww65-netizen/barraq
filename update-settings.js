const fs = require('fs');
const path = require('path');

const targetFile = path.join('e:', 'baraaq', 'settings.html');
let content = fs.readFileSync(targetFile, 'utf8');

// The new block to replace the WhatsApp connection instructions
const newWaBlock = `                                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">
                                    اختر طريقة إرسال رسائل واتساب — الإيصالات وإشعارات الموظفين والتقارير.
                                </p>

                                <!-- اختيار الوضع -->
                                <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:18px;">
                                    <label id="wa-mode-browser-card" style="cursor:pointer; display:flex; align-items:flex-start; gap:12px; padding:14px; border-radius:12px; border:2px solid rgba(37,211,102,0.5); background:rgba(37,211,102,0.07); transition:all 0.2s;">
                                        <input type="radio" name="wa_mode_select" id="wa-mode-browser" value="browser" style="margin-top:3px; accent-color:#25D366; width:18px; height:18px; flex-shrink:0;">
                                        <div>
                                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
                                                <i class="ph-fill ph-browser" style="color:#25D366; font-size:18px;"></i>
                                                <strong style="color:#25D366; font-size:14px;">وضع المتصفح (موصى به)</strong>
                                                <span style="background:#25D366; color:#000; font-size:10px; padding:2px 7px; border-radius:20px; font-weight:700; white-space:nowrap;">بدون RAM إضافي</span>
                                            </div>
                                            <p style="color:var(--text-secondary); font-size:12px; margin:0; line-height:1.7;">
                                                يفتح رابط الرسالة في <strong style="color:white;">كروم المرتبط بواتساب</strong>.
                                                لا يحتاج QR جديداً في البرنامج.
                                                <br><span style="color:#f59e0b;">⚠ يتطلب النقر "إرسال" في المتصفح يدوياً.</span>
                                            </p>
                                        </div>
                                    </label>

                                    <label id="wa-mode-bot-card" style="cursor:pointer; display:flex; align-items:flex-start; gap:12px; padding:14px; border-radius:12px; border:2px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.03); transition:all 0.2s;">
                                        <input type="radio" name="wa_mode_select" id="wa-mode-bot" value="bot" style="margin-top:3px; accent-color:#25D366; width:18px; height:18px; flex-shrink:0;">
                                        <div>
                                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
                                                <i class="ph-fill ph-robot" style="color:#94a3b8; font-size:18px;"></i>
                                                <strong style="color:#94a3b8; font-size:14px;">وضع البوت التلقائي</strong>
                                                <span style="background:rgba(148,163,184,0.15); color:#94a3b8; font-size:10px; padding:2px 7px; border-radius:20px; white-space:nowrap;">يحتاج QR مرة واحدة</span>
                                            </div>
                                            <p style="color:var(--text-secondary); font-size:12px; margin:0; line-height:1.7;">
                                                يرسل <strong style="color:white;">تلقائياً بدون تدخل</strong> عبر Puppeteer.
                                                يستهلك 300-500 MB رام.
                                            </p>
                                        </div>
                                    </label>
                                </div>

                                <!-- QR Panel — وضع البوت فقط -->
                                <div id="wa-bot-panel" style="display:none; background: var(--bg-card); padding:20px; border-radius:12px; border:1px solid var(--border-color); text-align:center;">`;

// Original block to replace
const originalWaBlockRegex = /<p style="color: var\(--text-muted\); font-size: 0\.9rem; margin-bottom: 20px;">\s*امسح كود QR باستخدام واتساب \(الأجهزة المرتبطة\) لتفعيل البوت التلقائي، والذي يرسل إشعارات سلف الموظفين للإدارة وفواتير العملاء\.\s*<\/p>\s*<div style="flex:1; background: var\(--bg-card\); padding:20px; border-radius:12px; border:1px solid var\(--border-color\); text-align:center;">/m;

content = content.replace(originalWaBlockRegex, newWaBlock);


// Now we need to append the browser panel right after the bot panel
const botPanelEndRegex = /<i class="ph ph-plugs-connected"><\/i> إلغاء الربط\s*<\/button>\s*<\/div>\s*<\/div>/m;

const browserPanelHtml = `                                        <button type="button" id="btn-wa-disconnect" style="flex:1; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.4); color:#ef4444; border-radius:8px; padding:8px; font-family:Cairo,sans-serif; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;" title="إلغاء الربط ومسح الجلسة">
                                            <i class="ph ph-plugs-connected"></i> إلغاء الربط
                                        </button>
                                    </div>
                                </div>

                                <!-- Browser Mode Panel -->
                                <div id="wa-browser-panel" style="display:none; background:rgba(37,211,102,0.06); padding:16px; border-radius:12px; border:1px solid rgba(37,211,102,0.25); text-align:center;">
                                    <i class="ph-fill ph-check-circle" style="font-size:36px; color:#25D366; margin-bottom:8px; display:block;"></i>
                                    <p style="color:#25D366; font-weight:700; margin:0 0 6px; font-size:14px;">وضع المتصفح مفعّل ✓</p>
                                    <p style="color:var(--text-muted); font-size:12px; margin:0 0 12px; line-height:1.6;">
                                        عند إرسال أي رسالة يفتح النظام رابط واتساب في كروم تلقائياً.<br>
                                        اضغط "إرسال" في المتصفح لإتمام العملية.
                                    </p>
                                    <button type="button" id="btn-wa-test-browser" style="background:#25D366; border:none; color:white; border-radius:8px; padding:9px 18px; font-family:Cairo,sans-serif; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                                        <i class="ph ph-arrow-square-out"></i> تجربة — فتح واتساب في المتصفح
                                    </button>
                                </div>`;

content = content.replace(/<button type="button" id="btn-wa-disconnect"[\s\S]*?<i class="ph ph-plugs-connected"><\/i> إلغاء الربط\s*<\/button>\s*<\/div>\s*<\/div>/m, browserPanelHtml);

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Successfully updated settings.html');
