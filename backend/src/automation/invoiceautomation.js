const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const dotenv = require('dotenv');

dotenv.config();

// Create output directory if it doesn't exist
const OUTPUT_DIR = path.join(__dirname, 'invoice_data');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// IMAP Configuration
const imapConfig = {
    user: process.env.GMAIL_USER,
    password: process.env.GMAIL_APP_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' }
};

async function processInvoiceFile(filePath, emailInfo) {
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        return { rows, sheetName };
    } catch (err) {
        console.error('Error reading invoice file:', err);
        return null;
    }
}

async function startListening() {
    console.log('🚀 Starting invoice email monitoring...');
    console.log(`📧 Monitoring inbox for invoices: ${imapConfig.user}`);

    const imap = new Imap(imapConfig);

    imap.once('ready', function () {
        imap.openBox('INBOX', false, function (err, box) {
            if (err) throw err;
            console.log('✅ Invoice automation connected to inbox, listening for new messages...');

            imap.on('mail', function (numNewMsgs) {
                console.log(`🔔 ${numNewMsgs} new message(s) arrived (invoice watcher)!`);
                fetchNewEmails(imap);
            });

            fetchNewEmails(imap);
        });
    });

    imap.once('error', function (err) {
        console.error('❌ IMAP Error (invoice watcher):', err);
        setTimeout(startListening, 10000);
    });

    imap.once('end', function () {
        console.log('❌ IMAP connection ended (invoice watcher), reconnecting...');
        setTimeout(startListening, 10000);
    });

    imap.connect();
}

function fetchNewEmails(imap) {
    imap.search(['UNSEEN'], function (err, results) {
        if (err) {
            console.error('❌ Search error (invoice watcher):', err);
            return;
        }

        if (!results || !results.length) {
            console.log('📭 No new invoice messages to process');
            return;
        }

        const f = imap.fetch(results, { bodies: [''], struct: true });

        f.on('message', function (msg, seqno) {
            msg.on('body', function (stream, info) {
                let buffer = '';
                stream.on('data', function (chunk) { buffer += chunk.toString('utf8'); });
                stream.once('end', function () {
                    simpleParser(buffer, async (err, parsed) => {
                        if (err) { console.error('Error parsing email (invoice):', err); return; }

                        const emailInfo = {
                            id: seqno,
                            subject: parsed.subject || 'No Subject',
                            from: parsed.from?.text || 'Unknown',
                            date: parsed.date?.toISOString() || new Date().toISOString()
                        };

                        const subj = (emailInfo.subject || '').toLowerCase();
                        if (!subj.includes('invoicesheet')) {
                            console.log('Not an InvoiceSheet email, skipping');
                            return;
                        }

                        if (parsed.attachments && parsed.attachments.length > 0) {
                            for (const attachment of parsed.attachments) {
                                if (!attachment.filename) continue;
                                const fileName = attachment.filename;
                                if (!(fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))) continue;

                                const tempPath = path.join(OUTPUT_DIR, `temp_${Date.now()}_${fileName}`);
                                fs.writeFileSync(tempPath, attachment.content);

                                // Call uploadInvoiceExcel controller directly
                                try {
                                    const taskController = require('../modules/task_assignments/task.controller');
                                    const fakeReq = { file: { path: tempPath } };
                                    const fakeRes = {
                                        status: (code) => ({ json: (body) => { console.log('uploadInvoiceExcel result', code, body); } }),
                                        json: (body) => { console.log('uploadInvoiceExcel result', body); }
                                    };
                                    await taskController.uploadInvoiceExcel(fakeReq, fakeRes);
                                } catch (e) {
                                    console.error('Error calling uploadInvoiceExcel:', e);
                                } finally {
                                    try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
                                }
                            }
                        }
                    });
                });
            });

            msg.once('end', function () {
                imap.addFlags(results, ['\\Seen'], function (err) { if (err) console.error('Error marking message as read (invoice):', err); });
            });
        });

        f.once('error', function (err) { console.error('Fetch error (invoice):', err); });
    });
}

if (require.main === module) {
    startListening();
}

module.exports = { startListening };
