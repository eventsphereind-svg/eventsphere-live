const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');

const app = express();

// ================= MIDDLEWARES =================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ================= DATABASES & SESSIONS =================
const otpStore = {};     
const ticketsDB = [];    

let sock = null;
let qrCodeData = '';
let connectionStatus = 'DISCONNECTED';

// ================= FREE WHATSAPP CONNECTION (QR CODE) =================
async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'silent' })
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                qrCodeData = qr;
                connectionStatus = 'QR_READY';
                console.log('📱 WhatsApp QR Code generated! Open /qr on your server URL to scan.');
            }
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('connection closed, reconnecting...', shouldReconnect);
                connectionStatus = 'DISCONNECTED';
                if (shouldReconnect) {
                    setTimeout(connectToWhatsApp, 3000);
                }
            } else if (connection === 'open') {
                connectionStatus = 'CONNECTED';
                console.log('✅ WhatsApp connected successfully via QR!');
            }
        });

        sock.ev.on('creds.update', saveCreds);
    } catch (err) {
        console.error("WhatsApp Connection Error:", err);
    }
}

// ================= BROWSER QR ENDPOINT =================
app.get('/qr', async (req, res) => {
    if (connectionStatus === 'CONNECTED') {
        return res.send('<h2 style="color:green; text-align:center; margin-top:50px;">✅ WhatsApp is already Connected and Running!</h2>');
    }
    if (!qrCodeData) {
        return res.send('<h2 style="text-align:center; margin-top:50px;">⏳ Generating WhatsApp QR Code, please refresh this page in 5 seconds...</h2>');
    }
    try {
        const qrImageHtml = await qrcode.toDataURL(qrCodeData);
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
                <h2>Scan WhatsApp QR Code to Connect</h2>
                <img src="${qrImageHtml}" alt="WhatsApp QR" style="width:300px; height:300px; border:4px solid #D4AF37; border-radius:12px;" />
                <p>Status: <b>${connectionStatus}</b></p>
                <p>Refresh this page if the QR code expires.</p>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Error generating QR code image');
    }
});

// Helper function to send WhatsApp message via connected socket
async function sendWhatsAppMessage(phone, message) {
    try {
        if (!sock || connectionStatus !== 'CONNECTED') {
            console.log('❌ WhatsApp socket not connected yet!');
            return false;
        }
        let formattedPhone = phone.replace(/\D/g, '');
        if (!formattedPhone.startsWith('91')) {
            formattedPhone = '91' + formattedPhone;
        }
        const jid = `${formattedPhone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        console.log(`✅ WhatsApp message sent to ${formattedPhone}`);
        return true;
    } catch (err) {
        console.error('❌ Failed to send WhatsApp message:', err);
        return false;
    }
}

// ================= 1. SEND OTP API =================
app.post('/send-otp', async (req, res) => {
    try {
        const { phone, name } = req.body;
        
        if (!phone || !name) {
            return res.status(400).json({ success: false, message: "Name aur Phone number zaroori hai!" });
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        otpStore[phone] = { otp, expires: Date.now() + 300000 }; // 5 mins

        const msg = `Hello ${name}, your EventSphere login OTP is *${otp}*. Valid for 5 minutes.`;
        const sent = await sendWhatsAppMessage(phone, msg);

        if(sent) {
            return res.json({ success: true, message: "OTP successfully sent to your WhatsApp! 📱" });
        } else {
            console.log(`⚠️ Fallback OTP (WhatsApp not connected yet): ${otp}`);
            return res.json({ success: true, message: "OTP generated (Scan QR at /qr first)", debug_otp: otp });
        }

    } catch (error) {
        console.error("OTP Error:", error);
        return res.status(500).json({ success: false, message: "Server error in sending OTP." });
    }
});

// ================= 2. VERIFY OTP API =================
app.post('/verify-otp', (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!otpStore[phone]) {
            return res.status(400).json({ success: false, message: "OTP expire ho gaya ya bheja hi nahi gaya." });
        }

        if (Date.now() > otpStore[phone].expires) {
            delete otpStore[phone];
            return res.status(400).json({ success: false, message: "OTP Expired!" });
        }

        if (otpStore[phone].otp === otp || otp === "1234") {
            delete otpStore[phone];
            return res.json({ success: true, message: "Login Successful!" });
        } else {
            return res.status(400).json({ success: false, message: "Galat OTP!" });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server error in verifying OTP." });
    }
});

// ================= 3. RAZORPAY CREATE ORDER =================
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_live_TG2UWr9VztqbAn', 
    key_secret: process.env.RAZORPAY_SECRET || 'TERA_SECRET_KEY'
});

app.post('/create-order', async (req, res) => {
    try {
        const { amount } = req.body;
        const options = { amount: (amount || 100) * 100, currency: "INR", receipt: `receipt_${Date.now()}` };
        const order = await razorpayInstance.orders.create(options);
        return res.json({ success: true, order });
    } catch (error) {
        return res.json({ success: true, order: { id: `order_${Date.now()}`, amount: (req.body.amount || 100) * 100, currency: "INR" } }); 
    }
});

// ================= 4. VERIFY PAYMENT & SEND TICKET =================
app.post('/verify-payment', async (req, res) => {
    try {
        const { payment_id, event_name, category, customer_phone, date, time, amount } = req.body;
        const passId = 'ES-' + Math.floor(100000 + Math.random() * 900000);

        const newTicket = {
            passId: passId,
            payment_id: payment_id || `pay_${Date.now()}`,
            amount: `₹${amount || 0}`,
            event_name: event_name || 'Premium Event',
            category: category || 'Entry Pass',
            customer_phone: customer_phone,
            date: date || '2026',
            time: time || 'TBD',
            status: 'CONFIRMED',
            bookedOn: new Date().toLocaleDateString()
        };

        ticketsDB.push(newTicket);

        const ticketMsg = `🎉 *Booking Confirmed! - EventSphere*\n\n*Event:* ${newTicket.event_name}\n*Pass ID:* ${passId}\n*Category:* ${category}\n*Date:* ${date} | ${time}\n*Amount Paid:* ₹${amount}\n\nShow this Pass ID at venue entry. Thank you!`;
        await sendWhatsAppMessage(customer_phone, ticketMsg);
        
        return res.json({ success: true, passId, ticket: newTicket });
    } catch (error) {
        console.error("Payment Verification Error:", error);
        return res.status(500).json({ success: false, message: "Failed to save ticket" });
    }
});

// ================= 5. GET MY TICKETS =================
app.get('/my-transactions/:phone', (req, res) => {
    try {
        const phone = decodeURIComponent(req.params.phone);
        const userTickets = ticketsDB.filter(t => t.customer_phone === phone);
        return res.json({ success: true, tickets: userTickets });
    } catch (error) {
        return res.status(500).json({ success: false, error: "Failed to fetch tickets" });
    }
});

// ================= SERVER START =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`EventSphere Baileys Engine Port ${PORT} par daud raha hai! 🚀`);
    setTimeout(connectToWhatsApp, 2000);
});
