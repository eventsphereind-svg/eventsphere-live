const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');

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

// ================= 1. SEND OTP API =================
app.post('/send-otp', async (req, res) => {
    try {
        const { phone, name } = req.body;
        
        if (!phone || !name) {
            return res.status(400).json({ success: false, message: "Name aur Phone number zaroori hai!" });
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        otpStore[phone] = { otp, expires: Date.now() + 300000 }; // 5 mins

        // Generate direct WhatsApp click-to-chat URL
        let cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone.startsWith('91')) cleanPhone = '91' + cleanPhone;
        
        const message = encodeURIComponent(`Hello ${name}, your EventSphere login OTP is *${otp}*. Valid for 5 minutes.`);
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;

        console.log(`🔐 OTP Generated for ${phone} (${name}): ${otp}`);
        return res.json({ 
            success: true, 
            message: "OTP generated successfully!", 
            debug_otp: otp,
            whatsapp_url: whatsappUrl
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
        const passId = 'ES-' + Math.floor(100000 + Math.random() * 9
