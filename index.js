const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

//TODO: mongoDB ------------------

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tbvw1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    //! database setup--------

    const db = client.db("urbanshelter");
    const apartmentCollection = db.collection("apartments");
    const agreementCollection = db.collection("agreements");

    //!------------------

    //! apartments collection
    app.get("/apartments", async (req, res) => {
      const result = await apartmentCollection.find().toArray();
      res.send(result);
    });

    //! agreements collection
    app.post("/agreements", async (req, res) => {
        const data = req.body;
        try {
            const existingApplication = await agreementCollection.findOne({ 
                email: data.email, 
            });
            if (existingApplication) {
                return res.status(400).json({ message: "(one user will be able to apply for one apartment" });
            }
            const result = await agreementCollection.insertOne(data);
            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({ message: "Something went wrong." });
        }
    });
    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//TODO: mongoDB ------------------

app.get("/", (req, res) => {
  res.send("urban shelter");
});
app.listen(port, () => {
  console.log("urban shelter is running in the port", port);
});
