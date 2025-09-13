const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const dotenv = require('dotenv');

dotenv.config();

// Create output directory if it doesn't exist
const OUTPUT_DIR = path.join(__dirname, 'excel_data');
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

// Process Excel file
async function processExcelFile(filePath, emailInfo) {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        const result = {
            processedAt: new Date().toISOString(),
            emailInfo: emailInfo,
            data: {}
        };

        // Process each worksheet
        workbook.eachSheet((worksheet, sheetId) => {
            const sheetName = worksheet.name;
            const rows = [];

            // Get all rows with headers as keys
            const headers = [];
            worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
                headers[colNumber] = cell.value ? cell.value.toString() : `Column${colNumber}`;
            });

            // Process each row
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) { // Skip header row
                    const rowData = {};
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        rowData[headers[colNumber]] = cell.value;
                    });
                    rows.push(rowData);
                }
            });

            result.data[sheetName] = rows;
        });

        // Add summary
        const sheetNames = Object.keys(result.data);
        const totalRows = sheetNames.reduce((sum, sheet) => sum + result.data[sheet].length, 0);

        result.summary = {
            totalSheets: sheetNames.length,
            totalRows: totalRows,
            sheetNames: sheetNames
        };

        // Generate a safe filename from email info
        const date = new Date(emailInfo.date).toISOString().split('T')[0];
        const sender = emailInfo.from.replace(/[<>]/g, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const subject = emailInfo.subject.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);

        const outputPath = path.join(OUTPUT_DIR, `${date}_${sender}_${subject}_data.json`);
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

        console.log(`✅ Processed Excel file "${emailInfo.attachmentName}" - Saved to ${outputPath}`);
        return result;

    } catch (error) {
        console.error(`❌ Error processing Excel file: ${error.message}`);
        return null;
    }
}

// Connect to IMAP and listen for new emails
// Exported so server can start the automation when the app starts
async function startListening() {
    console.log('🚀 Starting real-time email monitoring...');
    console.log(`📧 Monitoring inbox: ${imapConfig.user}`);

    const imap = new Imap(imapConfig);

    imap.once('ready', function () {
        imap.openBox('INBOX', false, function (err, box) {
            if (err) throw err;
            console.log('✅ Connected to inbox, listening for new messages...');

            // Start listening for new emails
            imap.on('mail', function (numNewMsgs) {
                console.log(`🔔 ${numNewMsgs} new message(s) arrived!`);
                fetchNewEmails(imap);
            });

            // Run initial check for any new messages
            fetchNewEmails(imap);
        });
    });

    imap.once('error', function (err) {
        console.error('❌ IMAP Error:', err);
        setTimeout(startListening, 10000); // Reconnect after 10 seconds
    });

    imap.once('end', function () {
        console.log('❌ IMAP connection ended, reconnecting...');
        setTimeout(startListening, 10000); // Reconnect after 10 seconds
    });

    imap.connect();
}

// Fetch and process new emails
function fetchNewEmails(imap) {
    // Search for unread messages (can adjust criteria as needed)
    imap.search(['UNSEEN'], function (err, results) {
        if (err) {
            console.error('❌ Search error:', err);
            return;
        }

        if (!results || !results.length) {
            console.log('📭 No new messages to process');
            return;
        }

        console.log(`📬 Found ${results.length} new message(s)`);

        // Fetch the messages
        const f = imap.fetch(results, { bodies: [''], struct: true });

        f.on('message', function (msg, seqno) {
            console.log(`📩 Processing message #${seqno}`);

            msg.on('body', function (stream, info) {
                let buffer = '';
                stream.on('data', function (chunk) {
                    buffer += chunk.toString('utf8');
                });

                stream.once('end', function () {
                    // Parse the email
                    simpleParser(buffer, async (err, parsed) => {
                        if (err) {
                            console.error('❌ Error parsing email:', err);
                            return;
                        }

                        const emailInfo = {
                            id: seqno,
                            subject: parsed.subject || 'No Subject',
                            from: parsed.from?.text || 'Unknown Sender',
                            date: parsed.date?.toISOString() || new Date().toISOString()
                        };

                        console.log(`📧 Email: "${emailInfo.subject}" from ${emailInfo.from}`);

                        // Check for Excel attachments
                        if (parsed.attachments && parsed.attachments.length > 0) {
                            console.log(`📎 Found ${parsed.attachments.length} attachments`);

                            for (const attachment of parsed.attachments) {
                                // FIX: Check if filename exists before trying to use it
                                if (!attachment.filename) {
                                    console.log(`⚠️ Attachment without filename found, skipping...`);
                                    continue;
                                }

                                const fileName = attachment.filename;
                                console.log(`  - Attachment: ${fileName} (${attachment.contentType || 'unknown type'})`);

                                // Check if it's an Excel file
                                if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ||
                                    attachment.contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                                    attachment.contentType === 'application/vnd.ms-excel') {

                                    console.log(`📊 Found Excel attachment: ${fileName}`);

                                    // Save attachment to temp file
                                    const tempPath = path.join(OUTPUT_DIR, `temp_${Date.now()}_${fileName}`);
                                    fs.writeFileSync(tempPath, attachment.content);

                                    // If subject contains 'TaskSheet', call the upload controller directly
                                    const subjectLower = (emailInfo.subject || '').toLowerCase();
                                    if (subjectLower.includes('tasksheet')) {
                                        console.log('🔁 Detected TaskSheet email — invoking upload controller');
                                        // require task controller and call uploadExcel with a fake req/res
                                        try {
                                            const taskController = require('../modules/task_assignments/task.controller');
                                            // construct fake req and res
                                            const fakeReq = { file: { path: tempPath } };
                                            const fakeRes = {
                                                status: (code) => ({ json: (body) => { console.log('uploadExcel result', code, body); return null; } }),
                                                json: (body) => { console.log('uploadExcel result', body); }
                                            };

                                            // Call controller (it expects async)
                                            await taskController.uploadExcel(fakeReq, fakeRes);
                                        } catch (e) {
                                            console.error('❌ Error invoking upload controller:', e);
                                        } finally {
                                            // Clean up temp file
                                            try { fs.unlinkSync(tempPath); } catch (e) { console.warn(`⚠️ Could not delete temp file: ${e.message}`); }
                                        }
                                    } else {
                                        // Process Excel file (legacy behavior)
                                        emailInfo.attachmentName = fileName;
                                        await processExcelFile(tempPath, emailInfo);

                                        // Clean up temp file
                                        try {
                                            fs.unlinkSync(tempPath);
                                        } catch (e) {
                                            console.warn(`⚠️ Could not delete temp file: ${e.message}`);
                                        }
                                    }
                                }
                            }
                        } else {
                            console.log(`📭 No attachments found in this email`);
                        }
                    });
                });
            });

            // Mark as seen after processing
            msg.once('end', function () {
                imap.addFlags(results, ['\\Seen'], function (err) {
                    if (err) console.error('❌ Error marking message as read:', err);
                    else console.log(`✓ Marked message #${seqno} as read`);
                });
            });
        });

        f.once('error', function (err) {
            console.error('❌ Fetch error:', err);
        });
    });
}

// Export startListening and also allow running the file directly
if (require.main === module) {
    startListening();
    console.log('⏱️ Waiting for new emails with Excel attachments...');
    console.log('📁 Processed files will be saved to:', OUTPUT_DIR);
}

module.exports = { startListening };