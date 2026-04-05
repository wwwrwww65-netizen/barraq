(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        const JC = window.JournalCore;
        if (!JC) {
            console.error('JournalCore not loaded');
            return;
        }

        const tbody = document.getElementById('journal-tbody');
        const statCount = document.getElementById('stat-je-count');
        const statBal = document.getElementById('stat-je-balanced');
        const coaBody = document.getElementById('coa-tbody');
        const modal = document.getElementById('manual-je-modal');
        const manualLines = document.getElementById('manual-lines');
        const btnRebuild = document.getElementById('btn-rebuild-journal');
        const btnOpenManual = document.getElementById('btn-open-manual-je');
        const btnSaveManual = document.getElementById('btn-save-manual-je');
        const btnAddLine = document.getElementById('btn-add-je-line');

        let dbCache = null;
        let expandedRow = null;

        async function loadDb() {
            dbCache = await window.dbRead();
            return dbCache;
        }

        function fmt(n) {
            return JC.round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function renderCoa(chart) {
            if (!coaBody) return;
            coaBody.innerHTML = '';
            (chart || []).forEach((row) => {
                const tr = document.createElement('tr');
                tr.innerHTML =
                    '<td><strong>' +
                    row.code +
                    '</strong></td><td>' +
                    row.name +
                    '</td><td>' +
                    row.type +
                    '</td>';
                coaBody.appendChild(tr);
            });
        }

        function renderTable(entries) {
            if (!tbody) return;
            tbody.innerHTML = '';
            if (!entries || entries.length === 0) {
                tbody.innerHTML =
                    '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">لا توجد قيود. اضغط «إعادة بناء القيود».</td></tr>';
                return;
            }
            entries.forEach((e, rowIdx) => {
                const tr = document.createElement('tr');
                const t = JC.lineTotals(e.lines);
                const ok = JC.entryIsBalanced(e);
                const memoSafe = String(e.memo || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/"/g, '&quot;');
                tr.innerHTML =
                    '<td dir="ltr">' +
                    (e.date || '') +
                    '</td><td><strong>' +
                    JC.round2(t.debit).toLocaleString() +
                    '</strong></td><td>' +
                    (e.sourceType || '') +
                    '</td><td>' +
                    memoSafe +
                    '</td><td><code style="font-size:12px;">' +
                    String(e.id || '').replace(/</g, '&lt;') +
                    '</code></td><td><button type="button" class="btn btn-outline btn-sm btn-toggle-je" data-row="' +
                    rowIdx +
                    '">تفاصيل</button> <span style="font-size:11px;color:' +
                    (ok ? 'var(--accent-green)' : 'var(--accent-red)') +
                    '">' +
                    (ok ? 'متوازن' : 'خطأ') +
                    '</span></td>';
                tbody.appendChild(tr);

                const detailTr = document.createElement('tr');
                detailTr.className = 'je-detail-row';
                detailTr.style.display = expandedRow === rowIdx ? 'table-row' : 'none';
                detailTr.dataset.rowIdx = String(rowIdx);
                let linesHtml =
                    '<td colspan="6" style="background:rgba(0,0,0,0.2);padding:12px;"><table style="width:100%;font-size:14px;"><thead><tr><th>حساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>';
                (e.lines || []).forEach((l) => {
                    linesHtml +=
                        '<tr><td>' +
                        l.accountCode +
                        ' — ' +
                        (l.accountName || '') +
                        '</td><td>' +
                        (l.debit > 0 ? fmt(l.debit) : '—') +
                        '</td><td>' +
                        (l.credit > 0 ? fmt(l.credit) : '—') +
                        '</td></tr>';
                });
                linesHtml += '</tbody></table></td>';
                detailTr.innerHTML = linesHtml;
                tbody.appendChild(detailTr);
            });

            tbody.querySelectorAll('.btn-toggle-je').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const ri = Number(btn.getAttribute('data-row'));
                    expandedRow = expandedRow === ri ? null : ri;
                    renderTable(entries);
                });
            });
        }

        async function refresh() {
            const db = await loadDb();
            JC.ensureChartOfAccounts(db);
            const entries = db.journalEntries || [];
            if (statCount) statCount.textContent = String(entries.length);
            if (statBal) {
                const allOk = entries.length === 0 || entries.every((x) => JC.entryIsBalanced(x));
                statBal.textContent = allOk ? 'نعم' : 'لا';
                statBal.style.color = allOk ? 'var(--accent-green)' : 'var(--accent-red)';
            }
            renderCoa(db.chartOfAccounts);
            renderTable(entries);
        }

        btnRebuild?.addEventListener('click', async () => {
            if (!confirm('سيتم إعادة توليد القيود التلقائية من المبيعات والمشتريات وغيرها، مع الإبقاء على القيود اليدوية فقط. متابعة؟')) return;
            const db = await loadDb();
            const r = JC.rebuildJournalEntries(db);
            await window.dbWrite(db);
            alert('تم — عدد القيود: ' + r.count + ' — الكل متوازن: ' + (r.balanced ? 'نعم' : 'لا'));
            await refresh();
        });

        function accountOptions() {
            const db = dbCache || {};
            const chart = db.chartOfAccounts || JC.DEFAULT_COA;
            return chart.map((c) => '<option value="' + c.code + '">' + c.code + ' — ' + c.name + '</option>').join('');
        }

        function addManualLineRow() {
            const wrap = document.createElement('div');
            wrap.className = 'manual-je-line';
            wrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center;';
            wrap.innerHTML =
                '<select class="input-modern je-acc" style="flex:2;min-width:160px;">' +
                accountOptions() +
                '</select>' +
                '<input type="number" step="0.01" class="input-modern je-deb" placeholder="مدين" dir="ltr" style="width:100px;">' +
                '<input type="number" step="0.01" class="input-modern je-cred" placeholder="دائن" dir="ltr" style="width:100px;">';
            manualLines.appendChild(wrap);
        }

        btnOpenManual?.addEventListener('click', async () => {
            await loadDb();
            manualLines.innerHTML = '';
            addManualLineRow();
            addManualLineRow();
            document.getElementById('manual-je-memo').value = '';
            modal.classList.add('active');
        });

        document.querySelectorAll('.close-manual-je').forEach((b) => b.addEventListener('click', () => modal.classList.remove('active')));

        btnAddLine?.addEventListener('click', () => addManualLineRow());

        function csvEscape(s) {
            return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
        }

        function buildJournalWorkbookCsv(db) {
            const rows = [];
            rows.push(['دليل الحسابات', '', ''].map(csvEscape).join(','));
            rows.push(['الرمز', 'الاسم', 'النوع'].map(csvEscape).join(','));
            (db.chartOfAccounts || []).forEach((r) => {
                rows.push([r.code, r.name, r.type].map(csvEscape).join(','));
            });
            rows.push(['', '', ''].map(csvEscape).join(','));
            rows.push(['قيود اليومية — تفصيل المدين والدائن', '', '', '', '', '', '', ''].map(csvEscape).join(','));
            rows.push(
                ['رقم القيد', 'التاريخ', 'البيان', 'المصدر', 'رمز الحساب', 'اسم الحساب', 'مدين', 'دائن'].map(csvEscape).join(','),
            );
            (db.journalEntries || []).forEach((e) => {
                (e.lines || []).forEach((l) => {
                    rows.push(
                        [
                            e.id,
                            e.date,
                            e.memo,
                            e.sourceType,
                            l.accountCode,
                            l.accountName,
                            l.debit > 0 ? JC.round2(l.debit) : '',
                            l.credit > 0 ? JC.round2(l.credit) : '',
                        ].map(csvEscape).join(','),
                    );
                });
            });
            return '\uFEFF' + rows.join('\n');
        }

        function downloadCsv(filename, text) {
            const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
        }

        document.getElementById('btn-journal-export-csv')?.addEventListener('click', async () => {
            const db = await loadDb();
            JC.ensureChartOfAccounts(db);
            const text = buildJournalWorkbookCsv(db);
            const name = 'journal_ledger_' + new Date().toISOString().slice(0, 10) + '.csv';
            downloadCsv(name, text);
        });

        document.getElementById('btn-journal-export-pdf')?.addEventListener('click', () => {
            if (typeof window.exportPageToPDF === 'function') {
                window.exportPageToPDF('قيود_محاسبية_هش.pdf');
            } else {
                window.print();
            }
        });

        document.getElementById('btn-journal-print')?.addEventListener('click', () => {
            window.print();
        });

        window.exportJournalFullCSV = async function () {
            const db = await loadDb();
            JC.ensureChartOfAccounts(db);
            return buildJournalWorkbookCsv(db);
        };

        btnSaveManual?.addEventListener('click', async () => {
            const memo = (document.getElementById('manual-je-memo').value || '').trim();
            const db = await loadDb();
            JC.ensureChartOfAccounts(db);
            const chart = db.chartOfAccounts;
            const lines = [];
            manualLines.querySelectorAll('.manual-je-line').forEach((row) => {
                const code = row.querySelector('.je-acc').value;
                const deb = JC.round2(row.querySelector('.je-deb').value);
                const cred = JC.round2(row.querySelector('.je-cred').value);
                if (deb <= 0 && cred <= 0) return;
                const name = JC.accName(chart, code);
                lines.push({ accountCode: code, accountName: name, debit: deb > 0 ? deb : 0, credit: cred > 0 ? cred : 0 });
            });
            const entry = {
                id: 'JE-MAN-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                date: new Date().toISOString().slice(0, 10),
                timestamp: Date.now(),
                memo: memo || 'قيد يدوي',
                sourceType: 'manual',
                sourceId: '',
                lines,
            };
            const v = JC.validateManualEntry(entry);
            if (!v.ok) {
                alert(v.msg);
                return;
            }
            if (!db.journalEntries) db.journalEntries = [];
            db.journalEntries.push(entry);
            await window.dbWrite(db);
            modal.classList.remove('active');
            await refresh();
        });

        await refresh();

        if (typeof window.registerPosDatabaseRefresh === 'function') {
            window.registerPosDatabaseRefresh(() => refresh());
        }
    });
})();
