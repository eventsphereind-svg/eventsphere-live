const express = require('express');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors'); 
const Razorpay = require('razorpay');
const fs = require('fs'); 
const { execSync } = require('child_process');

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');

// ================= 🛡️ BULLETPROOF CRASH HANDLER 🛡️ =================
process.on('uncaughtException', (err) => {
    if (err.message.includes('Network.getResponseBody') || 
        err.message.includes('Protocol error') || 
        err.message.includes('Execution context was destroyed')) {
        console.log("🛡️ WhatsApp Background Cache/Refresh Error Caught & Ignored! Server is Safe. 🚀");
    } else {
        console.error("🚨 Uncaught Exception:", err.message);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.message && (reason.message.includes('Session closed') || reason.message.includes('Target closed'))) {
        console.log("🛡️ WhatsApp Session Error Ignored.");
    } else {
        console.log("🛡️ Unhandled Promise Rejection Caught! System is Safe.");
    }
});
// ====================================================================

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); 

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning']
}));

// 🔥 SIRF YE LINE CHANGE HUI HAI CLOUD PORT KE LIYE 🔥
const PORT = process.env.PORT || 3002;

// --- DATABASE ---
const db = new sqlite3.Database('./eventsphere_records.db', (err) => {
    if (err) console.error("Database error:", err.message);
    else console.log('✅ Database Ready! 📒');
});

// 🔥 SAFE SCHEMA UPGRADE (WITH RESTAURANT MODULE) 🔥
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tickets (payment_id TEXT PRIMARY KEY, phone TEXT, email TEXT, event_name TEXT, amount TEXT, status TEXT)`);
    db.run(`ALTER TABLE tickets ADD COLUMN category TEXT DEFAULT 'GENERAL'`, () => {});
    db.run(`ALTER TABLE tickets ADD COLUMN total_guests INTEGER DEFAULT 1`, () => {});
    db.run(`ALTER TABLE tickets ADD COLUMN entered_guests INTEGER DEFAULT 0`, () => {});
    
    db.run(`CREATE TABLE IF NOT EXISTS organizers (id TEXT PRIMARY KEY, password TEXT, org_name TEXT, event_name TEXT)`);
    db.run(`INSERT OR IGNORE INTO organizers VALUES ('kesariya', 'garba123', 'Kesariya Garba', 'Kesariya Garba')`);
    db.run(`INSERT OR IGNORE INTO organizers VALUES ('citylight', 'comedy456', 'Citylight Comedy', 'Standup Night')`);

    db.run(`CREATE TABLE IF NOT EXISTS restaurant_bookings (booking_id TEXT PRIMARY KEY, phone TEXT, customer_name TEXT, restaurant_name TEXT, guests INTEGER, booking_time TEXT, status TEXT)`);
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'eventsphereind@gmail.com', pass: 'slcrxmobqeorwxrz' }
});

// ================= WHATSAPP SETUP =================
const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Users\\HP\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe' 
];

let exactBrowserPath = possiblePaths.find(p => fs.existsSync(p));

try {
    execSync('taskkill /F /IM chrome.exe /FI "STATUS eq RUNNING"', { stdio: 'ignore' });
} catch (err) {}

// 🚀 WHATSAPP CLIENT SETUP (CHROME FIX KE SATH) 🚀
const waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
        executablePath: puppeteer.executablePath(), 
        headless: true, 
        timeout: 60000, 
        protocolTimeout: 120000, 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security', 
            '--js-flags="--max-old-space-size=1024"' 
        ]
    },
    webVersionCache: {
        type: 'none' 
    }
});

waClient.on('qr', (qr) => {
    qrcodeTerminal.generate(qr, {small: true});
    console.log("👆 Apne WhatsApp (Linked Devices) se ye QR scan karo bhai!");
});

waClient.on('ready', () => {
    console.log('✅ WhatsApp API ekdum Ready hai! Ab messages automatically jayenge.');
});

// ================= 🤖 EVENTSPHERE AI AUTO-RESPONDER =================
waClient.on('message', async (message) => {
    if (message.fromMe || message.isForwarded || message.isGroupMsg) return;

    const userText = message.body.toLowerCase();
    const sender = message.from;

    try {
        if (userText === 'hi' || userText === 'hello' || userText === 'hey') {
            await waClient.sendMessage(sender, 
                `*Welcome to EventSphere!* 🚀\nGujarat's Premium Zero-Cost Platform.\n\nAapko kis baare mein janna hai?\n\nType *1* - List My Event 🎟️\nType *2* - My Ticket Not Received ❓\nType *3* - Partner with Us 🤝\nType *4* - Restaurant Deals & Booking 🍽️ *(NEW)*`
            );
        } 
        else if (userText === '1') {
            await waClient.sendMessage(sender, `*List Your Event For FREE!* 📈\n✅ 0% Organizer Commission\n✅ Direct Bank Settlement\n✅ VIP WhatsApp E-Tickets\n\nHumein apne event ki details bhejein!`);
        }
        else if (userText === '2') {
            await waClient.sendMessage(sender, `*Ticket Support* 🎫\nApna Payment Screenshot bhejein. System 5 min me PDF bhej dega.`);
        }
        else if (userText === '3') {
            await waClient.sendMessage(sender, `*Partner With Us* 🤝\nApna naam aur details yahan chhod dein. Founder aapse direct baat karenge!`);
        }
        else if (userText === '4' || userText.includes('restaurant') || userText.includes('food')) {
            await waClient.sendMessage(sender, 
                `*🍽️ VIP Restaurant Booking* \n\nDirect book karein aur exclusive deals paayein!\n\nKripya ye details bhejein:\n1. Aapka Naam:\n2. Kitne Log (Guests):\n3. Date aur Time:\n\nBooking confirm hote hi aapko WhatsApp par ek 3D Entry Pass mil jayega! ✅`
            );
        }
    } catch (err) {
        console.error("AI Reply Error:", err);
    }
});

waClient.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp Disconnected! Reason:', reason);
    console.log('🔄 Firse auto-connect kar raha hu...');
    waClient.destroy().then(() => { 
        setTimeout(() => { startWhatsApp(); }, 5000); 
    }).catch((err) => { console.log("Destroy error:", err); });
});

async function startWhatsApp() {
    try {
        await waClient.initialize();
    } catch (err) {
        console.error("🚨 WhatsApp Initialize Error Caught:", err.message);
        if (err.message.includes('detached') || err.message.includes('closed') || err.message.includes('Session') || err.message.includes('Execution context was destroyed') || err.message.includes('timed out')) {
            console.log("🔄 Auto-restarting in 5 seconds...");
            try { await waClient.destroy(); } catch (e) {} 
            setTimeout(() => { startWhatsApp(); }, 5000);
        }
    }
}
startWhatsApp(); 

// ================= WHATSAPP OTP SYSTEM =================
const otpStore = {}; 

app.post('/send-otp', async (req, res) => {
    const { phone, name } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore[phone] = otp; 
    try {
        let cleanPhone = phone.replace(/\D/g, ''); 
        if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;
        let formattedPhone = cleanPhone + "@c.us";
        const msg = `Hi ${name},\n\nAapka EventSphere Login OTP hai: *${otp}*\n\nIsko kisi ke sath share na karein! 🚀`;
        await waClient.sendMessage(formattedPhone, msg);
        res.json({ success: true, message: 'OTP sent to WhatsApp' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
});

app.post('/verify-otp', (req, res) => {
    const { phone, otp } = req.body;
    if (otpStore[phone] && otpStore[phone] === otp) {
        delete otpStore[phone]; 
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.json({ success: false, message: 'Invalid OTP' });
    }
});

app.get('/my-tickets/:phone', (req, res) => {
    const userPhone = req.params.phone;
    db.all(`SELECT * FROM tickets WHERE phone = ?`, [userPhone], (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, tickets: rows });
    });
});

const razorpay = new Razorpay({
    key_id: 'rzp_live_TG2UWr9VztqbAn',
    key_secret: 'WPL8U4aRBdst6aIx8IDgY7AQ'
});

async function sendWhatsAppMessage(phone, ticketID, pdfBuffer, captionText = null) {
    if (!captionText) {
        captionText = `🎟️ *EventSphere Ticket!* 🎟️\n\nTicket ID: ${ticketID}\n\nPayment successful! Gate par ye PDF aur ID dikhayein. Enjoy!`;
    }
    try {
        let cleanPhone = phone.toString().replace(/\D/g, ''); 
        if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;
        let formattedPhone = cleanPhone + "@c.us"; 
        
        console.log(`🚀 Fast sending WhatsApp PDF to: ${formattedPhone}`);

        if (!waClient || !waClient.info) {
            console.log("❌ ERROR: WhatsApp abhi Ready nahi hua hai. Server me 'Ready' aane ka wait karo!");
            return;
        }

        const numberDetails = await waClient.getNumberId(formattedPhone);
        if (!numberDetails) {
            console.log(`❌ ERROR: Ye number (${cleanPhone}) WhatsApp par registered nahi hai!`);
            return;
        }

        const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), `EventSphere_Ticket_${ticketID}.pdf`);
        
        await waClient.sendMessage(numberDetails._serialized, media, { caption: captionText });
        console.log("✅ PDF ke sath WhatsApp Ticket successfully bhej di gayi! 🔥");
        
    } catch (error) {
        console.error("❌ WhatsApp Error:", error.message);
    }
}

app.post('/create-order', async (req, res) => {
    try {
        const options = { amount: req.body.amount * 100, currency: "INR", receipt: `rcpt_${Math.floor(Math.random() * 1000)}` };
        const order = await razorpay.orders.create(options);
        res.json({ success: true, order });
    } catch (error) { res.status(500).json({ success: false, message: "Order error" }); }
});

// ================= PREMIUM PDF WEBHOOK =================
app.post('/razorpay-webhook', async (req, res) => {
    console.log('\n--- NAYA CUSTOMER AAYA! 💸 ---');
    try {
        let paymentId = "TEST_" + Math.floor(Math.random() * 10000);
        let customerEmail = "test@gmail.com"; 
        let customerPhone = "+919724257148";
        let eventName = "Premium Event";
        let amountPaid = "0";

        let ticketCategory = "GENERAL PASS";
        let eventDate = "To Be Announced";
        let eventTime = "Gate Opening Time";
        let totalGuests = 1; 

        if (req.body.payload?.payment?.entity) {
            const entity = req.body.payload.payment.entity;
            paymentId = entity.id;
            customerEmail = entity.email; 
            customerPhone = entity.notes?.customer_phone || entity.contact || customerPhone; 
            eventName = entity.notes?.event_name || eventName;
            amountPaid = (entity.amount / 100) + " INR";
            
            if(entity.notes?.category) ticketCategory = entity.notes.category;
            if(entity.notes?.date) eventDate = entity.notes.date;
            if(entity.notes?.time) eventTime = entity.notes.time;
            if(entity.notes?.total_guests) totalGuests = parseInt(entity.notes.total_guests); 
        }
        
        const isInserted = await new Promise((resolve) => {
            db.run(`INSERT OR IGNORE INTO tickets (payment_id, phone, email, event_name, amount, status, category, total_guests, entered_guests) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [paymentId, customerPhone, customerEmail, eventName, amountPaid, 'VALID', ticketCategory, totalGuests, 0], 
            function(err) {
                if (err) resolve(false); else resolve(this.changes > 0); 
            });
        });

        if (!isInserted) return res.status(200).send('OK'); 
        console.log(`✅ Ticket DB me save ho gayi! [Guests: ${totalGuests}] PDF banate hain...`);

        const isVIP = ticketCategory.toUpperCase().includes('VIP') || ticketCategory.toUpperCase().includes('BACKSTAGE');
        const bgDark = isVIP ? '#0a0a0a' : '#0B132B'; 
        const accentBase = isVIP ? '#BF953F' : '#38BDF8'; 
        const accentLight = isVIP ? '#FCF6BA' : '#BAE6FD';
        const accentDark = isVIP ? '#B38728' : '#0284C7';
        const white = '#FFFFFF';
        const qrColor = isVIP ? '#D4AF37' : '#0369A1'; 

        const mapQuery = encodeURIComponent(eventName + " Gujarat");
        const mapLink = `https://maps.google.com/?q=${mapQuery}`;

        // 🔥 MAGIC DIRECT LINK (DIRECT QR OPENS) 🔥
        let directLink = `https://www.eventsphere.site/?id=${paymentId}&e=${encodeURIComponent(eventName)}&q=${totalGuests}&d=${encodeURIComponent(eventDate)}&t=${encodeURIComponent(eventTime)}`;

        let captionText = "";
        if(isVIP) {
            captionText = `🌟 *VVIP EXCLUSIVE PASS CONFIRMED* 🌟\n\nWelcome to the Elite club!\n\n🎟️ *Ticket ID:* ${paymentId}\n🎫 *Event:* ${eventName}\n👑 *Category:* ${ticketCategory.toUpperCase()}\n👥 *Guests:* ${totalGuests}\n\n✨ *TAP TO OPEN DIRECT QR TICKET:*\n👉 ${directLink}\n\n📍 *Location:*\n${mapLink}`;
        } else {
            captionText = `🎟️ *Your Event Ticket is Confirmed!* 🎟️\n\nTicket ID: ${paymentId}\nEvent: ${eventName}\nCategory: ${ticketCategory.toUpperCase()}\nGuests: ${totalGuests}\n\n✨ *TAP TO OPEN DIRECT QR TICKET:*\n👉 ${directLink}\n\n📍 *Location:*\n${mapLink}`;
        }

        const passType = isVIP ? "VIP Pass" : "General Pass";
        const qrText = "EventSphere " + passType + " | ID: " + paymentId + " | Event: " + eventName;
        
        const qrImage = await QRCode.toDataURL(qrText, { color: { dark: qrColor, light: '#FFFFFF' }, width: 400, margin: 2 });
        const doc = new PDFDocument({ size: [600, 850], margin: 0 }); 
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        
        doc.on('end', async () => {
            try {
                const pdfData = Buffer.concat(buffers);
                try {
                    transporter.sendMail({
                        from: 'eventsphereind@gmail.com', to: customerEmail, subject: `Your Ticket for ${eventName} 🎟️`,
                        text: 'Payment successful! Attached is your E-Ticket.',
                        attachments: [{ filename: `EventSphere_Ticket_${paymentId}.pdf`, content: pdfData }]
                    }, (err) => {});
                } catch(e) {}
                
                await sendWhatsAppMessage(customerPhone, paymentId, pdfData, captionText);
            } catch (err) {
                console.error("❌ PDF Processing Error:", err.message);
            }
        });

        doc.rect(0, 0, doc.page.width, doc.page.height).fill(bgDark);
        const grad = doc.linearGradient(0, 0, doc.page.width, 0);
        grad.stop(0, accentBase).stop(0.5, accentLight).stop(1, accentDark);
        
        doc.rect(15, 15, doc.page.width - 30, doc.page.height - 30).lineWidth(4).stroke(grad);
        doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50).lineWidth(1).stroke(accentBase);
        doc.fillColor(accentLight).fontSize(36).text('EVENTSPHERE', 0, 310, { align: 'center', characterSpacing: 5 });
        doc.moveTo(100, 390).lineTo(doc.page.width - 100, 390).lineWidth(1).stroke(grad);
        doc.fillColor(grad).fontSize(28).text(eventName.toUpperCase(), 0, 420, { align: 'center' });
        
        doc.roundedRect(40, 490, 300, 180, 10).fill('#111111');
        doc.roundedRect(40, 490, 300, 180, 10).lineWidth(1).stroke(accentBase);
        
        doc.fillColor(accentBase).fontSize(16);
        doc.text(`TYPE:`, 60, 510); doc.fillColor(white).text(ticketCategory.toUpperCase(), 130, 510);
        doc.fillColor(accentBase).text(`GUESTS:`, 60, 550); doc.fillColor(white).text(`${totalGuests} PERSON(S)`, 140, 550); 
        doc.fillColor(accentBase).text(`ID:`, 60, 590); doc.fillColor(white).text(paymentId, 130, 590);

        const qrSize = 140; const qrX = 380; const qrY = 500;

        doc.fillColor('#111111').fillOpacity(0.8).roundedRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 50, 10).fill();
        doc.fillOpacity(1); 
        const cLen = 15; 
        
        doc.moveTo(qrX - 10, qrY - 10 + cLen).lineTo(qrX - 10, qrY - 10).lineTo(qrX - 10 + cLen, qrY - 10).strokeColor('#D4AF37').lineWidth(2).stroke();
        doc.moveTo(qrX + qrSize + 10 - cLen, qrY - 10).lineTo(qrX + qrSize + 10, qrY - 10).lineTo(qrX + qrSize + 10, qrY - 10 + cLen).strokeColor('#D4AF37').lineWidth(2).stroke();
        doc.moveTo(qrX - 10, qrY + qrSize + 10 - cLen).lineTo(qrX - 10, qrY + qrSize + 10).lineTo(qrX - 10 + cLen, qrY + qrSize + 10).strokeColor('#D4AF37').lineWidth(2).stroke();
        doc.moveTo(qrX + qrSize + 10 - cLen, qrY + qrSize + 10).lineTo(qrX + qrSize + 10, qrY + qrSize + 10).lineTo(qrX + qrSize + 10, qrY + qrSize - cLen + 10).strokeColor('#D4AF37').lineWidth(2).stroke();

        doc.fillColor('#FFFFFF').roundedRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4, 4).fill();
        doc.image(qrImage, qrX, qrY, { width: qrSize });
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#D4AF37').text('SCAN AT GATE', qrX, qrY + qrSize + 15, { width: qrSize, align: 'center', characterSpacing: 2 });

        const footerText = isVIP ? '★ ELITE VVIP PASS - SECURE ENTRY ★' : '★ VERIFIED EVENT TICKET ★';
        doc.fillColor(accentBase).fontSize(15).text(footerText, 0, 730, { align: 'center' });
        doc.end();

        res.status(200).send('OK');
    } catch (error) { res.status(500).send('Error'); }
});

// ================= 🏛️ TICKET BYPASS ENGINE (ORGANIZER PANEL) 🏛️ =================
app.post('/free-ticket', async (req, res) => {
    try {
        const { customerPhone, customerName, eventName, ticketCategory, eventDate, eventTime } = req.body;
        let totalGuests = req.body.guests ? parseInt(req.body.guests) : 1; 
        const isVIP = ticketCategory.toUpperCase().includes('VIP') || ticketCategory.toUpperCase().includes('BACKSTAGE');
        let idPrefix = isVIP ? "VIP_" : "GEN_";
        let paymentId = idPrefix + Math.floor(100000 + Math.random() * 900000);
        let amountPaid = "FREE / GUEST";
        let customerEmail = "guest@eventsphere.com"; 

        const bgDark = isVIP ? '#0a0a0a' : '#0B132B'; 
        const accentBase = isVIP ? '#BF953F' : '#38BDF8'; 
        const accentLight = isVIP ? '#FCF6BA' : '#BAE6FD';
        const accentDark = isVIP ? '#B38728' : '#0284C7';
        const white = '#FFFFFF';
        const qrColor = isVIP ? '#D4AF37' : '#0369A1';
        const mapQuery = encodeURIComponent(eventName + " Gujarat");
        const mapLink = `https://maps.google.com/?q=${mapQuery}`;

        // 🔥 MAGIC DIRECT LINK (DIRECT QR OPENS) 🔥
        let directLink = `https://www.eventsphere.site/?id=${paymentId}&e=${encodeURIComponent(eventName)}&q=${totalGuests}&d=${encodeURIComponent(eventDate)}&t=${encodeURIComponent(eventTime)}`;

        let captionText = "";
        if(isVIP) {
            captionText = `🏛️ *VIP Guest Pass Confirmed!* 🏛️\n\nTicket ID: ${paymentId}\nEvent: ${eventName}\nCategory: ${ticketCategory.toUpperCase()}\nAllowed Guests: ${totalGuests}\n\n✨ *TAP TO OPEN DIRECT QR TICKET:*\n👉 ${directLink}\n\n📍 *Location:*\n${mapLink}`;
        } else {
            captionText = `🎫 *Event Guest Pass Confirmed!* 🎫\n\nTicket ID: ${paymentId}\nEvent: ${eventName}\nCategory: ${ticketCategory.toUpperCase()}\nAllowed Guests: ${totalGuests}\n\n✨ *TAP TO OPEN DIRECT QR TICKET:*\n👉 ${directLink}\n\n📍 *Location:*\n${mapLink}`;
        }

        db.run(`INSERT INTO tickets (payment_id, phone, email, event_name, amount, status, category, total_guests, entered_guests) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [paymentId, customerPhone, customerEmail, eventName, amountPaid, 'VALID', ticketCategory || 'GUEST PASS', totalGuests, 0]);

        const passType = isVIP ? "VIP Pass" : "General Pass";
        const qrText = "EventSphere " + passType + " | ID: " + paymentId + " | Event: " + eventName;
        const qrImage = await QRCode.toDataURL(qrText, { color: { dark: qrColor, light: '#FFFFFF' }, width: 400, margin: 2 });
        
        const doc = new PDFDocument({ size: [600, 850], margin: 0 }); 
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        
        doc.on('end', async () => {
            try {
                const pdfData = Buffer.concat(buffers);
                await sendWhatsAppMessage(customerPhone, paymentId, pdfData, captionText);
            } catch (whatsappError) {}
        });

        doc.rect(0, 0, doc.page.width, doc.page.height).fill(bgDark);
        const grad = doc.linearGradient(0, 0, doc.page.width, 0);
        grad.stop(0, accentBase).stop(0.5, accentLight).stop(1, accentDark);
        
        doc.rect(15, 15, doc.page.width - 30, doc.page.height - 30).lineWidth(4).stroke(grad);
        doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50).lineWidth(1).stroke(accentBase);
        doc.fillColor(accentLight).fontSize(36).text('EVENTSPHERE', 0, 310, { align: 'center', characterSpacing: 5 });
        
        const subHeaderText = isVIP ? 'ELITE GUEST E-TICKET' : 'GENERAL GUEST E-TICKET';
        doc.fillColor(white).fontSize(14).text(subHeaderText, 0, 355, { align: 'center', letterSpacing: 4 });
        doc.moveTo(100, 390).lineTo(doc.page.width - 100, 390).lineWidth(1).stroke(grad);
        doc.fillColor(grad).fontSize(28).text(eventName.toUpperCase(), 0, 420, { align: 'center' });
        
        doc.roundedRect(40, 490, 300, 180, 10).fill('#111111');
        doc.roundedRect(40, 490, 300, 180, 10).lineWidth(1).stroke(accentBase);
        
        doc.fillColor(accentBase).fontSize(16);
        doc.text(`TYPE:`, 60, 510); doc.fillColor(white).text((ticketCategory || 'GUEST PASS').toUpperCase(), 130, 510);
        doc.fillColor(accentBase).text(`GUESTS:`, 60, 550); doc.fillColor(white).text(`${totalGuests} PERSON(S)`, 140, 550);
        doc.fillColor(accentBase).text(`ID:`, 60, 590); doc.fillColor(white).text(paymentId, 130, 590);

        const qrSize = 140; const qrX = 380; const qrY = 500;

        doc.fillColor('#111111').fillOpacity(0.8).roundedRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 50, 10).fill();
        doc.fillOpacity(1); 
        const cLen = 15; 
        
        doc.moveTo(qrX - 10, qrY - 10 + cLen).lineTo(qrX - 10, qrY - 10).lineTo(qrX - 10 + cLen, qrY - 10).strokeColor('#D4AF37').lineWidth(2).stroke();
        doc.moveTo(qrX + qrSize + 10 - cLen, qrY - 10).lineTo(qrX + qrSize + 10, qrY - 10).lineTo(qrX + qrSize + 10, qrY - 10 + cLen).strokeColor('#D4AF37').lineWidth(2).stroke();
        doc.moveTo(qrX - 10, qrY + qrSize + 10 - cLen).lineTo(qrX - 10, qrY + qrSize + 10).lineTo(qrX - 10 + cLen, qrY + qrSize + 10).strokeColor('#D4AF37').lineWidth(2).stroke();
        doc.moveTo(qrX + qrSize + 10 - cLen, qrY + qrSize + 10).lineTo(qrX + qrSize + 10, qrY + qrSize + 10).lineTo(qrX + qrSize + 10, qrY + qrSize - cLen + 10).strokeColor('#D4AF37').lineWidth(2).stroke();

        doc.fillColor('#FFFFFF').roundedRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4, 4).fill();
        doc.image(qrImage, qrX, qrY, { width: qrSize });
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#D4AF37').text('SCAN AT GATE', qrX, qrY + qrSize + 15, { width: qrSize, align: 'center', characterSpacing: 2 });

        const footerText = isVIP ? '★ GUEST OF HONOR - VIP ENTRY ★' : '★ VERIFIED GUEST ENTRY ★';
        doc.fillColor(accentBase).fontSize(15).text(footerText, 0, 730, { align: 'center' });
        doc.end();

        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// ================= MASTER SCANNER APIs & PITCHING ENGINE =================
app.post('/scan-ticket', (req, res) => {
    let paymentId = req.body.qrData;
    if(paymentId.includes('ID:')) {
        const match = paymentId.match(/ID:\s*([^ |]+)/);
        if(match) paymentId = match[1];
    }
    db.get(`SELECT * FROM tickets WHERE payment_id = ?`, [paymentId.trim()], (err, row) => {
        if (err || !row) return res.json({ success: false, message: "Invalid or Fake Ticket!" });
        res.json({ success: true, ticket: row });
    });
});

app.post('/confirm-entry', (req, res) => {
    const { paymentId, enteringNow } = req.body;
    db.get(`SELECT * FROM tickets WHERE payment_id = ?`, [paymentId], (err, row) => {
        if (!row) return res.json({ success: false, message: "Ticket Not Found!" });
        let total = row.total_guests || 1;
        let entered = row.entered_guests || 0;
        let newEntering = parseInt(enteringNow);
        if (entered + newEntering > total) return res.json({ success: false, message: `Re-entry Blocked! Only ${total - entered} pass(es) left.` });
        
        let newEntered = entered + newEntering;
        let newStatus = (newEntered === total) ? 'USED' : 'PARTIAL';
        db.run(`UPDATE tickets SET entered_guests = ?, status = ? WHERE payment_id = ?`, [newEntered, newStatus, paymentId], (updateErr) => {
            res.json({ success: true, message: `Entry Approved for ${newEntering} guests!`, remaining: total - newEntered });
        });
    });
});

app.post('/organizer-login', (req, res) => {
    const { id, pass } = req.body;
    db.get(`SELECT * FROM organizers WHERE id = ? AND password = ?`, [id, pass], (err, row) => {
        if (row) { res.json({ success: true, org: row }); } 
        else { res.status(401).json({ success: false, message: "Invalid ID/Pass" }); }
    });
});

app.get('/org-stats/:eventName', (req, res) => {
    const eventName = req.params.eventName;
    db.get(`SELECT SUM(total_guests) as total FROM tickets WHERE event_name = ?`, [eventName], (err, row) => {
        res.json({ ticketsCount: row && row.total ? row.total : 0 });
    });
});

app.post('/send-promo', async (req, res) => {
    const { phone, organizerName } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });
    try {
        let cleanPhone = phone.toString().replace(/\D/g, ''); 
        if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;
        let formattedPhone = cleanPhone + "@c.us"; 
        const orgName = organizerName ? organizerName : "Organizer";

        const numberDetails = await waClient.getNumberId(formattedPhone);
        if (!numberDetails) return res.json({ success: false, message: "Ye number WhatsApp par nahi hai!" });

        const promoMessage = `Hello *${orgName}*! 🌟\n\nAb Mega Events aur Navratri ko manage karna hua 100% FREE aur Premium! 🚀 EventSphere laya hai Gujarat ka sabse advanced ticketing system.\n\n✨ *Hamari Premium Services:*\n🎫 *3D VIP Prism Tickets:* Aapke guests ko WhatsApp par direct animated premium tickets milengi.\n⚡ *Lightning Fast Entry:* Hamare Smart QR Scanner se gate par lambi lines bilkul khatam.\n📊 *Live Dashboard:* Ek click mein saari ticket sales aur data aapke haath mein.\n🤖 *AI Auto-Support:* Customers ki ticket problem solve karne ke liye 24/7 AI WhatsApp Bot.\n\n💡 *Transparent Business Model:*\n• Platform Commission: *100% FREE (₹0)*\n• Sirf standard *2%* Bank/Payment Gateway (PhonePe) charges lagenge.\nBaaki poora 100% revenue seedha aapke account mein! 💸\n\nBade platforms ko heavy commission dena band kijiye aur apne VIP guests ko ek Royal feel dijiye. 👑\n\nKya main aapko hamare 3D WhatsApp Ticket ka ek chota sa live demo bhej sakta hu? 😍`;
        await waClient.sendMessage(numberDetails._serialized, promoMessage);
        res.json({ success: true, message: `Pitch sent to ${cleanPhone}!` });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to send promo message" }); }
});

const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 Server stopping due to ${signal}... WhatsApp disconnect kar rahe hain.`);
    try { await waClient.destroy(); } catch (err) {}
    if (signal === 'SIGUSR2') { process.kill(process.pid, 'SIGUSR2'); } else { process.exit(0); }
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

app.listen(PORT, () => {
    console.log(`EventSphere Master Engine Port ${PORT} par daud raha hai! 🚀`);
});
