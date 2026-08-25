const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const twilio = require("twilio");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const xss = require('xss');
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

const accountSid = process.env.twilioAccountSid;
const authToken = process.env.twilioAuthToken;
const twilioNumber = '+16814484190';
const client = twilio(accountSid, authToken);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/binzDB", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB Connected");
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
        process.exit(1);
    }
};
connectDB();

const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        message: "Too many registration attempts. Please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const validateEmail = (email) => {
    return validator.isEmail(email);
};

// Password rules only apply when a password is actually supplied.
// The current frontend runs a no-password demo flow (email as identifier).
const validatePassword = (password) => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return xss(input.trim());
};

const UserSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    password: String,
    state: String,
    phoneNumber: String,
    coins: { type: Number, default: 5 },
});
const User = mongoose.model("User", UserSchema);

app.post("/register", registrationLimiter, async (req, res) => {
    try {
        const { firstName, lastName, email, password, state } = req.body;
        console.log("📥 Received data:", req.body);

        if (!firstName || !lastName || !email || !state) {
            return res.status(400).json({ message: "First name, last name, email and state are required!" });
        }

        const sanitizedFirstName = sanitizeInput(firstName);
        const sanitizedLastName = sanitizeInput(lastName);
        const sanitizedEmail = sanitizeInput(email);
        const sanitizedState = sanitizeInput(state);

        if (!validateEmail(sanitizedEmail)) {
            return res.status(400).json({ message: "Please enter a valid email address!" });
        }

        // Password is optional in demo mode. If one is provided, still enforce strength rules.
        let hashedPassword;
        if (password) {
            if (!validatePassword(password)) {
                return res.status(400).json({
                    message: "Password must be at least 8 characters with uppercase, lowercase, number, and special character!"
                });
            }
            hashedPassword = await bcrypt.hash(password, 12);
        }

        const existingUser = await User.findOne({ email: sanitizedEmail.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists!" });
        }

        const newUser = new User({
            firstName: sanitizedFirstName,
            lastName: sanitizedLastName,
            email: sanitizedEmail.toLowerCase(),
            password: hashedPassword,
            state: sanitizedState,
            coins: 5
        });
        const savedUser = await newUser.save();
        res.status(201).json({
            message: "✅ Registration successful! 5 bonus coins added!",
            User: {
                firstName: savedUser.firstName,
                lastName: savedUser.lastName,
                email: savedUser.email,
                coins: savedUser.coins
            }
        });

    } catch (error) {
        console.error("❌ Error during registration:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: "User already exists!" });
        }
        res.status(500).json({ message: "❌ Server error" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email) {
            return res.status(400).json({ message: "❌ Email is required!" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ message: "❌ Invalid credentials!" });
        }

        // Demo mode: if the account has no password on file, log in by email alone.
        if (user.password) {
            if (!password || !(await bcrypt.compare(password, user.password))) {
                return res.status(400).json({ message: "❌ Invalid credentials!" });
            }
        }

        res.status(200).json({
            message: "✅ Login successful!",
            firstName: user.firstName,
            email: user.email,
            coins: user.coins || 0,
        });
    } catch (error) {
        console.error("❌ Login error:", error);
        res.status(500).json({ message: "❌ Server error" });
    }
});

app.post("/sendSMS", async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber || phoneNumber.length !== 10) {
            return res.status(400).json({ message: "⚠️ Invalid phone number!" });
        }
        const fullPhoneNumber = `+91${phoneNumber}`;
        const message = await client.messages.create({
            body: "Your slot is booked successfully! A Rider will be assigned soon. Thanks For Contacting Us!",
            from: twilioNumber,
            to: fullPhoneNumber,
        });
        console.log("✅ Message sent! SID:", message.sid);
        res.status(200).json({ message: "📩 SMS sent successfully!" });
    } catch (error) {
        console.error("❌ Error sending SMS:", error);
        res.status(500).json({ message: "❌ Failed to send SMS!" });
    }
});

app.post("/storePhoneNumber", async (req, res) => {
    try {
        const { email, phoneNumber } = req.body;
        if (!email || !phoneNumber) {
            return res.status(400).json({ message: "⚠️ Email and Phone Number are required!" });
        }
        const updatedUser = await User.findOneAndUpdate({ email: email.toLowerCase() }, { $set: { phoneNumber } }, { new: true });
        if (!updatedUser) {
            return res.status(404).json({ message: "❌ User not found!" });
        }
        res.status(200).json({ message: "✅ Phone number stored successfully!" });
    } catch (error) {
        console.error("❌ Error storing phone number:", error);
        res.status(500).json({ message: "❌ Server error!" });
    }
});

app.get("/leaderboard", async (req, res) => {
    try {
        const topUsers = await User.find({}).sort({ coins: -1 }).limit(3).select("firstName email coins _id");
        res.status(200).json({ leaderboard: topUsers });
    } catch (error) {
        console.error("❌ Leaderboard Fetch Error:", error);
        res.status(500).json({ message: "❌ Server error" });
    }
});

app.get("/getCoins/:email", async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: "❌ User not found!" });
        }
        res.status(200).json({ coins: user.coins });
    } catch (error) {
        console.error("❌ Error fetching coins:", error);
        res.status(500).json({ message: "❌ Server error!" });
    }
});

// ✅ Reward coins endpoint
app.post("/rewardCoins", async (req, res) => {
    try {
        const { email, coins } = req.body;
        if (!email || typeof coins !== 'number') {
            return res.status(400).json({ message: "⚠️ Email and coins are required!" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: "❌ User not found!" });
        }

        user.coins += coins;
        await user.save();

        res.status(200).json({ message: `✅ ${coins} coins added!`, coins: user.coins });
    } catch (error) {
        console.error("❌ Error updating coins:", error);
        res.status(500).json({ message: "❌ Server error while rewarding coins" });
    }
});

app.get("/register", (req, res) => res.send("✅ Registration Route is Working!"));
app.get("/login", (req, res) => res.send("✅ Login Route is Working!"));

if (!fs.existsSync(path.join(__dirname, "uploads"))) {
    fs.mkdirSync(path.join(__dirname, "uploads"));
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Simulated "processing" — waits 5s, then awards a random coin count (5-10).
// Swap the setTimeout body for a real detector call later without touching the route contract.
app.post("/uploadVideo", upload.single("video"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No video file received." });
        }
        const email = req.body.email;
        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        setTimeout(async () => {
            try {
                const reward = Math.floor(Math.random() * 6) + 5; // random 5-10
                user.coins += reward;
                await user.save();
                res.json({ message: `Cleanup verified! You earned ${reward} coins!`, coins: user.coins });
            } catch (saveError) {
                console.error("❌ Error awarding coins after processing buffer:", saveError);
                res.status(500).json({ message: "Error processing video." });
            }
        }, 5000);
    } catch (error) {
        console.error("❌ Upload error:", error);
        res.status(500).json({ message: "❌ Server error while processing upload." });
    }
});

// ⬛ TICKET SYSTEM
const ticketSchema = new mongoose.Schema({
    name: String,
    email: String,
    eWasteType: String,
    description: String,
    ticketID: String,
    date: { type: Date, default: Date.now }
});

const Ticket = mongoose.model("Ticket", ticketSchema);

app.post("/submit-ticket", async (req, res) => {
    try {
        const { name, email, eWasteType, description } = req.body;
        if (!name || !email || !eWasteType) {
            return res.status(400).json({ message: "Name, email and e-waste type are required." });
        }

        const ticketID = "EW-" + Math.floor(100000 + Math.random() * 900000);
        const newTicket = new Ticket({ name, email, eWasteType, description, ticketID });
        await newTicket.save();

        // Email confirmation is best-effort — ticket creation still succeeds if this fails.
        try {
            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "E-Waste Ticket Confirmation",
                text: `Hello ${name},\n\nYour ticket has been created successfully.\nTicket ID: ${ticketID}\nWe will contact you soon!\n\nThank you!`
            };

            await transporter.sendMail(mailOptions);
        } catch (mailError) {
            console.error("⚠️ Ticket email failed (ticket still created):", mailError.message);
        }

        res.status(200).json({ message: "Ticket created successfully!", ticketID });

    } catch (error) {
        console.error("Error submitting ticket:", error);
        res.status(500).json({ message: "Error submitting ticket" });
    }
});

// ✅ Unified Server Start
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});