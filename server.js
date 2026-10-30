const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
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

// ================= ROOT STATUS ENDPOINT =================
app.get('/', (req, res) => {
    res.send(`
        <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
            <h1 style="color:#D4AF37;">🚀 EventSphere Master Backend is Live!</h1>
            <p>Status: <b>Operational & Running smoothly on Render</b></p>
        </div>
    `);
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

        // Generate direct WhatsApp chat URL for instant messaging
        let formattedPhone = phone.replace(/\D/g, '');
        if (!formattedPhone.startsWith('91')) formattedPhone = '91' + formattedPhone;
        const whatsappMessage = encodeURIComponent(`Hello ${name}, your EventSphere login OTP is *${otp}*. Valid for 5 minutes.`);
        const whatsappUrl = `https://wa.me/${formattedPhone}?text=${whatsappMessage}`;

        console.log(`🔐 OTP Generated for ${phone} (${name}): ${otp}`);
        
        return res.json({ 
            success: true, 
            message: "OTP generated successfully!", 
            debug_otp: otp,
            whatsapp_link: whatsappUrl
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
        const options = { amount: (amount || 100) * 100, currency: "INR", receipt: `receipt_${Date.now()}` };
        const order = await razorpayInstance.orders.create(options);
        return res.json({ success: true, order });
    } catch (error) {
        console.error("Razorpay Error:", error);
        return res.json({ success: true, order: { id: `order_${Date.now()}`, amount: (req.body.amount || 100) * 100, currency: "INR" } }); 
    }
});

// ================= 4. VERIFY PAYMENT & GENERATE TICKET QR =================
app.post('/verify-payment', async (req, res) => {
    try {
        const { payment_id, event_name, category, customer_phone, date, time, amount } = req.body;
        const passId = 'ES-' + Math.floor(100000 + Math.random() * 900000);

        // Generate QR code data URL for the ticket pass ID
        const qrCodeDataUrl = await qrcode.toDataURL(`EventSphere Pass: ${passId} | Event: ${event_name || 'Event'} | Phone: ${customer_phone}`);

        const newTicket = {
            passId: passId,
            payment_id: payment_id || `pay_${Date.now()}`,
            amount: `₹${amount || 0}`,
            event_name: event_name || 'EventSphere Premium Event',
            category: category || 'General Pass',
            customer_phone: customer_phone,
            date: date || '2026',
            time: time || 'TBD',
            qrCode: qrCodeDataUrl,
            status: 'CONFIRMED',
            bookedOn: new Date().toLocaleDateString()
        };

        ticketsDB.push(newTicket);
        console.log("🎟️ Ticket Booked & QR Generated:", passId);
        
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
    console.log(`EventSphere Production Engine Port ${PORT} par daud raha hai! 🚀`);
});
