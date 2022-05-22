const express = require("express");
const cors = require("cors");
jwt = require('jsonwebtoken');
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.olru2.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized Access" });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "Forbidden Access" });
        }
        req.decoded = decoded;
        next();
    });
}


async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db("doctors_portal").collection("services");
        const bookingCollection = client.db("doctors_portal").collection("bookings");
        const userCollection = client.db("doctors_portal").collection("users");
        app.get("/service", async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })

        app.get("/user", verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);

        })
        // =================================Admin============
        app.put("/user/admin/:email", async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: "admin" },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result)
        })
        // ===========================================User============
        app.put("/user/:email", async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const option = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, option);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.send({ result, token })
        })

        // this is not the proper way ..use mongodb lookup aggregation,pipeline,group
        app.get("/available", async (req, res) => {
            const date = req.query.date || "May 21, 2022";
            // 1. get all services
            const services = await serviceCollection.find().toArray();
            // 2.get the booking of that date
            const query = { date: date }
            const bookings = await bookingCollection.find(query).toArray();

            // 3.for each service
            services.forEach(service => {
                // 4.find booking for that sevice:[{}, {}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // 5.Select slot for the serviceBookings:[" ", " ", " "]
                const bookedSlots = serviceBookings.map(b => b.slot);
                // 6.select those slot that are not in booked slot:[" ", " ", " "]
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                // 7.set available slots to service
                service.slots = available
            })

            res.send(services)
        })

        /**
         * Api Naming 
         * app.get("/booking") // get all booking
         * app.get("/booking/:id") // get a specific booking
         * app.post("/booking") // add a new booking
         * app.patch("/booking/:id") // 
         * app.put("/booking/:id") // upsert ==> update or insert
         * app.delete("/booking/:id") //
         */

        app.get('/booking', verifyJWT, async (req, res) => {
            const patientEmail = req.query.patientEmail;
            const decodedEmail = req.decoded.email;
            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            } else {
                return res.status(403).send({ message: "Forbidden Access" });
            }

        })


        app.post("/booking", async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patientName: booking.patientName };
            const exist = await bookingCollection.findOne(query);
            if (exist) {
                return res.send({ success: false, booking: exist });
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });

        })

    } finally {

    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Welcome To Doctors Portal");
})

app.listen(port, () => {
    console.log("Doctors Portal Server is Running at port:", port);
})


