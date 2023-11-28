const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: "Unauthorized Access" })
    }
    const token = authorization.split(' ')[1];
    jwt.verify(token, process.env.SECRECT_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: "Unauthorized Access" });
        }
        req.decoded = decoded;
        next();
    })
}

app.get("/", (req, res) => {
    res.send("Server Is running")
})


// mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.zvd8xno.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        client.connect();

        const userCollections = client.db("oes").collection("users");
        const quizCollections = client.db("oes").collection("quizs");
        const participateCollections = client.db("oes").collection("participatequiz");

        //  Generate JWT TOken

        app.post("/jwt", (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.SECRECT_TOKEN, { expiresIn: "1h" });
            res.send({ token });

        })

        // Verify admin midleware
        const verifyAdmin = async (req, res, next) => {
            const email = req?.decoded?.email;
            const query = { email: email };
            const result = await userCollections.findOne(query);
            if (result?.role !== 'admin') {
                return res.status(401).send({ error: true, message: "forbidden access" });
            }
            next();
        }

        // Check Admin Role

        app.get('/users/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;

            // check the requested person is authorized or not
            if (email !== req?.decoded?.email) {
                // Return after sending the response
                return res.send({ admin: false });
            }

            // Here is the second response
            const query = { email: email };
            const user = await userCollections.findOne(query);
            const result = { admin: user?.role === 'admin' }

            // Send the response once
            res.send(result);
        });






        // Verify instructor midleware
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const result = await userCollections.findOne(query);
            if (result?.role !== 'instructor') {
                return res.status(401).send({ error: true, message: "forbidden access" });
            }
            next();
        }



        // create user
        app.post("/adduser", async (req, res) => {
            const userDetails = req.body;
            const query = { email: userDetails.email };
            const existingUser = await userCollections.findOne(query);
            if (existingUser) {
                return res.send({ message: "User Already Exist" });
            }
            const result = await userCollections.insertOne(userDetails);
            res.send(result);
        })



        /*********************  This all are the user api  start***************/
        app.get("/users", async (req, res) => {
            const result = await userCollections.find().toArray();
            res.send(result);
        })

        // Add Quiz

        app.post("/addQuiz", async (req, res) => {
            const quizData = req.body;
            const result = await quizCollections.insertOne(quizData);
            res.status(200).send(result);
        })

        // QUIZ Collection GET API

        app.get("/quiz", async (req, res) => {
            const result = await quizCollections.find({ status: true }).toArray();
            res.send(result);
        });

        // GET Quiz by Email ID
        app.get("/individualQuiz/:email", async (req, res) => {
            const email = req.params.email;
            const result = await quizCollections.find({ assignerEmail: email }).toArray();
            res.send(result);
        });

        // Single Quiz collection GET API
        app.get("/quizdetails/:id", async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) };

            const result = await quizCollections.findOne(query);
            res.send(result);
        })

        app.post("/participant", async (req, res) => {
            const quizResult = req.body;
            const result = await participateCollections.insertOne(quizResult);
            res.send(result);
        })
        // Participant GET API
        app.get("/participantList", async (req, res) => {
            const result = await participateCollections.find().toArray();
            res.send(result);
        })
        // GET Quiz Result by inserted id
        app.get("/quizscore/:insertedid", async (req, res) => {
            const insertedID = req.params.insertedid;
            const query = { _id: new ObjectId(insertedID) }
            const result = await participateCollections.findOne(query);
            res.send(result);
        })

        // Question PATCH APIS
        app.patch("/addQuestions/:quizId", verifyJWT, verifyAdmin, async (req, res) => {
            const quizId = req.params.quizId;
            const newQuestionData = req.body;

            const result = await quizCollections.updateOne(
                { _id: new ObjectId(quizId) },
                { $push: { questions: newQuestionData } }
            );

            res.send(result);
        });


        // Question Delete API
        app.patch("/deleteQuestion/:quizId", verifyJWT, verifyAdmin, async (req, res) => {
            const quizId = req.params.quizId;
            const { deletedQuestion } = req.body;

            try {
                const existingQuizData = await quizCollections.findOne({ _id: new ObjectId(quizId) });

                if (!existingQuizData) {
                    return res.status(404).json({ message: "Quiz not found" });
                }

                // Filter out the deleted question based on its properties
                const updatedQuestions = existingQuizData.questions.filter(
                    (question) => JSON.stringify(question) !== JSON.stringify(deletedQuestion)
                );

                const updatedQuizData = {
                    questions: updatedQuestions,
                };

                const result = await quizCollections.updateOne(
                    { _id: new ObjectId(quizId) },
                    { $set: updatedQuizData }
                );

                res.json(result);
            } catch (error) {
                console.error("Error deleting question:", error);
                res.status(500).json({ message: "Internal Server Error" });
            }
        });


        // Quiz Delete API
        app.delete("/deleteQuiz/:quizId", async (req, res) => {
            const quizId = req.params.quizId;

            try {
                // Perform the deletion operation based on the quizId
                const result = await quizCollections.deleteOne({ _id: new ObjectId(quizId) });

                if (result.deletedCount === 1) {
                    res.status(200).json({ message: "Quiz deleted successfully" });
                } else {
                    res.status(404).json({ message: "Quiz not found" });
                }
            } catch (error) {
                console.error("Error deleting quiz:", error);
                res.status(500).json({ message: "Internal Server Error" });
            }
        });

        // Assuming you're using Express.js
        app.patch("/publishQuiz/:quizId", async (req, res) => {
            const quizId = req.params.quizId;
            const currentStatus = req.body.currentStatus;

            try {
                // Toggle the quiz status
                const result = await quizCollections.updateOne(
                    { _id: new ObjectId(quizId) },
                    { $set: { status: !currentStatus } }
                );

                if (result.modifiedCount === 1) {
                    res.status(200).json({ message: "Quiz status toggled successfully" });
                } else {
                    res.status(404).json({ message: "Quiz not found" });
                }
            } catch (error) {
                console.error("Error toggling quiz status:", error);
                res.status(500).json({ message: "Internal Server Error" });
            }
        });






        // Leader board Particular User GET API 

        app.get("/ranking/:userEmail", async (req, res) => {
            const email = req.params.userEmail;
            const pipeline = [
                { $match: { participantEmail: email } },
                {
                    $group: {
                        _id: '$participantEmail',
                        totalPoints: { $sum: '$points' },
                        totalCorrectAnswers: { $sum: '$correctAnswers' },
                        totalQuizResults: { $sum: 1 },
                    },
                },
            ];

            try {
                const quizResultsSummary = await participateCollections.aggregate(pipeline).toArray();
                res.send(quizResultsSummary);
            } catch (error) {
                console.error(error);
                res.status(500).send("Internal Server Error");
            }
        });

        // Leader board All User GET API 
        app.get("/leaderboard", async (req, res) => {
            const pipeline = [
                {
                    $group: {
                        _id: '$participantEmail',
                        totalPoints: { $sum: '$points' },
                        totalCorrectAnswers: { $sum: '$correctAnswers' },
                        totalQuizResults: { $sum: 1 },
                        name: { $first: '$name' }
                    },
                },
                {
                    $project: {
                        _id: 0,
                        participantEmail: '$_id',
                        totalPoints: 1,
                        totalCorrectAnswers: 1,
                        totalQuizResults: 1,
                        name: 1
                    },
                },
                {
                    $sort: { totalPoints: -1 } // Sort by totalPoints in descending order
                }
            ];

            try {
                const quizResultsSummary = await participateCollections.aggregate(pipeline).toArray();
                res.send(quizResultsSummary);
            } catch (error) {
                console.error(error);
                res.status(500).send("Internal Server Error");
            }
        });









        // single user email query for checking user role
        app.get("/users/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await userCollections.findOne(query);
            res.send(result);
        })




        // Send a ping to confirm a successful connection
        client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`http://localhost:${port}`)
})