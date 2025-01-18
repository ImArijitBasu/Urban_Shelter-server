const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const couponCollection = db.collection("coupons");
    const paymentCollection = db.collection("payments");

    //!------------------
    //! json web token-->
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const payload = { email: user.email };
      const token = jwt.sign(payload, process.env.SECRET_TOKEN, {
        expiresIn: "1d",
      });
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
      const { user } = req.body;

      const userQuery = { _id: new ObjectId(user._id) };
      const userUpdate = {
        $set: {
          role: "user",
        },
      };

      //!1
      const result = await userCollection.updateOne(userQuery, userUpdate);

      //!2
      const agreementQuery = { email: user.email };
      const agreement = await agreementCollection.findOne(agreementQuery);
      const agreementRemove = await agreementCollection.deleteOne(
        agreementQuery
      );
      //!3
      if (agreement) {
        const apartmentQuery = { apartmentNo: agreement.apartmentNo };
        const apartmentUpdate = {
          $set: {
            booked: false,
          },
        };
        const apartmentResult = await apartmentCollection.updateOne(
          apartmentQuery,
          apartmentUpdate
        );
      } else {
        console.log("No agreements found for this user.");
      }

      res.send({ result, agreementRemove });
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
    app.get("/bannerApartments", async (req, res) => {
      const result = await apartmentCollection.find().sort({rent: -1}).limit(10).toArray();
      res.send(result);
    });
    app.get("/apartments/:email", async (req, res) => {
      const email = req.params;
    });

    //! agreements collection
    app.get("/agreements", verifyToken, async (req, res) => {
      const result = await agreementCollection
        .find({ status: "pending" })
        .toArray();
      res.send(result);
    });
    app.get("/agreement/:email", async (req, res) => {
      const { email } = req.params;
      const query = { email: email };
      const agreement = await agreementCollection.findOne(query);
      if (agreement && agreement.status === "checked") {
        res.send(agreement);
      } else {
        res.send({});
      }
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
      const { id, action, acceptDate } = req.body;
      const agreementQuery = { _id: new ObjectId(id) };
      const agreementUpdate = {
        $set: {
          status: "checked",
          acceptDate: acceptDate,
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
        const apartmentQuery = { apartmentNo: agreement.apartmentNo };
        const apartmentUpdate = {
          $set: {
            booked: true,
          },
        };
        const bookApartment = await apartmentCollection.updateOne(
          apartmentQuery,
          apartmentUpdate
        );
      }
      if (action === "reject") {
        const deleteAgreement = await agreementCollection.deleteOne(
          agreementQuery
        );
      }

      res.send({ message: "agreement success" });
    });

    //! announcements collection
    app.get("/announcements", async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });
    app.post("/announcements", async (req, res) => {
      const data = req.body;
      const result = announcementCollection.insertOne(data);
      res.send(result);
    });

    //! coupons collection

    app.get("/coupons", async (req, res) => {
      const coupons = await couponCollection.find().toArray();
      res.send(coupons);
    });
    app.post("/coupons", verifyToken, async (req, res) => {
      const data = req.body;
      const result = couponCollection.insertOne(data);
      res.send(result);
    });
    app.delete("/coupons/:id", verifyToken, async (req, res) => {
      const id = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await couponCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/coupons/:id", verifyToken, async (req, res) => {
      const id = req.params;
      const query = { _id: new ObjectId(id) };
      const currentCoupon = await couponCollection.findOne(query);
      const updatedDoc = {
        $set: {
          isAvailable: !currentCoupon.isAvailable,
        },
      };
      const result = await couponCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    //! payments collection

    app.post("/coupons/apply", async (req, res) => {
      const { code } = req.body;
      const query = { couponCode: code };
     try{
      const coupon = await couponCollection.findOne(query);
      if (coupon) {
        //TODO : coupon is valid ........ next ->
        if (coupon.isAvailable) {
          //todo checks if the coupon is available
          //TODO send a valid response to user
          res.send({
            status: "success",
            statusCode: 200,
            message: "coupon is valid and available",
            coupon: coupon,
          });
        } else {
          //todo if not available
          //TODO coupon isn't available
          res.send({
            status: "error",
            statusCode: 400,
            message: "Coupon is not available",
          });
        }
      } else {
        //TODO: coupon isn't valid
        res.send({
          status: "Not found",
          statusCode: 404,
          message: "invalid coupon",
        });
      }
     }
     catch(error){
      res.send({
        status: "error",
        statusCode: 500,
        message: 'something went wrong'
      })
     }
    });

    //! dashboard stats
    app.get("/dashboard/stats", verifyToken, async (req, res) => {
      try {
        const totalRooms = await apartmentCollection.estimatedDocumentCount();
        const availableRooms = await apartmentCollection.countDocuments({
          booked: false,
        });
        const bookedRooms = await apartmentCollection.countDocuments({
          booked: true,
        });
        const availablePercentage = totalRooms
          ? ((availableRooms / totalRooms) * 100).toFixed(2)
          : 0;
        const bookedPercentage = totalRooms
          ? ((bookedRooms / totalRooms) * 100).toFixed(2)
          : 0;

        const totalUsers = await userCollection.estimatedDocumentCount();

        const totalMembers = await userCollection.countDocuments({
          role: "member",
        });

        const stats = {
          totalRooms,
          availablePercentage,
          bookedPercentage,
          totalUsers,
          totalMembers,
        };
        res.send(stats);
      } catch (error) {
        res.status(500).send({ error: "Failed to Fetch Stats data" });
      }
    });

    //! stripe 
    //payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      //! stripe calculates in paisa
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.get("/payments/:email" ,verifyToken, async(req,res)=>{
      const query = {email: req.params.email};
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result)
    })
    app.post('/payments' , async(req,res)=>{
      const payment = req.body;
      const paymentResult =  await paymentCollection.insertOne(payment);
      res.send({paymentResult})
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
