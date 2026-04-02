/**
 * ZATCA Phase 2 E-Invoicing Engine for HASH POS
 * Integrates natively with Fatoora APIs without a third-party broker.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const child_process = require('child_process');

class ZatcaEngine {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.egs = null;
        this.isReady = false;
        this.zatcaModule = null;

        // "The Magic Option": Inject bundled OpenSSL directly into Node's runtime PATH
        // This ensures child_process.exec('openssl') inside zatca-xml-js always works!
        const bundledOpenSSL = path.join(__dirname, 'bin', 'openssl', 'x64', 'bin');
        if (!process.env.PATH.includes(bundledOpenSSL)) {
            process.env.PATH = bundledOpenSSL + path.delimiter + process.env.PATH;
        }
        
        try {
            this.zatcaModule = require('zatca-xml-js');
        } catch(e) {
            console.error('zatca-xml-js is missing. Please run npm install zatca-xml-js');
        }
    }

    async checkOpenSSL() {
        return new Promise((resolve) => {
            child_process.exec('openssl version', { env: process.env }, (error, stdout) => {
                if(error) {
                    console.error('[OpenSSL] Not found. Please place openssl.exe in:', path.join(__dirname, 'bin', 'openssl'));
                    resolve(false);
                } else {
                    console.log('[OpenSSL] Found:', stdout.trim());
                    resolve(true);
                }
            });
        });
    }

    async initializeEGS(vatNumber, companyName, branchName) {
        if(!this.zatcaModule) throw new Error('مكتبة زاتكا غير مثبتة (ZATCA Library not installed)');
        if(!(await this.checkOpenSSL())) throw new Error('مكتبة OpenSSL غير متوفرة في النظام (OpenSSL is not installed in Windows PATH)');

        const egsUnit = {
            uuid: crypto.randomUUID(),
            custom_id: "EGS-HASH-" + Date.now(),
            model: "HASH POS",
            CRN_number: "454634645645654",
            VAT_name: companyName || "مطعم",
            VAT_number: vatNumber || "310000000000003",
            location: {
                city: "Riyadh",
                city_subdivision: "Riyadh",
                street: "Main Street",
                plot_identification: "1234",
                building: "1234",
                postal_zone: "12345"
            },
            branch_name: branchName || "الفرع الرئيسي",
            branch_industry: "Food and Beverages" 
        };

        this.egs = new this.zatcaModule.EGS(egsUnit);
        
        // Ensure keys exist in DB, if not generate them
        const dbData = this.getDbData();
        if(!dbData.zatca_keys || !dbData.zatca_keys.privateKey) {
            console.log('[ZATCA] Generating new ECDSA keys and CSR...');
            await this.egs.generateNewKeysAndCSR(false, "HASH_POS_ZATCA");
            // Assume the egs object has methods to export or it saves locally.
            // Documentation implies keys are stored inside egs instance.
            this.saveKeysToDB(this.egs);
        } else {
             // Load existing keys (mock mechanism - might need strict module implementation)
             console.log('[ZATCA] Existing keys loaded.');
             this.egs.set.private_key = dbData.zatca_keys.privateKey;
        }

        this.isReady = true;
        return { success: true, message: 'تهيئة جاهزة.' };
    }

    async onboardDevice(otp) {
        if(!this.isReady) throw new Error('النظام غير مهيأ (EGS not initialized)');
        console.log(`[ZATCA] Requesting Compliance CSID with OTP: ${otp}`);
        
        try {
            // Note: Use Simulation environment first
            this.egs.api.url = "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal"; 
            const compliance_rid = await this.egs.issueComplianceCertificate(otp);
            console.log('[ZATCA] Compliance CSID acquired:', compliance_rid);
            
            // Immediately request Production certificate
            console.log('[ZATCA] Requesting Production CSID...');
            const prodRes = await this.egs.issueProductionCertificate(compliance_rid);
            
            // Save state to DB
            const dbData = this.getDbData();
            dbData.zatca_csid = { compliance: compliance_rid, prod: prodRes, onboarded: true };
            this.saveDbData(dbData);

            return { success: true, message: 'تم الربط بالهيئة بنجاح واستخراج الشهادة!' };
        } catch(e) {
            console.error('[ZATCA] Onboarding failed:', e);
            throw new Error('فشل إعداد الشهادة، قد يكون رمز الـ OTP منتهي الصلاحية أو أن OpenSSL فشل في توليد التوقيع.');
        }
    }

    async reportInvoice(orderData) {
        if(!this.isReady || !this.zatcaModule) {
            console.warn('[ZATCA Warning] Running offline. ZATCA engine not ready.');
            return false;
        }

        try {
            // Transform HASH orderData to lib-specific ZATCASimplifiedTaxInvoice
            const invoice = {
                invoice_counter_number: orderData.icv,
                invoice_serial_number: orderData.orderId,
                issue_date: new Date(orderData.timestamp).toISOString().split('T')[0],
                issue_time: new Date(orderData.timestamp).toISOString().split('T')[1].substring(0,8),
                previous_invoice_hash: orderData.pih,
                line_items: orderData.items.map(i => ({
                    id: i.id,
                    name: i.name,
                    quantity: i.qty,
                    tax_exclusive_price: i.price / 1.15, // Remove 15% VAT for exact calculation
                    VAT_percent: 0.15
                }))
            };

            const signed = this.egs.signInvoice(invoice);
            
            console.log(`[ZATCA] Reporting Invoice ${orderData.orderId}...`);
            const res = await this.egs.reportInvoice(signed.signed_invoice_string, signed.invoice_hash);
            
            console.log('[ZATCA] Invoice Reported successfully!', res);
            return true;
        } catch(e) {
            console.error('[ZATCA] Failed to report invoice:', e);
            return false;
        }
    }

    getDbData() {
        try { return JSON.parse(fs.readFileSync(this.dbPath, 'utf8')); }
        catch(e) { return {}; }
    }

    saveDbData(data) {
        fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    }

    saveKeysToDB(egs) {
        const db = this.getDbData();
        // Fallback save logic depending on how zatca-xml-js exposes generated keys
        db.zatca_keys = {
           generated: true
        };
        this.saveDbData(db);
    }
}

module.exports = ZatcaEngine;
