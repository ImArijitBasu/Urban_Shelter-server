const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cors = require("cors");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

//TODO: mongoDB ------------------

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const userCollection = db.collection("users");
    const announcementCollection = db.collection("announcements");
    const couponCollection = db.collection('coupons');

    //!------------------
    //! json web token-->
    app.post("/jwt", async (req, res) => {
      const user = req.body; 
      const payload = { email: user.email};
      const token = jwt.sign(payload, process.env.SECRET_TOKEN, { expiresIn: "1d" });
      res.send({ token });
    });
    
    //! MiddleWares

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.SECRET_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    //! users collection
    app.get("/users", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
    app.get("/users/members", verifyToken, async (req, res) => {
      try {
        const members = await userCollection.find({ role: "member" }).toArray();
        res.status(200).send(members); 
      } catch (error) {
        res.status(500).send({ message: "Something went wrong." });
      }
    });
    
    app.patch("/users/remove", async (req, res) => {
      const id = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "user",
        },
      };
      const result = await userCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.get("/users/role/:email", async (req, res) => {
      const { email } = req.params;
      const user = await userCollection.findOne({ email });
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send({ role: user.role });
    });
    app.patch("/users/role", async (req, res) => {
      const { email, role } = req.body;
      const query = { email: email };
      const updatedDoc = {
        $set: {
          role: role,
        },
      };
      const result = await userCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //! apartments collection
    app.get("/apartments", async (req, res) => {
      const result = await apartmentCollection.find().toArray();
      res.send(result);
    });

    //! agreements collection
    app.get("/agreements", verifyToken,async (req, res) => {
      const result = await agreementCollection.find().toArray();
      res.send(result);
    });
    app.post("/agreements", async (req, res) => {
      const data = req.body;
      try {
        const existingApplication = await agreementCollection.findOne({
          email: data.email,
        });
        if (existingApplication) {
          return res.status(400).json({
            message: "(one user will be able to apply for one apartment",
          });
        }
        const result = await agreementCollection.insertOne(data);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ message: "Something went wrong." });
      }
    });
    app.patch("/agreements/update", async (req, res) => {
      const { id, action } = req.body;
      const agreementQuery = { _id: new ObjectId(id) };
      const agreementUpdate = {
        $set: {
          status: "checked",
        },
      };
      const agreementResult = await agreementCollection.updateOne(
        agreementQuery,
        agreementUpdate
      );

      if (action === "accept") {
        const agreement = await agreementCollection.findOne(agreementQuery);
        const userQuery = { email: agreement.email };
        const userUpdate = {
          $set: {
            role: "member",
          },
        };
        const userResult = await userCollection.updateOne(
          userQuery,
          userUpdate
        );
      }
      const deleteAgreement = await agreementCollection.deleteOne(
        agreementQuery
      );
      res.send({ message: "agreement success" });
    });

    //! announcements collection
    app.get('/announcements' , async(req,res) =>{
      const result = await announcementCollection.find().toArray();
      res.send(result)
    })
    app.post('/announcements' , async(req,res)=>{
      const data = req.body;
      const result = announcementCollection.insertOne(data);
      res.send(result);
    })


    //! coupons collection 

    app.get('/coupons' ,verifyToken, async(req,res)=>{
      const coupons = await couponCollection.find().toArray();
      res.send(coupons);
    })
    app.post('/coupons',verifyToken, async(req,res)=>{
      const data = req.body;
      const result = couponCollection.insertOne(data);
      res.send(result);
    })
    app.delete('/coupons/:id',verifyToken,async(req,res)=>{
      const id = req.params;
      const query = {_id : new ObjectId(id)}
      const result = await couponCollection.deleteOne(query)
      res.send(result)
    })
    app.patch('/coupons/:id',verifyToken,async(req,res)=>{
      const id = req.params;
      const query = {_id : new ObjectId(id)}
      const currentCoupon = await couponCollection.findOne(query)
      const updatedDoc = {
        $set:{
          isAvailable : !currentCoupon.isAvailable,
        }
      }
      const result = await couponCollection.updateOne(query , updatedDoc)
      res.send(result)
    })
    //TODO: REMOVE BEFORE DEPLOY =>
    //  Send a ping to confirm a successful connection
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
