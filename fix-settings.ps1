$content = Get-Content "e:\baraaq\settings.html" -Raw -Encoding UTF8

$splitBefore = 'placeholder="9200xxxx">' + "`r`n" + '                                </div>' + "`r`n" + '                            </div>'
$splitAfter = '                        <!-- Col 3: Cloud'

$idx1 = $content.IndexOf($splitBefore)
$idx2 = $content.IndexOf($splitAfter)

$before = $content.Substring(0, $idx1 + $splitBefore.Length)
$after  = $content.Substring($idx2)

$middle = @'

                            <div class="form-group">
                                <label>رقم الواتساب الخاص بالطلبات (WhatsApp)</label>
                                <div class="input-icon-wrapper">
                                    <i class="ph-fill ph-whatsapp-logo" style="color:var(--accent-green)"></i>
                                    <input type="text" id="set-whatsapp" class="input-modern" placeholder="05xxxxxxxx">
                                </div>
                            </div>

                            <div class="form-group">
                                <label>رسالة ترحيبية أسفل الفاتورة (Footer Message)</label>
                                <div class="input-icon-wrapper">
                                    <i class="ph-fill ph-text-align-center"></i>
                                    <input type="text" id="set-footer" class="input-modern" placeholder="شكرًا لزيارتكم.. نتشرف بخدمتكم دائماً">
                                </div>
                            </div>

                            <div class="form-group">
                                <label>طابعة الكاشير الرئيسية (لفواتير العميل وفتح الدرج)</label>
                                <div class="input-icon-wrapper">
                                    <i class="ph-fill ph-printer"></i>
                                    <select id="set-cashier-printer" class="input-modern" style="padding-right: 40px; width: 100%; border: none; background: transparent; outline: none; color: var(--text-primary); font-family: 'Cairo', sans-serif;">
                                        <option value="" style="color: #000;">الطابعة الافتراضية للويندوز (Default)</option>
                                    </select>
                                </div>
                            </div>

                            <div class="form-group">
                                <label>عملة العرض في النظام</label>
                                <select id="set-currency-preset" class="input-modern" style="width:100%;">
                                    <option value="SAR">ريال سعودي (ر.س)</option>
                                    <option value="USD">دولار أمريكي ($)</option>
                                    <option value="EUR">يورو (€)</option>
                                    <option value="YER">ريال يمني (ر.ي)</option>
                                    <option value="CUSTOM">مخصص — رمز واسم بالكتابة</option>
                                </select>
                                <small style="color:var(--text-muted); font-size:12px; margin-top:6px; display:block;">الكاشير، التقارير، المخزون، الموظفين، المحاسبة، والإيصالات.</small>
                            </div>
                            <div id="set-currency-custom-wrap" class="form-group" style="display:none;">
                                <label>رمز العملة الظاهر بجانب الأرقام</label>
                                <input type="text" id="set-currency-symbol" class="input-modern" dir="ltr" placeholder="مثال: د.ك" maxlength="16">
                                <label style="margin-top:10px; display:block;">الاسم الكامل في السندات (نص قانوني)</label>
                                <input type="text" id="set-currency-label" class="input-modern" placeholder="مثال: دينار كويتي">
                            </div>
                        </div>

                        <!-- WhatsApp Integration -->
                        <div class="settings-card" style="grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                            <div>
                                <div class="sc-header">
                                    <i class="ph-fill ph-whatsapp-logo" style="color: #25D366;"></i>
                                    <h3>ربط واتساب (طابعة رقمية)</h3>
                                </div>
                                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">اختر طريقة إرسال رسائل واتساب — الإيصالات وإشعارات الموظفين والتقارير.</p>

                                <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:18px;">
                                    <label id="wa-mode-browser-card" style="cursor:pointer; display:flex; align-items:flex-start; gap:12px; padding:14px; border-radius:12px; border:2px solid rgba(37,211,102,0.5); background:rgba(37,211,102,0.07); transition:all 0.2s;">
                                        <input type="radio" name="wa_mode_select" id="wa-mode-browser" value="browser" style="margin-top:3px; accent-color:#25D366; width:18px; height:18px; flex-shrink:0;">
                                        <div>
                                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
                                                <i class="ph-fill ph-browser" style="color:#25D366; font-size:18px;"></i>
                                                <strong style="color:#25D366; font-size:14px;">وضع المتصفح (موصى به)</strong>
                                                <span style="background:#25D366; color:#000; font-size:10px; padding:2px 7px; border-radius:20px; font-weight:700;">بدون RAM إضافي</span>
                                            </div>
                                            <p style="color:var(--text-secondary); font-size:12px; margin:0; line-height:1.7;">يفتح رابط الرسالة في <strong style="color:white;">كروم المرتبط بواتساب</strong>. لا يحتاج QR جديداً.<br><span style="color:#f59e0b;">⚠ يتطلب النقر "إرسال" في المتصفح يدوياً.</span></p>
                                        </div>
                                    </label>
                                    <label id="wa-mode-bot-card" style="cursor:pointer; display:flex; align-items:flex-start; gap:12px; padding:14px; border-radius:12px; border:2px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.03); transition:all 0.2s;">
                                        <input type="radio" name="wa_mode_select" id="wa-mode-bot" value="bot" style="margin-top:3px; accent-color:#25D366; width:18px; height:18px; flex-shrink:0;">
                                        <div>
                                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
                                                <i class="ph-fill ph-robot" style="color:#94a3b8; font-size:18px;"></i>
                                                <strong style="color:#94a3b8; font-size:14px;">وضع البوت التلقائي</strong>
                                                <span style="background:rgba(148,163,184,0.15); color:#94a3b8; font-size:10px; padding:2px 7px; border-radius:20px;">يحتاج QR مرة واحدة</span>
                                            </div>
                                            <p style="color:var(--text-secondary); font-size:12px; margin:0; line-height:1.7;">يرسل <strong style="color:white;">تلقائياً بدون تدخل</strong> عبر Puppeteer. يستهلك 300-500 MB رام.</p>
                                        </div>
                                    </label>
                                </div>

                                <div id="wa-bot-panel" style="display:none; background: var(--bg-card); padding:20px; border-radius:12px; border:1px solid var(--border-color); text-align:center;">
                                    <div id="wa-qr-container" style="background:transparent; min-width:200px; min-height:200px; margin:0 auto 12px auto; border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px;">
                                        <i class="ph ph-qr-code" style="font-size:48px; color:#ccc;"></i>
                                    </div>
                                    <h4 id="wa-status-text" style="color:var(--text-muted); margin-bottom:12px; font-size:13px;">غير متصل</h4>
                                    <button type="button" class="btn btn-primary" id="btn-wa-link" style="background: #25D366; border: none; width: 100%; display: flex; justify-content: center; align-items: center; gap: 10px;">
                                        <i class="ph-bold ph-link"></i> تشغيل البوت وتوليد QR
                                    </button>
                                    <div style="display:flex; gap:8px; margin-top:10px;">
                                        <button type="button" id="btn-wa-refresh" style="flex:1; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.4); color:#f59e0b; border-radius:8px; padding:8px; font-family:Cairo,sans-serif; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                                            <i class="ph ph-arrows-clockwise"></i> تحديث
                                        </button>
                                        <button type="button" id="btn-wa-disconnect" style="flex:1; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.4); color:#ef4444; border-radius:8px; padding:8px; font-family:Cairo,sans-serif; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                                            <i class="ph ph-plugs-connected"></i> إلغاء الربط
                                        </button>
                                    </div>
                                </div>

                                <div id="wa-browser-panel" style="display:none; background:rgba(37,211,102,0.06); padding:16px; border-radius:12px; border:1px solid rgba(37,211,102,0.25); text-align:center;">
                                    <i class="ph-fill ph-check-circle" style="font-size:36px; color:#25D366; margin-bottom:8px; display:block;"></i>
                                    <p style="color:#25D366; font-weight:700; margin:0 0 6px; font-size:14px;">وضع المتصفح مفعّل ✓</p>
                                    <p style="color:var(--text-muted); font-size:12px; margin:0 0 12px; line-height:1.6;">عند إرسال أي رسالة يفتح النظام رابط واتساب في كروم.<br>اضغط "إرسال" في المتصفح لإتمام العملية.</p>
                                    <button type="button" id="btn-wa-test-browser" style="background:#25D366; border:none; color:white; border-radius:8px; padding:9px 18px; font-family:Cairo,sans-serif; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                                        <i class="ph ph-arrow-square-out"></i> تجربة — فتح واتساب في المتصفح
                                    </button>
                                </div>
                            </div>

                            <div style="padding-top:20px;">
                                <div class="form-group">
                                    <label>رقم هاتف المحاسب/الإدارة لاستلام الإشعارات والسندات (مطلوب)</label>
                                    <div class="input-icon-wrapper">
                                        <i class="ph-fill ph-phone" style="color:var(--accent-blue)"></i>
                                        <input type="text" id="set-wa-admin" class="input-modern" placeholder="+966xxxxxxxxx" value="+966539774699" dir="ltr" style="font-size:16px;">
                                    </div>
                                </div>
                                <div class="form-group mt-3" style="background:rgba(16,185,129,0.06); padding:15px; border-radius:8px; border:1px solid rgba(16,185,129,0.2);">
                                    <label>عنوان IP لجهاز واتساب المركزي (اختياري)</label>
                                    <p style="font-size:12px; color:var(--text-muted); margin:6px 0 10px;">اتركه فارغاً على الجهاز الرئيسي. يُكتشف تلقائياً من مزامنة الشبكة.</p>
                                    <div class="input-icon-wrapper">
                                        <i class="ph-fill ph-wifi-high" style="color:#10b981"></i>
                                        <input type="text" id="set-wa-hub-ip" class="input-modern" placeholder="مثال: 192.168.1.10" dir="ltr" style="font-size:15px;">
                                    </div>
                                </div>
                                <div class="form-group mt-3" style="background:rgba(255,255,255,0.02); padding:15px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); margin-bottom:15px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <div>
                                            <h4 style="margin:0; font-size:15px; color:white;">إرسال سندات السلف والرواتب للموظفين عبر واتساب</h4>
                                            <span style="font-size:13px; color:var(--text-secondary);">إرسال صورة السند تلقائياً إلى واتساب الموظف المستفيد.</span>
                                        </div>
                                        <label class="switch">
                                            <input type="checkbox" id="set-wa-loans" checked>
                                            <span class="slider round"></span>
                                        </label>
                                    </div>
                                </div>
                                <div class="form-group mt-3" style="background:rgba(255,255,255,0.02); padding:15px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); margin-bottom:15px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <div>
                                            <h4 style="margin:0; font-size:15px; color:white;">إرسال سندات المصروفات للإدارة عبر واتساب</h4>
                                            <span style="font-size:13px; color:var(--text-secondary);">إرسال صورة سند عمليات المصروفات وسحبيات المطعم لرقم الإدارة أعلاه.</span>
                                        </div>
                                        <label class="switch">
                                            <input type="checkbox" id="set-wa-expenses" checked>
                                            <span class="slider round"></span>
                                        </label>
                                    </div>
                                </div>
                                <div class="form-group" style="background:rgba(255,255,255,0.02); padding:15px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <div>
                                            <h4 style="margin:0; font-size:15px; color:white;">إرسال تقرير المبيعات اليومية</h4>
                                            <span style="font-size:13px; color:var(--text-secondary);">إرسال ملخص الوردية (الشيفت) عند إغلاقه.</span>
                                        </div>
                                        <label class="switch">
                                            <input type="checkbox" id="set-wa-reports" checked>
                                            <span class="slider round"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

'@

$result = $before + "`r`n" + $middle + "`r`n" + $after
[System.IO.File]::WriteAllText("e:\baraaq\settings.html", $result, [System.Text.Encoding]::UTF8)
Write-Host "DONE - File rebuilt successfully"
