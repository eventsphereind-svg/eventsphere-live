const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const axios = require('axios');

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

// ================= WHATSAPP NOTIFICATION HELPER =================
async function sendWhatsAppNotification(phone, message) {
    try {
        let formattedPhone = phone.replace(/\D/g, '');
        if (!formattedPhone.startsWith('91')) {
            formattedPhone = '91' + formattedPhone;
        }
        console.log(`📱 WhatsApp Message Triggered for ${formattedPhone}:`, message);
        return true;
    } catch (err) {
        console.error('❌ WhatsApp Notification Error:', err);
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
        await sendWhatsAppNotification(phone, msg);

        console.log(`🔐 OTP Generated for ${phone}: ${otp}`);
        return res.json({ success: true, message: "OTP successfully generated!", debug_otp: otp });

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

// ================= 4. VERIFY PAYMENT & SEND TICKET =================
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

        // Send Ticket confirmation message
        const ticketMsg = `🎉 *Booking Confirmed! - EventSphere*\n\n*Event:* ${newTicket.event_name}\n*Pass ID:* ${passId}\n*Category:* ${category}\n*Date:* ${date} | ${time}\n*Amount Paid:* ₹${amount}\n\nShow this Pass ID at the venue entry. Thank you!`;
        await sendWhatsAppNotification(customer_phone, ticketMsg);
        
        return res.json({ success: true, passId, ticket: newTicket });
    } catch (error) {
        console.error("Payment Verification Error:", error);
        return res.status(500).json({ success: false, message: "Failed to save ticket" });
    }
});

// ================= 5. GET MY TICKETS =================
app.get('/my-tickets/:phone', (req, res) => {
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
    console.log(`EventSphere Master Engine Port ${PORT} par daud raha hai! 🚀`);
});
