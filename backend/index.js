import dotenv from "dotenv";
dotenv.config(); // Load environment variables
import express from "express";
import cors from "cors"; // Import cors
import { prompt } from "./prompt.js";
import { ai } from "./ai.js";

const app = express();

app.use(express.json());
app.use(cors()); // Use cors middleware

app.post("/review", async (req, res) => {
    const {code} = req.body;

    const contents = [
        {text: prompt},
        {text: code}
    ];
    const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents,
  });

    console.log(response)
    res.json({review: response.text});

})

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});