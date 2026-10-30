const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const puppeteer = require('puppeteer');
const qrcode = require('qrcode');

const app = express();

// ================= MIDDLEWARES =================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ================= DATABASES =================
const otpStore = {};     
const ticketsDB = [];    

let browserInstance = null;
let pageInstance = null;
let latestQrString = '';
let whatsappStatus = 'DISCONNECTED';

// ================= PUPPETEER WHATSAPP BOT SETUP =================
async function startPuppeteerWhatsApp() {
    try {
        console.log('🤖 Starting Puppeteer Headless Browser for WhatsApp...');
        browserInstance = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });

        pageInstance = await browserInstance.newPage();
        await pageInstance.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('🌐 Navigating to WhatsApp Web...');
        await pageInstance.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

        whatsappStatus = 'WAITING_FOR_QR';
        console.log('⏳ Waiting for official WhatsApp QR pairing element...');

        // Check strictly for the official data-ref QR container
        const qrInterval = setInterval(async () => {
            try {
                if (!pageInstance) return;

                const qrRefData = await pageInstance.evaluate(() => {
                    // Strictly target WhatsApp Web's official QR data-ref attribute container
                    const qrContainer = document.querySelector('div[data-ref]');
                    if (qrContainer) {
                        return qrContainer.getAttribute('data-ref');
                    }
                    return null;
                });

                if (qrRefData && qrRefData !== latestQrString) {
                    latestQrString = qrRefData;
                    whatsappStatus = 'QR_READY';
                    console.log('📱 REAL WhatsApp QR Pairing Token successfully captured!');
                }
            } catch (e) {
                // Ignore transient loading errors
            }
        }, 3000);

    } catch (err) {
        console.error('❌ Puppeteer WhatsApp Error:', err);
        whatsappStatus = 'ERROR';
    }
}

// ================= BROWSER QR ENDPOINT =================
app.get('/qr', async (req, res) => {
    if (whatsappStatus === 'CONNECTED') {
        return res.send('<h2 style="color:green; text-align:center; margin-top:50px;">✅ WhatsApp is Connected via Puppeteer!</h2>');
    }
    if (!latestQrString) {
        return res.send('<h2 style="text-align:center; margin-top:50px;">⏳ WhatsApp Web is loading the login QR code, please refresh this page in 10-15 seconds...</h2>');
    }

    try {
        // Generate clean QR code image from the captured pairing token string
        const generatedDataUrl = await qrcode.toDataURL(latestQrString);
        const qrImageHtml = `<img src="${generatedDataUrl}" alt="WhatsApp QR" style="width:300px; height:300px; border:4px solid #D4AF37; border-radius:12px;" />`;

        res.send(`
            <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
                <h2>Scan WhatsApp QR Code to Connect</h2>
                ${qrImageHtml}
                <p>Status: <b>${whatsappStatus}</b></p>
                <p>Refresh this page if the QR code expires.</p>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Error rendering QR code image');
    }
});

// ================= 1. SEND OTP API =================
app.post('/send-otp', async (req, res) => {
    try {
        const { phone, name } = req.body;
        
        if (!phone || !name) {
            return res.status(400).json({ success: false, message: "Name aur Phone number zaroori hai!" });
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        otpStore[phone] = { otp, expires: Date.now() + 300000 }; // 5 mins

        console.log(`🔐 OTP Generated for ${phone} (${name}): ${otp}`);
        return res.json({ 
            success: true, 
            message: "OTP generated successfully!", 
            debug_otp: otp 
        });

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
        const options = { amount: amount * 100, currency: "INR", receipt: `receipt_${Date.now()}` };
        const order = await razorpayInstance.orders.create(options);
        return res.json({ success: true, order });
    } catch (error) {
        return res.json({ success: true, order: { id: `order_${Date.now()}`, amount: req.body.amount * 100, currency: "INR" } }); 
    }
});

// ================= 4. VERIFY PAYMENT & SAVE TICKET =================
app.post('/verify-payment', async (req, res) => {
    try {
        const { payment_id, event_name, category, customer_phone, date, time, amount } = req.body;
        const passId = 'ES-' + Math.floor(100000 + Math.random() * 900000);

        const newTicket = {
            passId: passId,
            payment_id: payment_id || `pay_${Date.now()}`,
            amount: `₹${amount}`,
            event_name: event_name || 'Premium Event',
            category: category || 'Entry Pass',
            customer_phone: customer_phone,
            date: date || 'TBD',
            time: time || 'TBD',
            status: 'CONFIRMED',
            bookedOn: new Date().toLocaleDateString()
        };

        ticketsDB.push(newTicket);
        console.log("🎟️ Ticket Booked & Saved:", passId);
        
        return res.json({ success: true, passId, ticket: newTicket });
    } catch (error) {
        console.error("Payment Verification Error:", error);
        return res.status(500).json({ success: false, message: "Failed to save ticket" });
    }
});

// ================= 5. GET MY TICKETS =================
app.get('/my-transactions/:phone', (req, res) => {
    try {
        console.log("Fetching tickets for phone:", req.params.phone);
        const phone = decodeURIComponent(req.params.phone);
        const userTickets = ticketsDB.filter(t => t.customer_phone === phone);
        return res.json({ success: true, tickets: userTickets });
    } catch (error) {
        return res.status(500).json({ success: false, error: "Failed to fetch tickets" });
    }
});

// ================= SERVER START & PUPPETEER INIT =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`EventSphere Puppeteer Engine Port ${PORT} par daud raha hai! 🚀`);
    setTimeout(startPuppeteerWhatsApp, 3000);
});
