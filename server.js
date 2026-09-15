const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Razorpay = require('razorpay');
const app = express();

// ================= MIDDLEWARES =================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Temporary Databases in Memory
const otpStore = {}; 
const ticketsDB = []; 

// ================= META WHATSAPP CLOUD API CONFIG =================
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'TERA_META_TEMPORARY_ACCESS_TOKEN';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '1194212520447621';

// Function to send real WhatsApp message via Official Meta API
async function sendRealWhatsAppOTP(phone, otp, name) {
    try {
        let formattedPhone = phone.replace(/\D/g, ''); // Remove '+' or spaces
        const url = `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`;
        
        const response = await axios.post(url, {
            messaging_product: "whatsapp",
            to: formattedPhone,
            type: "text",
            text: { body: `Hello ${name}, your EventSphere login OTP is *${otp}*. Valid for 5 minutes.` }
        }, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("✅ WhatsApp OTP Sent Successfully via Meta API:", response.data);
        return true;
    } catch (error) {
        console.error("❌ Meta WhatsApp API Error:", error.response ? error.response.data : error.message);
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
        otpStore[phone] = { otp, expires: Date.now() + 300000 }; // 5 mins validity

        // Real WhatsApp message trigger via Meta API
        const sent = await sendRealWhatsAppOTP(phone, otp, name);

        if(sent) {
            return res.json({ success: true, message: "OTP successfully sent to your WhatsApp! 📱" });
        } else {
            // Fallback mode agar token ya API limit mein kuch issue ho
            console.log(`⚠️ Fallback OTP (Meta API failed): ${otp}`);
            return res.json({ success: true, message: "OTP generated (Check console/debug)", debug_otp: otp });
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

        if (otpStore[phone].otp === otp) {
            delete otpStore[phone];
            return res.json({ success: true, message: "Login Successful!" });
        } else {
            return res.status(400).json({ success: false, message: "Galat OTP!" });
        }
    } catch (error) {
        console.error("Verify Error:", error);
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
        console.error("Razorpay Error:", error);
        return res.json({ success: true, order: { id: `dummy_order_${Date.now()}` } }); 
    }
});

// ================= 4. RAZORPAY WEBHOOK (SAVE TICKET) =================
app.post('/razorpay-webhook', (req, res) => {
    try {
        const payload = req.body.payload;
        if(payload && payload.payment && payload.payment.entity) {
            const payment = payload.payment.entity;
            const notes = payment.notes || {};

            const newTicket = {
                payment_id: payment.id,
                amount: `₹${payment.amount / 100}`,
                event_name: notes.event_name || 'Premium Event',
                category: notes.category || 'Entry Pass',
                customer_phone: notes.customer_phone,
                date: notes.date || 'TBD',
                time: notes.time || 'TBD',
                status: 'CONFIRMED'
            };

            ticketsDB.push(newTicket);
            console.log("Ticket Saved Successfully:", newTicket.payment_id);
        }
        res.json({ status: 'ok' });
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).json({ error: "Webhook failed" });
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

// ================= 6. TRANSFER TICKET =================
app.post('/transfer-ticket', (req, res) => {
    try {
        const { paymentId, currentPhone, newPhone, newName } = req.body;
        const ticketIndex = ticketsDB.findIndex(t => t.payment_id === paymentId && t.customer_phone === currentPhone);
        
        if(ticketIndex > -1) {
            ticketsDB[ticketIndex].customer_phone = newPhone;
            return res.json({ success: true, message: `Ticket successfully transferred to ${newName} (${newPhone})` });
        } else {
            return res.status(404).json({ success: false, message: "Ticket not found or unauthorized." });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: "Transfer failed" });
    }
});

// ================= SERVER START =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`EventSphere Master Engine Port ${PORT} par daud raha hai! 🚀`);
});
